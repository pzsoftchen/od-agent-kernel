/**
 * Agent Orchestrator — the main entry point for agent execution.
 *
 * Provides a unified interface for agent detection, capability querying,
 * and running prompts through any supported agent. Uses real stream parsers
 * (claude-stream, qoder-stream, json-event-stream), real agent detection
 * via detectAgents(), and proper subprocess management with cancel support.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { DetectedAgent, RuntimeEnv } from './types.js';
import type { RuntimeModuleDeps } from './deps.js';
import { resolveDeps } from './deps.js';
import { applyAgentLaunchEnv, resolveAgentLaunch } from './launch.js';
import { spawnEnvForAgent } from './env.js';
import { detectAgents } from './detection.js';
import { getAgentDef } from './defs/index.js';
import { resolveAgentBin } from './resolution.js';
import { agentBinEnvKey } from './executables.js';
import { agentCapabilities } from './capabilities.js';
import { createClaudeStreamHandler } from './claude-stream.js';
import { createQoderStreamHandler } from './qoder-stream.js';
import { createJsonEventStreamHandler } from './json-event-stream.js';
import { checkPromptArgvBudget } from './prompt-budget.js';

// ---- Agent Event types ----

/** Unified event type emitted during agent execution. */
export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; name: string; input: unknown; id: string }
  | { type: 'tool_result'; id: string; output: unknown }
  | { type: 'text_delta'; text: string }
  | { type: 'file_write'; path: string }
  | { type: 'error'; error: string }
  | { type: 'done'; reason: 'completed' | 'cancelled' | 'error' };

// ---- Agent Capabilities ----

export interface AgentCapabilities {
  surgicalEdit: boolean;
  nativeSkillLoading: boolean;
  streaming: boolean;
  resume: boolean;
  permissionMode: 'strict' | 'permissive' | 'none';
  contextWindowHint?: number;
}

// ---- Orchestrator Run Input ----

export interface AgentRunInput {
  agentId: string;
  systemPrompt: string;
  userPrompt: string;
  cwd: string;
  extraDirs?: string[];
  model?: string;
  reasoning?: string;
  /**
   * Optional run ID for correlating orchestrator runs with run-service runs.
   * When provided, this ID is used for cancel() lookup.
   * When omitted, a random ID is generated internally.
   */
  runId?: string;
}

// ---- Orchestrator Interface ----

export interface AgentOrchestrator {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
  listAgents(): Promise<DetectedAgent[]>;
  getCapabilities(agentId: string): AgentCapabilities;
  cancel(runId: string): Promise<void>;
}

// ---- Internal state ----

interface ActiveRun {
  child: ChildProcess;
  agentId: string;
  sigkillTimer?: ReturnType<typeof setTimeout>;
  /** Shared ref so the close handler and cancel() agree on whether SIGTERM was intentional. */
  cancelRef: { cancelled: boolean };
}

// ---- Factory ----

export interface CreateAgentOrchestratorOptions {
  deps?: RuntimeModuleDeps;
  /** Max buffer size for stderr collection (default 64KB). */
  stderrMaxBytes?: number;
}

export function createAgentOrchestrator(
  options: CreateAgentOrchestratorOptions = {},
): AgentOrchestrator {
  const deps = resolveDeps(options.deps);
  const stderrMaxBytes = options.stderrMaxBytes ?? 64 * 1024;

  const activeRuns = new Map<string, ActiveRun>();

  let cachedAgents: DetectedAgent[] | null = null;
  let detectionPromise: Promise<DetectedAgent[]> | null = null;

  /** Build configuredEnv from process.env *_BIN overrides for the given agent. */
  function buildConfiguredEnv(agentId: string): Record<string, string> {
    const out: Record<string, string> = {};
    const binKey = agentBinEnvKey(agentId);
    if (binKey && process.env[binKey]?.trim()) {
      out[binKey] = process.env[binKey]!.trim();
    }
    // VELA-specific overrides
    if (agentId === 'amr') {
      if (process.env.VELA_BIN?.trim()) out.VELA_BIN = process.env.VELA_BIN.trim();
      if (process.env.VELA_OPENCODE_BIN?.trim())
        out.VELA_OPENCODE_BIN = process.env.VELA_OPENCODE_BIN.trim();
    }
    return out;
  }

  function clearSigkill(runId: string) {
    const active = activeRuns.get(runId);
    if (active?.sigkillTimer) {
      clearTimeout(active.sigkillTimer);
      active.sigkillTimer = undefined;
    }
  }

  const orchestrator: AgentOrchestrator = {
    async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
      const def = getAgentDef(input.agentId);
      if (!def) {
        yield { type: 'error', error: `Unknown agent: ${input.agentId}` };
        yield { type: 'done', reason: 'error' };
        return;
      }

      // ---- Resolve binary path with *_BIN overrides ----
      const configuredEnv = buildConfiguredEnv(input.agentId);
      const binPath = resolveAgentBin(input.agentId, configuredEnv);

      // ---- Build spawn environment ----
      // Always start from process.env so the child inherits PATH, HOME, etc.
      const launch = resolveAgentLaunch(def, configuredEnv);
      const baseEnv: RuntimeEnv = {
        ...process.env,
        ...(def.env || {}),
        ...configuredEnv,
      };
      const env = applyAgentLaunchEnv(
        spawnEnvForAgent(def.id, baseEnv, configuredEnv, undefined, {}, def),
        launch,
      );

      // ---- Build CLI arguments ----
      const args = def.buildArgs(
        input.systemPrompt,
        [],
        input.extraDirs,
        { model: input.model, reasoning: input.reasoning },
        { cwd: input.cwd },
      );

      // ---- Prompt budget check (before spawn) ----
      const budgetErr = checkPromptArgvBudget(def, input.systemPrompt);
      if (budgetErr) {
        yield { type: 'error', error: budgetErr.message };
        yield { type: 'done', reason: 'error' };
        return;
      }

      const executable = binPath ?? def.bin;
      // Use caller-provided runId for correlation with run-service
      const runId =
        input.runId ?? randomUUID();

      yield { type: 'thinking', text: `Starting ${def.name}...` };

      // ---- Determine stream parser ----
      const sf = def.streamFormat;
      let streamKind: 'claude' | 'qoder' | 'json' | 'raw' = 'raw';

      if (sf === 'stream-json' && def.eventParser === 'claude-stream') {
        streamKind = 'claude';
      } else if (sf === 'stream-json' && def.eventParser === 'qoder-stream') {
        streamKind = 'qoder';
      } else if (['stream-json', 'json', 'acp-json-rpc'].includes(sf)) {
        streamKind = 'json';
      }

      // ---- Cancellation ref (shared with cancel()) ----
      const cancelRef = { cancelled: false };

      try {
        // ---- Spawn ----
        const child = spawn(executable, args, {
          cwd: input.cwd,
          env: { ...process.env, ...env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        activeRuns.set(runId, { child, agentId: def.id, cancelRef });

        // stdin for prompt-via-stdin agents
        if (def.promptViaStdin && child.stdin) {
          child.stdin.on('error', (err) => {
            // EPIPE if child closes stdin before we finish writing —
            // capture so it doesn't crash the process as an unhandled error.
            if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
              console.error(`[orchestrator] stdin error for ${def.id}:`, err.message);
            }
          });
          child.stdin.write(`${input.systemPrompt}\n\n${input.userPrompt}\n`);
          child.stdin.end();
        }

        // ---- stderr collection ----
        const stderrRef = { value: '' };
        if (child.stderr) {
          child.stderr.on('data', (chunk: Buffer) => {
            if (stderrRef.value.length < stderrMaxBytes) {
              stderrRef.value += chunk.toString();
            }
          });
          child.stderr.on('error', (err) => {
            // Stream errors (e.g. pipe overflow) should not crash the process.
            console.error(`[orchestrator] stderr error for ${def.id}:`, err.message);
          });
        }

        // ---- Stream parser setup ----
        const eventQueue: AgentEvent[] = [];
        const stateRef = { ended: false, error: null as Error | null };
        let pendingWake: (() => void) | null = null;

        const fireWake = () => {
          if (pendingWake) {
            const w = pendingWake;
            pendingWake = null;
            w();
          }
        };

        const onStreamEvent = (ev: Record<string, unknown>) => {
          const agentEvent = convertStreamEvent(ev);
          if (agentEvent) {
            eventQueue.push(agentEvent);
            fireWake();
          }
        };

        let handler: { feed: (chunk: string) => void; flush: () => void };
        switch (streamKind) {
          case 'claude':
            handler = createClaudeStreamHandler(onStreamEvent);
            break;
          case 'qoder':
            handler = createQoderStreamHandler(onStreamEvent);
            break;
          case 'json':
            handler = createJsonEventStreamHandler(def.id, onStreamEvent);
            break;
          default:
            handler = {
              feed(chunk: string) {
                for (const line of chunk.split('\n')) {
                  const t = line.trim();
                  if (!t) continue;
                  try {
                    onStreamEvent(JSON.parse(t));
                  } catch {
                    eventQueue.push({ type: 'text_delta', text: t });
                    fireWake();
                  }
                }
              },
              flush() {},
            };
        }

        if (child.stdout) {
          child.stdout.on('data', (chunk: Buffer) => {
            handler.feed(chunk.toString());
          });
          child.stdout.on('error', (err) => {
            console.error(`[orchestrator] stdout error for ${def.id}:`, err.message);
          });
        }

        // ---- Process lifecycle handlers ----
        child.on('close', (code, signal) => {
          handler.flush();
          if (signal && signal !== 'SIGTERM') {
            stateRef.error = new Error(`Agent killed by signal ${signal}`);
          } else if (signal === 'SIGTERM' && cancelRef.cancelled) {
            // Intentional cancellation — leave stateRef.error null so the
            // post-loop cleanup yields done:cancelled, not done:completed.
          } else if (code !== 0 && code !== null) {
            const tail = stderrRef.value
              ? ': ' + stderrRef.value.slice(-500)
              : '';
            stateRef.error = new Error(
              `${def.name} exited with code ${code}${tail}`,
            );
          }
          stateRef.ended = true;
          fireWake();
        });

        child.on('error', (err) => {
          stateRef.error = err;
          stateRef.ended = true;
          fireWake();
        });

        // ---- Race-condition-free drain loop ----
        // Pattern: create wake promise BEFORE checking queue emptiness.
        // If an event arrives between the queue drain and promise creation,
        // the re-check inside the Promise constructor catches it.
        try {
          while (true) {
            // Drain all buffered events
            while (eventQueue.length > 0) {
              yield eventQueue.shift()!;
            }

            if (stateRef.ended) break;

            // Create wake promise with re-check to close the race window
            await new Promise<void>((resolve) => {
              pendingWake = resolve;
              // An event may have landed after our queue drain above but before
              // we set pendingWake.  If so, resolve immediately.
              if (eventQueue.length > 0 || stateRef.ended) {
                pendingWake = null;
                resolve();
              }
            });
          }
        } finally {
          // Always clean up, even if consumer breaks from for-await loop.
          // Without this, sigkill timers leak and activeRuns grows unbounded.
          clearSigkill(runId);
          activeRuns.delete(runId);
        }

        // ---- Cleanup (already done in finally above) ----

        if (cancelRef.cancelled) {
          yield { type: 'done', reason: 'cancelled' };
        } else if (stateRef.error) {
          yield { type: 'error', error: stateRef.error.message };
          yield { type: 'done', reason: 'error' };
        } else {
          yield { type: 'done', reason: 'completed' };
        }
      } catch (err) {
        clearSigkill(runId);
        activeRuns.delete(runId);
        if (cancelRef.cancelled) {
          yield { type: 'done', reason: 'cancelled' };
        } else {
          yield {
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          };
          yield { type: 'done', reason: 'error' };
        }
      }
    },

    async listAgents(): Promise<DetectedAgent[]> {
      if (cachedAgents) return cachedAgents;
      if (detectionPromise) return detectionPromise;

      detectionPromise = detectAgents().then((agents) => {
        cachedAgents = agents;
        return agents;
      });

      return detectionPromise;
    },

    getCapabilities(agentId: string): AgentCapabilities {
      const def = getAgentDef(agentId);
      const flags = def?.capabilityFlags ?? {};
      const liveCaps = agentCapabilities.get(agentId);
      const merged = liveCaps
        ? {
            ...flags,
            ...Object.fromEntries(
              Object.entries(liveCaps).map(([k, v]) => [k, String(v)]),
            ),
          }
        : flags;
      return {
        surgicalEdit: merged.surgicalEdit === 'true',
        nativeSkillLoading: merged.nativeSkillLoading === 'true',
        streaming: merged.streaming === 'true',
        resume: merged.resume === 'true',
        permissionMode:
          (merged.permissionMode as 'strict' | 'permissive' | 'none') || 'none',
        contextWindowHint: def?.maxPromptArgBytes
          ? Math.round(def.maxPromptArgBytes / 4)
          : undefined,
      };
    },

    async cancel(runId: string): Promise<void> {
      const active = activeRuns.get(runId);
      if (!active) return;

      // Mark as cancelled so the close handler + drain loop yield
      // done:cancelled instead of done:completed.
      active.cancelRef.cancelled = true;

      try {
        active.child.kill('SIGTERM');
        const timer = setTimeout(() => {
          if (active.child.exitCode === null) {
            try {
              active.child.kill('SIGKILL');
            } catch {
              // Already gone
            }
          }
        }, 5000);
        active.sigkillTimer = timer;
      } catch {
        // Already exited
      }
      // Don't delete from activeRuns here — the drain-loop cleanup in run()
      // will call clearSigkill() + activeRuns.delete() when the child exits.
    },
  };

  return orchestrator;
}

// ---- Stream event conversion ----

function convertStreamEvent(ev: Record<string, unknown>): AgentEvent | null {
  const type = ev.type as string | undefined;

  switch (type) {
    case 'text_delta':
      return {
        type: 'text_delta',
        text: typeof ev.delta === 'string'
          ? ev.delta
          : typeof ev.text === 'string'
            ? ev.text
            : '',
      };
    case 'thinking_delta':
      return {
        type: 'thinking' as const,
        text: typeof ev.delta === 'string' ? ev.delta : '',
      };
    case 'tool_use':
      return {
        type: 'tool_call' as const,
        name: typeof ev.name === 'string' ? ev.name : 'unknown',
        input: ev.input ?? null,
        id: typeof ev.id === 'string' ? ev.id : '',
      };
    case 'tool_result':
      return {
        type: 'tool_result' as const,
        id: typeof ev.toolUseId === 'string' ? ev.toolUseId : '',
        output: ev.content ?? null,
      };
    case 'error': {
      const msg = (ev as Record<string, unknown>).message;
      return {
        type: 'error' as const,
        error: typeof msg === 'string' ? msg : 'Unknown agent error',
      };
    }
    case 'status':
    case 'thinking_start':
    case 'usage':
    case 'raw':
    case 'turn_end':
    case 'fabricated_role_marker':
    case 'tool_input_delta':
      return null;
    default:
      if (typeof ev.delta === 'string') {
        return { type: 'text_delta', text: ev.delta };
      }
      return null;
  }
}

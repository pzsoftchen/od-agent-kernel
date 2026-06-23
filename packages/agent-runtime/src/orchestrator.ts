/**
 * Agent Orchestrator — the main entry point for agent execution.
 *
 * Provides a unified interface for agent detection, capability querying,
 * and running prompts through any supported agent.
 */

import type { DetectedAgent, RuntimeAgentDef } from './types.js';
import type { RuntimeModuleDeps } from './deps.js';
import { resolveDeps } from './deps.js';
import { AGENT_DEFS } from './defs/index.js';

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

/** Bitmap of agent capabilities — drives UI adaptive rendering. */
export interface AgentCapabilities {
  /** Agent supports precise surgical edits (vs full-file rewrites). */
  surgicalEdit: boolean;
  /** Agent natively loads SKILL.md files. */
  nativeSkillLoading: boolean;
  /** Agent supports real-time streaming of responses. */
  streaming: boolean;
  /** Agent can resume interrupted sessions. */
  resume: boolean;
  /** Default permission mode for agent operations. */
  permissionMode: 'strict' | 'permissive' | 'none';
  /** Estimated context window size in tokens (if known). */
  contextWindowHint?: number;
}

// ---- Orchestrator Run Input ----

export interface AgentRunInput {
  /** Agent identifier (e.g. 'claude', 'copilot'). */
  agentId: string;
  /** Fully composed system prompt. */
  systemPrompt: string;
  /** User message / request. */
  userPrompt: string;
  /** Working directory for the agent subprocess. */
  cwd: string;
  /** Additional directories the agent can access. */
  extraDirs?: string[];
  /** Model identifier override. */
  model?: string;
  /** Reasoning effort level override. */
  reasoning?: string;
}

// ---- Orchestrator Interface ----

export interface AgentOrchestrator {
  /**
   * Run a prompt through an agent.
   * Returns an async iterable of AgentEvent for SSE streaming.
   */
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;

  /** List all detected agents with availability status. */
  listAgents(): Promise<DetectedAgent[]>;

  /** Get capability flags for a specific agent. */
  getCapabilities(agentId: string): AgentCapabilities;

  /** Cancel a running agent execution. */
  cancel(runId: string): Promise<void>;
}

// ---- Factory ----

export interface CreateAgentOrchestratorOptions {
  /** Dependency injection for design-specific integrations. */
  deps?: RuntimeModuleDeps;
}

/**
 * Create an AgentOrchestrator instance.
 *
 * This is the main factory function. It wires together agent definitions,
 * detection, launch, stream parsing, and run lifecycle management.
 */
export function createAgentOrchestrator(
  options: CreateAgentOrchestratorOptions = {},
): AgentOrchestrator {
  const deps = resolveDeps(options.deps);

  const orchestrator: AgentOrchestrator = {
    async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
      const def = AGENT_DEFS.find((d: RuntimeAgentDef) => d.id === input.agentId);
      if (!def) {
        yield { type: 'error', error: `Unknown agent: ${input.agentId}` };
        yield { type: 'done', reason: 'error' };
        return;
      }

      yield { type: 'thinking', text: `Starting ${def.name}...` };

      try {
        // Build CLI arguments from the agent definition
        const args = def.buildArgs(
          input.systemPrompt,
          [],
          input.extraDirs,
          { model: input.model, reasoning: input.reasoning },
          { cwd: input.cwd },
        );

        // Execute the agent via child_process
        const { execAgentFile } = await import('./invocation.js');
        const result = await execAgentFile(def.bin, args, {
          cwd: input.cwd,
          timeout: def.inactivityTimeoutMs ?? 600_000,
        } as import('node:child_process').ExecFileOptions);

        if (result.stdout) {
          // Parse stream-json format output
          const lines = result.stdout.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'assistant' && event.message?.content) {
                for (const block of event.message.content) {
                  if (block.type === 'text') {
                    yield { type: 'text_delta', text: block.text };
                  } else if (block.type === 'tool_use') {
                    yield {
                      type: 'tool_call',
                      name: block.name,
                      input: block.input,
                      id: block.id,
                    };
                  }
                }
              }
            } catch {
              // Non-JSON line — emit as raw text_delta
              if (line.trim()) {
                yield { type: 'text_delta', text: line };
              }
            }
          }
        }

        yield { type: 'done', reason: 'completed' };
      } catch (err) {
        yield {
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
        yield { type: 'done', reason: 'error' };
      }
    },

    async listAgents(): Promise<DetectedAgent[]> {
      return AGENT_DEFS.map((def: RuntimeAgentDef) => ({
        id: def.id,
        name: def.name,
        bin: def.bin,
        models: def.fallbackModels,
        modelsSource: 'fallback' as const,
        available: true,
        streamFormat: def.streamFormat,
        versionArgs: def.versionArgs,
        reasoningOptions: def.reasoningOptions ?? [],
        supportsImagePaths: def.supportsImagePaths ?? false,
        supportsCustomModel: def.supportsCustomModel,
        installUrl: def.installUrl,
        docsUrl: def.docsUrl,
        externalMcpInjection: def.externalMcpInjection,
      }));
    },

    getCapabilities(agentId: string): AgentCapabilities {
      const def = AGENT_DEFS.find((d: RuntimeAgentDef) => d.id === agentId);
      const flags = def?.capabilityFlags ?? {};
      return {
        surgicalEdit: flags.surgicalEdit === 'true',
        nativeSkillLoading: flags.nativeSkillLoading === 'true',
        streaming: flags.streaming === 'true',
        resume: flags.resume === 'true',
        permissionMode: (flags.permissionMode as 'strict' | 'permissive' | 'none') || 'none',
        contextWindowHint: def ? undefined : undefined,
      };
    },

    async cancel(_runId: string): Promise<void> {
      // Cancel is handled at the run-service level via signalChild
    },
  };

  return orchestrator;
}

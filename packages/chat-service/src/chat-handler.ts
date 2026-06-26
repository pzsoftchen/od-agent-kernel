/**
 * Parameterized chat handler.
 * Extracted from apps/daemon/src/server.ts startChatRun logic.
 *
 * The handler supports two modes:
 * 1. With orchestrator: spawns a real agent subprocess and streams SSE events
 * 2. Without orchestrator: echoes the system prompt (test/development mode)
 *
 * Error handling contract (per design doc §3.4):
 *   - resolveContext/resolveWorkflow return null → silently skip (not an error)
 *   - resolveContext/resolveWorkflow THROW → HTTP 400 (don't start agent)
 *   - composePrompt THROWS → HTTP 500 (don't start agent)
 *   - Agent crashes after SSE starts → SSE error event
 */

import { Router } from 'express';
import type { DaemonRunService } from '@od-kernel/daemon-core';
import { composePrompt, type PromptComposerInput } from './prompt-composer.js';

// Re-export the orchestrator types that chat-service consumers need
export type { AgentOrchestrator, AgentEvent } from '@od-kernel/agent-runtime';

export interface DomainContext { id: string; title: string; body: string; attachments?: Record<string, string> }
export interface DomainWorkflow { id: string; name: string; description: string; body: string; dir: string; requiresContext: boolean }
export interface DomainPromptComposer { compose(input: PromptComposerInput): string }
export interface DomainContextResolver { listAll(): Promise<DomainContext[]>; resolve(id: string): Promise<DomainContext | null> }
export type DomainWorkflowResolver = (id: string) => Promise<DomainWorkflow | null>;

export interface ChatRouterOptions {
  runs: DaemonRunService;
  composePrompt: DomainPromptComposer['compose'];
  resolveContext: DomainContextResolver;
  resolveWorkflow: DomainWorkflowResolver;
  /**
   * Optional: stage workflow sidecar files (references, templates, etc.)
   * to the project cwd before the agent starts.
   */
  stageSkillFiles?: (cwd: string, workflow: DomainWorkflow) => Promise<string[]>;
  /**
   * Optional: Agent orchestrator for real agent execution.
   * When not provided, the handler runs in echo mode (useful for testing).
   */
  orchestrator?: import('@od-kernel/agent-runtime').AgentOrchestrator;
  /**
   * Optional: Called after each run finishes (both success and failure).
   * Receives the run record, agent events, and status. Use for analytics,
   * artifact counting (run-artifacts.ts), or audit logging.
   */
  onRunFinished?: (result: {
    run: { id: string; agentId: string; status: string; cwd: string };
    events: import('@od-kernel/agent-runtime').AgentEvent[];
    error?: string;
  }) => void | Promise<void>;
  /**
   * Optional: Auto-match a workflow based on the user's message.
   * When set and no explicit workflowId is provided, this function is called
   * with the user's message. If it returns a workflow ID, that workflow
   * is resolved and used automatically. Use with findMatchingWorkflow()
   * from @od-kernel/skill-utils for trigger-based matching.
   */
  autoMatchWorkflow?: (message: string) => Promise<string | null> | string | null;
  /**
   * Optional: Map BYOK proxy provider names to agent IDs.
   * When a request hits /api/proxy/:provider/stream, the provider param
   * is resolved through this map to determine which agent to launch.
   * If no mapping is found, the provider name is used directly as the
   * agent ID (after lowercasing). Default built-in mappings:
   *   claude → claude, opencode → opencode, codex → codex
   */
  providerAgentMap?: Record<string, string>;
}

export function createChatRouter(options: ChatRouterOptions): Router {
  const router = Router();
  const { runs, composePrompt: compose, resolveContext, resolveWorkflow, orchestrator } = options;

  // ---- POST /api/chat — Core: assemble prompt → launch agent → SSE stream ----

  router.post('/api/chat', async (req, res) => {
    const { agentId, message, projectId, contextId, workflowId, instructions, model, reasoning } =
      req.body as Record<string, unknown>;

    if (!agentId || !message) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'agentId and message are required' } });
      return;
    }

    // ---- Phase 1: Resolve context/workflow (pre-SSE) ----
    // Per design doc §3.4: resolve failures BEFORE agent spawn → HTTP 400/500.
    // Return null = "not found", silently skip. Throw = parse error → 400.

    let activeContext: DomainContext | null = null;
    let activeWorkflow: DomainWorkflow | null = null;

    try {
      if (contextId) {
        try {
          activeContext = await resolveContext.resolve(String(contextId));
        } catch (ctxErr) {
          // Context resolution threw → 400 (bad request, don't start agent)
          const msg = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
          res.status(400).json({
            error: { code: 'VALIDATION_FAILED', message: `Failed to resolve context "${contextId}": ${msg}` },
          });
          return;
        }
      }

      // Resolve effective workflowId: explicit takes priority, then trigger auto-match
      let effectiveWorkflowId = workflowId ? String(workflowId) : null;

      if (!effectiveWorkflowId && options.autoMatchWorkflow) {
        try {
          effectiveWorkflowId = await options.autoMatchWorkflow(String(message));
        } catch {
          // Auto-match failure is non-fatal — proceed without a workflow
        }
      }

      if (effectiveWorkflowId) {
        try {
          activeWorkflow = await resolveWorkflow(effectiveWorkflowId);
        } catch (wfErr) {
          // Workflow resolution threw → 400 (bad request, don't start agent)
          const msg = wfErr instanceof Error ? wfErr.message : String(wfErr);
          res.status(400).json({
            error: { code: 'VALIDATION_FAILED', message: `Failed to resolve workflow "${effectiveWorkflowId}": ${msg}` },
          });
          return;
        }
      }

      const cwd = String(projectId ?? process.cwd());

      // Stage workflow sidecar files (non-fatal if it fails)
      let stagedFiles: string[] = [];
      if (activeWorkflow && options.stageSkillFiles) {
        try {
          stagedFiles = await options.stageSkillFiles(cwd, activeWorkflow);
        } catch { /* non-fatal */ }
      }

      // ---- Phase 2: Compose the system prompt ----
      // Per design doc §3.4: composePrompt throws → HTTP 500 (internal error).

      let systemPrompt: string;
      try {
        systemPrompt = compose({
          userPrompt: String(message),
          activeContext,
          activeWorkflow,
          instructions: instructions ? String(instructions) : undefined,
        });
      } catch (promptErr) {
        const msg = promptErr instanceof Error ? promptErr.message : String(promptErr);
        // Do NOT expose raw error message to client (may contain filesystem paths)
        res.status(500).json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to compose system prompt. Check domain configuration.' },
        });
        // Log the real error server-side
        console.error('[chat-service] composePrompt failed:', msg);
        return;
      }

      // ---- Phase 3: Create run and start agent ----
      // At this point, HTTP 200 is implied — SSE connection is established.
      // All subsequent errors are delivered via SSE error events.

      const run = runs.create(String(agentId), cwd);
      runs.start(run.id);

      if (orchestrator) {
        // ---- Real agent execution via orchestrator ----
        const sse = runs.streamToResponse(run.id, res);
        if (sse) {
          sse.send('start', {
            runId: run.id,
            agentId: String(agentId),
            bin: String(agentId),
            cwd,
            model: model ? String(model) : undefined,
          });

          try {
            const eventIter = orchestrator.run({
              agentId: String(agentId),
              systemPrompt,
              userPrompt: String(message),
              cwd,
              extraDirs: stagedFiles,
              model: model ? String(model) : undefined,
              reasoning: reasoning ? String(reasoning) : undefined,
              runId: run.id, // correlate with run-service for cancel support
            });

            const collectedEvents: import('@od-kernel/agent-runtime').AgentEvent[] = [];
            let lastDoneReason: 'completed' | 'cancelled' | 'error' = 'completed';
            for await (const event of eventIter) {
              collectedEvents.push(event);
              if (event.type === 'done') {
                lastDoneReason = event.reason;
              }
              sse.send('agent', event);
            }

            // Determine finish status from the orchestrator's terminal done event.
            // This is load-bearing: the orchestrator yields done:error and
            // done:cancelled without throwing, so the chat-handler must read the
            // done reason rather than always assuming 'succeeded'.
            const finishStatus =
              lastDoneReason === 'cancelled' ? 'cancelled' as const
              : lastDoneReason === 'error' ? 'failed' as const
              : 'succeeded' as const;

            runs.finish(run.id, finishStatus);
            sse.send('end', {
              code: finishStatus === 'succeeded' ? 0 : 1,
              status: finishStatus,
            });

            // Notify analytics / artifact counting
            if (options.onRunFinished) {
              await Promise.resolve(
                options.onRunFinished({
                  run: { id: run.id, agentId: run.agentId, status: finishStatus, cwd: run.cwd },
                  events: collectedEvents,
                  error: lastDoneReason === 'error' ? 'Agent reported an error' : undefined,
                }),
              ).catch(() => { /* non-fatal */ });
            }
          } catch (agentErr) {
            const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
            runs.finish(run.id, 'failed', msg);
            sse.send('error', { message: msg });
            sse.send('end', { code: 1, status: 'failed' });

            if (options.onRunFinished) {
              await Promise.resolve(
                options.onRunFinished({
                  run: { id: run.id, agentId: run.agentId, status: 'failed', cwd: run.cwd },
                  events: [],
                  error: msg,
                }),
              ).catch(() => { /* non-fatal */ });
            }
          }

          sse.end();
        } else {
          // Run was removed between create and stream (TTL/concurrent delete).
          // Without this the request hangs with no response.
          if (!res.headersSent) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to attach SSE stream' } });
          }
        }
      } else {
        // ---- Echo mode (no orchestrator — test/development) ----
        const sse = runs.streamToResponse(run.id, res);
        if (sse) {
          sse.send('start', { runId: run.id, agentId: String(agentId), cwd });
          sse.send('agent', {
            type: 'text_delta',
            text: `[Echo mode] System prompt (${systemPrompt.length} chars): ${systemPrompt.slice(0, 200)}...`,
          });
          runs.finish(run.id, 'succeeded');
          sse.send('end', { code: 0, status: 'succeeded' });
          sse.end();
        } else {
          if (!res.headersSent) {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to attach SSE stream' } });
          }
        }
      }
    } catch (err) {
      // Catch-all for unexpected errors (e.g. runs.create fails). Don't expose
      // the raw message (may contain filesystem paths / internal details) —
      // log it server-side and return a generic message, matching the
      // composePrompt error handler above.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[chat-service] unexpected error:', msg);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
      }
    }
  });

  // ---- POST /api/runs — Create a run via MCP/SDK without SSE streaming ----

  router.post('/api/runs', async (req, res) => {
    const { agentId, message, projectId, model, reasoning } =
      req.body as Record<string, unknown>;

    if (!agentId || !message) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'agentId and message are required' } });
      return;
    }

    const cwd = String(projectId ?? process.cwd());
    const run = runs.create(String(agentId), cwd);

    res.status(201).json({
      id: run.id,
      agentId: run.agentId,
      status: 'queued',
      cwd: run.cwd,
      createdAt: run.createdAt,
    });
  });

  // ---- POST /api/proxy/{provider}/stream → SSE — BYOK proxy endpoint ----

  router.post('/api/proxy/:provider/stream', async (req, res) => {
    const { provider } = req.params;
    const { message, model } = req.body as Record<string, unknown>;

    if (!provider || !message) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'provider and message are required' } });
      return;
    }

    if (!orchestrator) {
      res.status(501).json({ error: { code: 'INTERNAL_ERROR', message: 'BYOK proxy requires an orchestrator' } });
      return;
    }

    // Resolve agent ID: custom mapping → built-in defaults → provider name as-is
    const defaultMap: Record<string, string> = {
      claude: 'claude',
      opencode: 'opencode',
      codex: 'codex',
      gemini: 'gemini',
      qwen: 'qwen',
      deepseek: 'deepseek',
      copilot: 'copilot',
      cursor: 'cursor-agent',
    };
    const effectiveMap = { ...defaultMap, ...options.providerAgentMap };
    const agentId = effectiveMap[String(provider).toLowerCase()] ?? String(provider).toLowerCase();

    const run = runs.create(`proxy-${String(provider)}`, process.cwd());
    runs.start(run.id);

    const sse = runs.streamToResponse(run.id, res);
    if (!sse) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create SSE stream' } });
      return;
    }

    sse.send('start', {
      runId: run.id,
      agentId,
      cwd: process.cwd(),
      model: model ? String(model) : undefined,
    });

    try {
      const events = orchestrator.run({
        agentId,
        systemPrompt: compose({ userPrompt: String(message) }),
        userPrompt: String(message),
        cwd: process.cwd(),
        model: model ? String(model) : undefined,
        runId: run.id, // correlate for cancel support
      });

      const collectedEvents: import('@od-kernel/agent-runtime').AgentEvent[] = [];
      let lastDoneReason: 'completed' | 'cancelled' | 'error' = 'completed';
      for await (const event of events) {
        collectedEvents.push(event);
        if (event.type === 'done') {
          lastDoneReason = event.reason;
        }
        sse.send('agent', event);
      }

      const finishStatus =
        lastDoneReason === 'cancelled' ? 'cancelled' as const
        : lastDoneReason === 'error' ? 'failed' as const
        : 'succeeded' as const;

      runs.finish(run.id, finishStatus);
      sse.send('end', {
        code: finishStatus === 'succeeded' ? 0 : 1,
        status: finishStatus,
      });

      // Notify analytics / artifact counting (parity with main chat endpoint)
      if (options.onRunFinished) {
        await Promise.resolve(
          options.onRunFinished({
            run: { id: run.id, agentId: run.agentId, status: finishStatus, cwd: run.cwd },
            events: collectedEvents,
            error: lastDoneReason === 'error' ? 'Agent reported an error' : undefined,
          }),
        ).catch(() => { /* non-fatal */ });
      }
    } catch (agentErr) {
      const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
      runs.finish(run.id, 'failed', msg);
      sse.send('error', { message: msg });
      sse.send('end', { code: 1, status: 'failed' });

      if (options.onRunFinished) {
        await Promise.resolve(
          options.onRunFinished({
            run: { id: run.id, agentId: run.agentId, status: 'failed', cwd: run.cwd },
            events: [],
            error: msg,
          }),
        ).catch(() => { /* non-fatal */ });
      }
    }

    sse.end();
  });

  // ---- Run management endpoints ----

  router.get('/api/runs', (_req, res) => { res.json({ runs: runs.list() }); });

  router.get('/api/runs/:id', (req, res) => {
    const run = runs.get(req.params.id!);
    run ? res.json(run) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
  });

  router.delete('/api/runs/:id', (req, res) => {
    if (runs.delete(req.params.id!)) {
      // Also stop the agent subprocess — runs.delete only removes the record
      // and SSE listeners, so without this a running run's child is orphaned.
      if (orchestrator) {
        orchestrator.cancel(req.params.id!).catch(() => {});
      }
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }
  });

  router.get('/api/runs/:id/events', (req, res) => {
    const run = runs.get(req.params.id!);
    if (!run) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } }); return; }
    const sse = runs.streamToResponse(req.params.id!, res);
    if (sse) {
      sse.send('start', { runId: run.id, agentId: run.agentId, status: run.status });
      sse.send('end', { code: run.status === 'succeeded' ? 0 : 1, status: run.status });
      sse.end();
    }
  });

  router.post('/api/runs/:id/cancel', (req, res) => {
    if (runs.cancel(req.params.id!)) {
      // Also try to cancel via orchestrator if available
      if (orchestrator) {
        orchestrator.cancel(req.params.id!).catch(() => {});
      }
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found or already finished' } });
    }
  });

  return router;
}

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

      if (workflowId) {
        try {
          activeWorkflow = await resolveWorkflow(String(workflowId));
        } catch (wfErr) {
          // Workflow resolution threw → 400 (bad request, don't start agent)
          const msg = wfErr instanceof Error ? wfErr.message : String(wfErr);
          res.status(400).json({
            error: { code: 'VALIDATION_FAILED', message: `Failed to resolve workflow "${workflowId}": ${msg}` },
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
            for await (const event of eventIter) {
              collectedEvents.push(event);
              sse.send('agent', event);
            }

            runs.finish(run.id, 'succeeded');
            sse.send('end', { code: 0, status: 'succeeded' });

            // Notify analytics / artifact counting
            if (options.onRunFinished) {
              await Promise.resolve(
                options.onRunFinished({
                  run: { id: run.id, agentId: run.agentId, status: 'succeeded', cwd: run.cwd },
                  events: collectedEvents,
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
        }
      }
    } catch (err) {
      // Catch-all for unexpected errors (e.g. runs.create fails)
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
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

    const run = runs.create(`proxy-${String(provider)}`, process.cwd());
    runs.start(run.id);

    const sse = runs.streamToResponse(run.id, res);
    if (!sse) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create SSE stream' } });
      return;
    }

    sse.send('start', {
      runId: run.id,
      agentId: `proxy-${String(provider)}`,
      cwd: process.cwd(),
      model: model ? String(model) : undefined,
    });

    try {
      const events = orchestrator.run({
        agentId: String(provider).toLowerCase() === 'claude' ? 'claude' : 'opencode',
        systemPrompt: '',
        userPrompt: String(message),
        cwd: process.cwd(),
        model: model ? String(model) : undefined,
        runId: run.id, // correlate for cancel support
      });

      for await (const event of events) {
        sse.send('agent', event);
      }

      runs.finish(run.id, 'succeeded');
      sse.send('end', { code: 0, status: 'succeeded' });
    } catch (agentErr) {
      const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
      runs.finish(run.id, 'failed', msg);
      sse.send('error', { message: msg });
      sse.send('end', { code: 1, status: 'failed' });
    }

    sse.end();
  });

  // ---- Run management endpoints ----

  router.get('/api/runs', (_req, res) => { res.json({ runs: runs.list() }); });

  router.get('/api/runs/:id', (req, res) => {
    const run = runs.get(req.params.id!);
    run ? res.json(run) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
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

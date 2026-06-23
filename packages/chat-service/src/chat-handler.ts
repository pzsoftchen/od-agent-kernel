/**
 * Parameterized chat handler.
 * Extracted from apps/daemon/src/server.ts startChatRun logic.
 *
 * The handler supports two modes:
 * 1. With orchestrator: spawns a real agent subprocess and streams SSE events
 * 2. Without orchestrator: echoes the system prompt (test/development mode)
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
}

export function createChatRouter(options: ChatRouterOptions): Router {
  const router = Router();
  const { runs, composePrompt: compose, resolveContext, resolveWorkflow, orchestrator } = options;

  router.post('/api/chat', async (req, res) => {
    const { agentId, message, projectId, contextId, workflowId, instructions, model, reasoning } =
      req.body as Record<string, unknown>;

    if (!agentId || !message) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'agentId and message are required' } });
      return;
    }

    try {
      const activeContext = contextId ? await resolveContext.resolve(String(contextId)) : null;
      const activeWorkflow = workflowId ? await resolveWorkflow(String(workflowId)) : null;
      const cwd = String(projectId ?? process.cwd());

      // Stage workflow sidecar files
      let stagedFiles: string[] = [];
      if (activeWorkflow && options.stageSkillFiles) {
        try {
          stagedFiles = await options.stageSkillFiles(cwd, activeWorkflow);
        } catch { /* non-fatal */ }
      }

      // Compose the system prompt
      const systemPrompt = compose({
        userPrompt: String(message),
        activeContext,
        activeWorkflow,
        instructions: instructions ? String(instructions) : undefined,
      });

      // Create and start the run
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
            const events = orchestrator.run({
              agentId: String(agentId),
              systemPrompt,
              userPrompt: String(message),
              cwd,
              extraDirs: stagedFiles,
              model: model ? String(model) : undefined,
              reasoning: reasoning ? String(reasoning) : undefined,
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
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
    }
  });

  // Run management endpoints
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
    runs.cancel(req.params.id!) ? res.json({ ok: true }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found or already finished' } });
  });

  return router;
}

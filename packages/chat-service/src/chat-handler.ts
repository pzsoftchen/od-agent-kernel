/**
 * Parameterized chat handler.
 * Extracted from apps/daemon/src/server.ts startChatRun logic.
 */

import { Router } from 'express';
import type { DaemonRunService } from '@od-kernel/daemon-core';
import { composePrompt, type PromptComposerInput } from './prompt-composer.js';

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
}

export function createChatRouter(options: ChatRouterOptions): Router {
  const router = Router();
  const { runs, composePrompt: compose, resolveContext, resolveWorkflow } = options;

  router.post('/api/chat', async (req, res) => {
    const { agentId, message, projectId, conversationId, contextId, workflowId, instructions } = req.body as Record<string, unknown>;

    if (!agentId || !message) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'agentId and message are required' } });
      return;
    }

    try {
      const activeContext = contextId ? await resolveContext.resolve(String(contextId)) : null;
      const activeWorkflow = workflowId ? await resolveWorkflow(String(workflowId)) : null;

      const systemPrompt = compose({
        userPrompt: String(message),
        activeContext,
        activeWorkflow,
        instructions: instructions ? String(instructions) : undefined,
      });

      const cwd = String(projectId ?? process.cwd());
      const run = runs.create(String(agentId), cwd);
      runs.start(run.id);

      const sse = runs.streamToResponse(run.id, res);
      if (sse) {
        sse.send('agent', { type: 'text_delta', text: `Processing: ${systemPrompt.slice(0, 100)}...` });
        runs.finish(run.id, 'succeeded');
        sse.send('end', { code: 0, status: 'succeeded' });
        sse.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
  });

  router.get('/api/runs', (_req, res) => { res.json({ runs: runs.list() }); });
  router.get('/api/runs/:id', (req, res) => {
    const run = runs.get(req.params.id!);
    run ? res.json(run) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
  });
  router.post('/api/runs/:id/cancel', (req, res) => {
    runs.cancel(req.params.id!) ? res.json({ ok: true }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found or already finished' } });
  });

  return router;
}

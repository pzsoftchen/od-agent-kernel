/**
 * Agent discovery routes.
 * Mounts GET /api/agents using the AgentOrchestrator from agent-runtime.
 */

import type { Express } from 'express';
import type { AgentOrchestrator } from '@od-kernel/agent-runtime';

export function registerAgentRoutes(app: Express, orchestrator: AgentOrchestrator): void {
  app.get('/api/agents', async (_req, res) => {
    try {
      const agents = await orchestrator.listAgents();
      res.json({ agents });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: `Failed to detect agents: ${msg}` },
      });
    }
  });
}

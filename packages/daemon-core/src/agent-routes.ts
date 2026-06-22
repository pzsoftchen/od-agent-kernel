import type { Express } from 'express';
import type { DetectedAgent } from '@od-kernel/agent-runtime';

export interface AgentListProvider {
  detectAll(): Promise<DetectedAgent[]>;
}

export function registerAgentRoutes(app: Express, provider: AgentListProvider): void {
  app.get('/api/agents', async (_req, res) => {
    try {
      const agents = await provider.detectAll();
      res.json({ agents });
    } catch (err) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to detect agents' },
      });
    }
  });
}

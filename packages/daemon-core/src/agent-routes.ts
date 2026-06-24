/**
 * Agent discovery and management routes.
 *
 * Mounts:
 *   GET  /api/agents                     — list detected agents
 *   POST /api/agents/:id/launch-terminal — launch agent in system terminal (OAuth)
 */

import type { Express, Request, Response } from 'express';
import type { AgentOrchestrator } from '@od-kernel/agent-runtime';
import {
  launchAgentInSystemTerminal,
  resolveAgentBin,
} from '@od-kernel/agent-runtime';

export function registerAgentRoutes(
  app: Express,
  orchestrator: AgentOrchestrator,
): void {
  // GET /api/agents — list all detected agents with availability status
  app.get('/api/agents', async (_req: Request, res: Response) => {
    try {
      const agents = await orchestrator.listAgents();
      res.json({ agents });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: `Failed to detect agents: ${msg}`,
        },
      });
    }
  });

  // POST /api/agents/:id/launch-terminal — open agent in system terminal
  // Used for OAuth flows where the agent needs an interactive terminal session
  // (e.g. Claude Code `claude auth login`, Antigravity `agy` OAuth).
  app.post(
    '/api/agents/:id/launch-terminal',
    async (req: Request, res: Response) => {
      const agentId = String(req.params.id);
      if (!agentId) {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'agent ID is required' },
        });
        return;
      }

      try {
        const binPath = resolveAgentBin(agentId);
        const command = binPath ?? agentId;

        const result = await launchAgentInSystemTerminal(command);

        if (result.ok) {
          res.json({
            ok: true,
            agentId,
            platform: result.platform,
            via: result.via,
          });
        } else {
          res.status(500).json({
            error: {
              code: 'AGENT_EXECUTION_FAILED',
              message: result.reason,
            },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: `Terminal launch failed: ${msg}`,
          },
        });
      }
    },
  );
}

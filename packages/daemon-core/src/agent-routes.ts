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
  getAgentDef,
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
      // req.params.id is string | string[] | undefined under noUncheckedIndexedAccess.
      // String(undefined) → "undefined" (truthy!) so use explicit check.
      const rawId = req.params.id;
      const agentId = typeof rawId === 'string' ? rawId : '';
      if (!agentId) {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'agent ID is required' },
        });
        return;
      }

      // Allowlist: only known agent IDs may be launched in a system terminal.
      // resolveAgentBin returns null for unknown IDs, which would otherwise
      // fall through to `command = agentId` and hand a raw, attacker-controlled
      // string to the shell-executing terminal launcher — a command-injection
      // vector. Reject before we reach launchAgentInSystemTerminal.
      if (!getAgentDef(agentId)) {
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: `Unknown agent ID: ${agentId}` },
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

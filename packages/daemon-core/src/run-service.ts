import { createRunService as createCoreRunService, type RunService, type CreateRunServiceOptions } from '@od-kernel/agent-runtime';
import { createSseResponse, type SseSession } from './sse.js';
import type { Response } from 'express';

export interface DaemonRunService extends RunService {
  /** Stream run events to an Express response via SSE. */
  streamToResponse(id: string, res: Response): SseSession | null;
}

export function createDaemonRunService(options: Omit<CreateRunServiceOptions, 'createSseResponse'> = {}): DaemonRunService {
  const core = createCoreRunService({
    ...options,
    createSseResponse: (res: unknown) => createSseResponse(res as Response),
  });

  return {
    ...core,
    streamToResponse(id: string, res: Response): SseSession | null {
      const run = core.get(id);
      if (!run) return null;
      const sse = createSseResponse(res);
      sse.send('start', { runId: run.id, agentId: run.agentId, status: run.status });
      core.stream(id, (_r: unknown) => createSseResponse(_r as Response), res);
      return sse;
    },
  };
}

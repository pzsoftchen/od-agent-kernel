/**
 * Daemon-level run service — wraps the core RunService with Express SSE support.
 *
 * streamToResponse creates a single SseSession bound to the Express response.
 * The caller (chat-handler) owns all SSE event sending. No duplicate events.
 */

import {
  createRunService as createCoreRunService,
  type RunService,
  type CreateRunServiceOptions,
} from '@od-kernel/agent-runtime';
import { createSseResponse, type SseSession } from './sse.js';
import type { Response } from 'express';

export interface DaemonRunService extends RunService {
  /** Create an SSE session bound to an Express response for the given run. */
  streamToResponse(id: string, res: Response): SseSession | null;
}

export function createDaemonRunService(
  options: Omit<CreateRunServiceOptions, 'createSseResponse'> = {},
): DaemonRunService {
  const core = createCoreRunService({
    ...options,
    createSseResponse: (res: unknown) => createSseResponse(res as Response),
  });

  return {
    ...core,

    /**
     * Create an SSE session bound to an Express response.
     *
     * The returned SseSession is the SINGLE writer to the HTTP response.
     * The caller is responsible for sending all events (start, agent, end)
     * and calling sse.end() when done.
     *
     * This method does NOT register an extra listener via core.stream —
     * that would create a second SseSession writing to the same response,
     * producing duplicate end events.
     */
    streamToResponse(id: string, res: Response): SseSession | null {
      const run = core.get(id);
      if (!run) return null;
      return createSseResponse(res);
    },
  };
}

/**
 * Server-Sent Events response helpers.
 * Extracted from apps/daemon/src/server.ts:3999-4056.
 */

import type { Response } from 'express';

export interface SseSession {
  send(event: string, data: unknown, id?: string): void;
  end(): void;
  cleanup(): void;
}

export function createSseResponse(res: Response): SseSession {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Keepalive heartbeat (every 15 seconds)
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15_000);

  const session: SseSession = {
    send(event: string, data: unknown, id?: string) {
      if (id) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      res.end();
    },
    cleanup() {
      clearInterval(keepalive);
    },
  };

  // Clean up on connection close
  res.on('close', () => {
    clearInterval(keepalive);
  });

  return session;
}

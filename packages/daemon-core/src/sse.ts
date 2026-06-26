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
  // Flush headers immediately so the client sees the 200 + SSE headers
  // without waiting for the first event or the 15s keepalive. Without this,
  // Node/proxies may buffer the headers until the first res.write().
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Keepalive heartbeat (every 15 seconds)
  let keepaliveCleared = false;
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15_000);

  const clearKeepalive = () => {
    if (!keepaliveCleared) {
      keepaliveCleared = true;
      clearInterval(keepalive);
    }
  };

  const session: SseSession = {
    send(event: string, data: unknown, id?: string) {
      if (id) res.write(`id: ${id}\n`);
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      // Clear keepalive BEFORE ending the response to prevent the timer
      // from firing write() on a closed stream (ERR_STREAM_WRITE_AFTER_END).
      clearKeepalive();
      res.end();
    },
    cleanup() {
      clearKeepalive();
    },
  };

  // Clean up on connection close (final safety net)
  res.on('close', () => {
    clearKeepalive();
  });

  return session;
}

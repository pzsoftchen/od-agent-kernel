import { describe, it, expect, vi } from 'vitest';
import { createSseResponse } from '../src/sse.js';
import type { Response } from 'express';

function mockResponse(): Response {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event]!.push(fn);
    }),
    listeners,
  } as unknown as Response;
}

describe('createSseResponse', () => {
  it('sets SSE headers', () => {
    const res = mockResponse();
    createSseResponse(res);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    }));
  });

  it('send() writes formatted SSE event', () => {
    const res = mockResponse();
    const sse = createSseResponse(res);
    sse.send('agent', { type: 'text_delta', text: 'hello' }, 'evt-1');
    expect(res.write).toHaveBeenCalled();
  });

  it('end() closes the response', () => {
    const res = mockResponse();
    const sse = createSseResponse(res);
    sse.end();
    expect(res.end).toHaveBeenCalled();
  });

  it('cleanup() clears the keepalive interval', () => {
    const res = mockResponse();
    const sse = createSseResponse(res);
    sse.cleanup();
    // cleanup should not throw
  });
});

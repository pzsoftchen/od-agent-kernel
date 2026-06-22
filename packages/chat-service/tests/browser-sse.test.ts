import { describe, it, expect } from 'vitest';
import { parseSseStream } from '../src/browser-sse.js';

function createMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const readable = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]!));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(readable);
}

describe('parseSseStream', () => {
  it('parses a simple SSE event', async () => {
    const response = createMockResponse([
      'event: start\ndata: {"runId":"r1","agentId":"claude"}\n\n',
    ]);

    const events = [];
    for await (const event of parseSseStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('start');
    expect((events[0] as { payload: { runId: string } }).payload.runId).toBe('r1');
  });

  it('parses multiple SSE events', async () => {
    const response = createMockResponse([
      'event: start\ndata: {"runId":"r1"}\n\n',
      'event: agent\ndata: {"type":"text_delta","text":"hello"}\n\n',
      'event: end\ndata: {"code":0}\n\n',
    ]);

    const events = [];
    for await (const event of parseSseStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe('start');
    expect(events[1]!.type).toBe('agent');
    expect(events[2]!.type).toBe('end');
  });

  it('handles split chunks gracefully', async () => {
    const response = createMockResponse([
      'event: sta',
      'rt\ndata: {"ok":true}\n\n',
    ]);

    const events = [];
    for await (const event of parseSseStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('start');
  });

  it('emits error event for invalid JSON data', async () => {
    const response = createMockResponse([
      'event: agent\ndata: not-json\n\n',
    ]);

    const events = [];
    for await (const event of parseSseStream(response)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('error');
  });
});

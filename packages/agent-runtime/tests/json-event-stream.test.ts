import { describe, it, expect, vi } from 'vitest';
import { createJsonEventStreamHandler } from '../src/json-event-stream.js';

describe('createJsonEventStreamHandler', () => {
  // The parser transforms raw JSON lines into structured stream events.
  // It handles JSONL format — one JSON object per line.

  it('emits events for complete JSON lines', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('test-kind', handler);

    feed('{"type":"start","id":"1"}\n');
    expect(handler).toHaveBeenCalledTimes(1);
    // The parser transforms events — verify it's called with some object
    const call = handler.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(typeof call).toBe('object');
  });

  it('handles multiple JSON lines in one feed', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('test-kind', handler);

    feed('{"a":1}\n{"b":2}\n{"c":3}\n');
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('handles partial line (buffering across feeds)', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('test-kind', handler);

    feed('{"type":"start"'); // incomplete
    expect(handler).toHaveBeenCalledTimes(0);

    feed(',"text":"hello"}\n'); // completes the line
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores empty lines and whitespace-only lines', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('test-kind', handler);

    feed('\n\n{"type":"ok"}\n\n');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles large batch of events', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('test-kind', handler);

    const lines = Array.from({ length: 100 }, (_, i) => `{"type":"event","index":${i}}`);
    feed(lines.join('\n') + '\n');
    expect(handler).toHaveBeenCalledTimes(100);
  });

  it('returns a flush function that processes remaining buffer', () => {
    const handler = vi.fn();
    const { feed, flush } = createJsonEventStreamHandler('test-kind', handler);

    feed('{"type":"start","data":"partial'); // no newline
    handler.mockClear();

    flush();
    // flush should process whatever remains
    expect(handler).toHaveBeenCalled();
  });

  it('parses actual agent JSONL format ({"type":"assistant","message":{...}})', () => {
    const handler = vi.fn();
    const { feed } = createJsonEventStreamHandler('copilot', handler);

    const event = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });
    feed(event + '\n');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

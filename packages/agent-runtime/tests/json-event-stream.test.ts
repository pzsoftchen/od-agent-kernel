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

  describe('exception safety', () => {
    // Regression: in handleLine(), the per-agent handler calls ran outside
    // the JSON.parse try/catch. A throw escaped feed() and propagated to the
    // orchestrator's stdout 'data' handler — which has no try/catch —
    // crashing or hanging the daemon and never yielding a terminal
    // done/error event. The fix wraps the handler calls in a try/catch that
    // emits an `error` event instead.

    it('does not throw and emits an error event when processing throws', () => {
      const events: Record<string, unknown>[] = [];
      // Throw for normal events, record the error event the catch emits.
      const throwingHandler = (event: Record<string, unknown>) => {
        if (event.type === 'error') {
          events.push(event);
          return;
        }
        throw new Error('boom');
      };
      const { feed } = createJsonEventStreamHandler('codex', throwingHandler);

      // thread.started → handleCodexEvent calls onEvent({type:'status',...})
      // → throws → catch emits {type:'error', message:'codex stream parse error: ...'}
      expect(() => feed('{"type":"thread.started"}\n')).not.toThrow();
      expect(events.some((e) => e.type === 'error')).toBe(true);
      expect(
        events.some(
          (e) => typeof e.message === 'string' && e.message.includes('codex stream parse error'),
        ),
      ).toBe(true);
    });

    it('never throws on adversarial shapes across every kind', () => {
      const kinds = ['opencode', 'gemini', 'kimi', 'cursor-agent', 'codex', 'unknown-kind'];
      const adversarial = [
        'null',
        '[]',
        '42',
        '"a string"',
        '{}',
        '{"type":null}',
        '{"type":"__never_handled__"}',
        '{"type":"item.completed","item":null}',
        '{"type":"assistant","message":[]}',
        '{"type":"turn.completed","usage":null}',
      ];
      for (const kind of kinds) {
        const { feed } = createJsonEventStreamHandler(kind, () => {});
        for (const line of adversarial) {
          expect(() => feed(line + '\n')).not.toThrow();
        }
      }
    });
  });
});

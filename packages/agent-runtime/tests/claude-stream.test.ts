import { describe, it, expect } from 'vitest';
import { createClaudeStreamHandler } from '../src/claude-stream.js';

describe('createClaudeStreamHandler — exception safety', () => {
  // Regression: in feed(), handleObject() ran outside the JSON.parse
  // try/catch. A throw from handleObject (or from onEvent called inside it)
  // escaped feed() and propagated to the orchestrator's stdout 'data'
  // handler — which has no try/catch — crashing or hanging the daemon and
  // never yielding a terminal done/error event. The fix wraps handleObject
  // in a try/catch that emits an `error` event instead.

  it('does not throw and emits an error event when processing throws', () => {
    const events: Record<string, unknown>[] = [];
    // Throw for normal events, but record the error event the catch block
    // emits (so the catch's onEvent call doesn't re-throw).
    const throwingSink = (event: Record<string, unknown>) => {
      if (event.type === 'error') {
        events.push(event);
        return;
      }
      throw new Error('boom');
    };
    const { feed } = createClaudeStreamHandler(throwingSink);

    // system init → handleObject calls onEvent({type:'status',...}) → throws
    // → catch emits {type:'error', message:'claude stream parse error: ...'}
    expect(() => feed('{"type":"system","subtype":"init"}\n')).not.toThrow();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(
      events.some(
        (e) => typeof e.message === 'string' && e.message.includes('claude stream parse error'),
      ),
    ).toBe(true);
  });

  it('keeps parsing subsequent lines after a thrown line', () => {
    const events: Record<string, unknown>[] = [];
    let calls = 0;
    const sink = (event: Record<string, unknown>) => {
      calls += 1;
      // Throw only on the first non-error event, then behave normally.
      if (calls === 1 && event.type !== 'error') throw new Error('boom');
      events.push(event);
    };
    const { feed } = createClaudeStreamHandler(sink);

    feed('{"type":"system","subtype":"init"}\n{"type":"system","subtype":"init"}\n');
    // The second line should still be processed (init emits a status event).
    expect(events.some((e) => e.type === 'status')).toBe(true);
  });
});

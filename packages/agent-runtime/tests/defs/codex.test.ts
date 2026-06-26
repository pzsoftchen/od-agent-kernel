import { describe, it, expect } from 'vitest';
import { codexAgentDef } from '../../src/defs/codex.js';

describe('codex buildArgs — reasoning effort override', () => {
  // Regression: clampCodexReasoning returns undefined for values Codex does
  // not accept via model_reasoning_effort (none/minimal/xhigh). Previously
  // the code stringified that undefined and emitted
  // `model_reasoning_effort="undefined"`, which Codex treated as a real —
  // and invalid — effort level. The fix skips the override entirely when
  // the clamped effort is falsy.

  it('emits the effort override for accepted levels (high)', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'gpt-5', reasoning: 'high' },
      { cwd: '/tmp' },
    );
    expect(args).toContain('model_reasoning_effort="high"');
  });

  it('does NOT emit the literal string "undefined" for xhigh', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'gpt-5', reasoning: 'xhigh' },
      { cwd: '/tmp' },
    );
    expect(args.some((a) => a.includes('model_reasoning_effort'))).toBe(false);
    expect(args.some((a) => a.includes('undefined'))).toBe(false);
  });

  it('does not emit the override for "none" or "minimal"', () => {
    for (const reasoning of ['none', 'minimal'] as const) {
      const args = codexAgentDef.buildArgs(
        'prompt',
        [],
        [],
        { model: 'gpt-5', reasoning },
        { cwd: '/tmp' },
      );
      expect(args.some((a) => a.includes('model_reasoning_effort'))).toBe(false);
      expect(args.some((a) => a.includes('undefined'))).toBe(false);
    }
  });

  it('does not emit the override when reasoning is "default"', () => {
    const args = codexAgentDef.buildArgs(
      'prompt',
      [],
      [],
      { model: 'gpt-5', reasoning: 'default' },
      { cwd: '/tmp' },
    );
    expect(args.some((a) => a.includes('model_reasoning_effort'))).toBe(false);
  });

  it('still produces a valid string-array argv without reasoning', () => {
    const args = codexAgentDef.buildArgs('prompt', [], [], { model: 'gpt-5' }, { cwd: '/tmp' });
    expect(Array.isArray(args)).toBe(true);
    expect(args.every((a) => typeof a === 'string')).toBe(true);
  });
});

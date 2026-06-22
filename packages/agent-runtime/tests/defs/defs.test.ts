import { describe, it, expect } from 'vitest';
import { AGENT_DEFS, getAgentDef } from '../../src/defs/index.js';

describe('Agent definitions', () => {
  it('has at least one agent defined', () => {
    expect(AGENT_DEFS.length).toBeGreaterThan(0);
  });

  describe.each(AGENT_DEFS.map((def) => ({ id: def.id, def })))(
    '$id',
    ({ def }) => {
      it('has required fields', () => {
        expect(def.id).toBeTruthy();
        expect(def.name).toBeTruthy();
        expect(def.bin).toBeTruthy();
        expect(Array.isArray(def.versionArgs)).toBe(true);
        expect(Array.isArray(def.fallbackModels)).toBe(true);
        expect(typeof def.buildArgs).toBe('function');
        expect(def.streamFormat).toBeTruthy();
      });

      it('buildArgs returns an array of strings', () => {
        const args = def.buildArgs('test prompt', [], [], {});
        expect(Array.isArray(args)).toBe(true);
        expect(args.every((a) => typeof a === 'string')).toBe(true);
        expect(args.length).toBeGreaterThan(0);
      });

      it('has unique ID', () => {
        const others = AGENT_DEFS.filter((d) => d.id === def.id);
        expect(others).toHaveLength(1);
      });

      it('has valid streamFormat', () => {
        expect(typeof def.streamFormat).toBe('string');
        expect(def.streamFormat.length).toBeGreaterThan(0);
      });
    },
  );
});

describe('getAgentDef', () => {
  it('returns definition for known agent', () => {
    const claude = AGENT_DEFS[0]!;
    const found = getAgentDef(claude.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(claude.id);
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgentDef('nonexistent-agent')).toBeUndefined();
  });
});

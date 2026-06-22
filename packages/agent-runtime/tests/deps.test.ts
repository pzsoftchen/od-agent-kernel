import { describe, it, expect } from 'vitest';
import {
  resolveDeps,
  defaultDeps,
  defaultSandboxConfig,
  defaultAmrIntegration,
  type RuntimeModuleDeps,
} from '../src/deps.js';

describe('resolveDeps', () => {
  it('returns default deps when called with no arguments', () => {
    const deps = resolveDeps();
    expect(deps.sandboxConfig).toBe(defaultSandboxConfig);
    expect(deps.amrIntegration).toBe(defaultAmrIntegration);
    expect(deps.appConfig.readSync()).toEqual({});
    expect(deps.mediaPolicy.normalizeForRun('test')).toBe('test');
  });

  it('merges user-provided deps with defaults', () => {
    const customSandbox = {
      isEnabled: () => true,
      resolveConfig: () => null,
      resolveFromEnv: () => null,
    };
    const deps = resolveDeps({ sandboxConfig: customSandbox });
    expect(deps.sandboxConfig).toBe(customSandbox);
    expect(deps.amrIntegration).toBe(defaultAmrIntegration); // falls back to default
    expect(deps.appConfig).toBe(defaultDeps.appConfig);
  });

  it('allows overriding all deps', () => {
    const custom: RuntimeModuleDeps = {
      sandboxConfig: {
        isEnabled: () => false,
        resolveConfig: () => null,
        resolveFromEnv: () => null,
      },
      amrIntegration: {
        resolveProfile: () => 'test',
        profileEnv: () => ({ AMR_PROFILE: 'test' }),
        modelScope: () => 'test',
      },
      appConfig: {
        readSync: () => ({ key: 'value' }),
      },
      mediaPolicy: {
        normalizeForRun: (v) => `normalized:${v}`,
      },
    };
    const deps = resolveDeps(custom);
    expect(deps.sandboxConfig).toBe(custom.sandboxConfig);
    expect(deps.amrIntegration!.resolveProfile({})).toBe('test');
    expect(deps.appConfig.readSync()).toEqual({ key: 'value' });
    expect(deps.mediaPolicy.normalizeForRun('x')).toBe('normalized:x');
  });
});

describe('defaultSandboxConfig', () => {
  it('isEnabled returns false', () => {
    expect(defaultSandboxConfig.isEnabled({})).toBe(false);
  });

  it('resolveConfig returns null', () => {
    expect(defaultSandboxConfig.resolveConfig({}, '/tmp')).toBeNull();
  });

  it('resolveFromEnv returns null', () => {
    expect(defaultSandboxConfig.resolveFromEnv({})).toBeNull();
  });
});

describe('defaultAmrIntegration', () => {
  it('resolveProfile defaults to prod', () => {
    expect(defaultAmrIntegration.resolveProfile({})).toBe('prod');
  });

  it('profileEnv returns empty object', () => {
    expect(defaultAmrIntegration.profileEnv({})).toEqual({});
  });

  it('modelScope defaults to prod', () => {
    expect(defaultAmrIntegration.modelScope({})).toBe('prod');
  });
});

import { describe, it, expect } from 'vitest';
import { ok, err, type Result } from '../src/http-types.js';
import type { AgentDiagnostic, AgentInfo, AgentFixIntent } from '../src/agent-types.js';

describe('Result type helpers', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err() creates an error result', () => {
    const result = err({ code: 'BAD_REQUEST' as const, message: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BAD_REQUEST');
    }
  });

  it('Result discriminates in type-narrowing', () => {
    const success: Result<number> = ok(1);
    const failure: Result<number> = err({ code: 'NOT_FOUND' as const, message: 'gone' });

    // Type narrowing works at compile time and runtime
    if (success.ok) {
      expect(typeof success.value).toBe('number');
    }
    if (!failure.ok) {
      expect(failure.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('AgentDiagnostic type shape', () => {
  it('accepts a minimal not-on-path diagnostic', () => {
    const diag: AgentDiagnostic = {
      reason: 'not-on-path',
      severity: 'error',
      message: 'Claude CLI not found on PATH',
      searchedDirs: ['/usr/local/bin', '/usr/bin'],
      fixActions: [
        { kind: 'openInstall' },
        { kind: 'setEnv', envKey: 'CLAUDE_BIN' },
      ],
    };
    expect(diag.reason).toBe('not-on-path');
    expect(diag.fixActions).toHaveLength(2);
  });

  it('accepts an auth-missing diagnostic', () => {
    const diag: AgentDiagnostic = {
      reason: 'auth-missing',
      severity: 'warning',
      message: 'Not authenticated',
      fixActions: [{ kind: 'launchOAuth', agentId: 'antigravity' }],
    };
    expect(diag.reason).toBe('auth-missing');
  });
});

describe('AgentInfo type shape', () => {
  it('represents an available agent', () => {
    const info: AgentInfo = {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      path: '/usr/local/bin/claude',
      version: '2.1.0',
      models: [{ id: 'default', label: 'Default (CLI config)' }],
    };
    expect(info.available).toBe(true);
    expect(info.models).toHaveLength(1);
  });

  it('represents an unavailable agent with diagnostics', () => {
    const info: AgentInfo = {
      id: 'copilot',
      name: 'GitHub Copilot',
      bin: 'github-copilot-cli',
      available: false,
      diagnostics: [
        {
          reason: 'not-on-path',
          severity: 'error',
          message: 'github-copilot-cli not found',
        },
      ],
    };
    expect(info.available).toBe(false);
    expect(info.diagnostics).toHaveLength(1);
  });
});

describe('AgentFixIntent discriminated union', () => {
  it('openDocs has kind only', () => {
    const intent: AgentFixIntent = { kind: 'openDocs' };
    expect(intent.kind).toBe('openDocs');
  });

  it('setEnv carries envKey', () => {
    const intent: AgentFixIntent = { kind: 'setEnv', envKey: 'CLAUDE_BIN' };
    expect(intent.envKey).toBe('CLAUDE_BIN');
  });

  it('launchOAuth carries agentId', () => {
    const intent: AgentFixIntent = { kind: 'launchOAuth', agentId: 'antigravity' };
    expect(intent.agentId).toBe('antigravity');
  });
});

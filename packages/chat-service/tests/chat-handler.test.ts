import { describe, it, expect, vi } from 'vitest';
import { composePrompt } from '../src/prompt-composer.js';

describe('composePrompt', () => {
  it('composes a basic prompt with user input', () => {
    const result = composePrompt({ userPrompt: 'Review this code' });
    expect(result).toContain('## Request');
    expect(result).toContain('Review this code');
  });

  it('includes active context when present', () => {
    const result = composePrompt({
      userPrompt: 'test',
      activeContext: { id: 'ctx-1', title: 'Security', body: 'Check OWASP' },
    });
    expect(result).toContain('## Context: Security');
    expect(result).toContain('Check OWASP');
  });

  it('includes active workflow when present', () => {
    const result = composePrompt({
      userPrompt: 'test',
      activeWorkflow: { id: 'wf-1', name: 'Code Review', description: '', body: '1. Check\n2. Report', dir: '/tmp', requiresContext: false },
    });
    expect(result).toContain('## Workflow: Code Review');
    expect(result).toContain('1. Check');
  });

  it('includes instructions when present', () => {
    const result = composePrompt({
      userPrompt: 'test',
      instructions: 'Use strict mode',
    });
    expect(result).toContain('## Project Requirements');
    expect(result).toContain('Use strict mode');
  });

  it('combines all sections in order', () => {
    const result = composePrompt({
      userPrompt: 'final request',
      activeContext: { id: 'c', title: 'Ctx', body: 'ctx body' },
      activeWorkflow: { id: 'w', name: 'Wf', description: '', body: 'wf body', dir: '/tmp', requiresContext: false },
      instructions: 'be careful',
    });
    const sections = result.split('\n\n');
    // Context should come before workflow before instructions before request
    const ctxIdx = sections.findIndex(s => s.includes('Context: Ctx'));
    const wfIdx = sections.findIndex(s => s.includes('Workflow: Wf'));
    const instIdx = sections.findIndex(s => s.includes('Project Requirements'));
    const reqIdx = sections.findIndex(s => s.includes('final request'));
    expect(ctxIdx).toBeLessThan(wfIdx);
    expect(wfIdx).toBeLessThan(instIdx);
    expect(instIdx).toBeLessThan(reqIdx);
  });

  it('returns only request section when no extras provided', () => {
    const result = composePrompt({ userPrompt: 'hello' });
    const lines = result.split('\n\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('## Request\nhello');
  });
});

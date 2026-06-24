import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/template-engine.js';

describe('renderTemplate', () => {
  // ---- Simple variables ----

  it('replaces simple variables', () => {
    const result = renderTemplate('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('replaces multiple variables', () => {
    const result = renderTemplate('{{greeting}} {{name}}', {
      greeting: 'Hi',
      name: 'Test',
    });
    expect(result).toBe('Hi Test');
  });

  it('keeps unknown variables as-is', () => {
    const result = renderTemplate('{{unknown}}', {});
    expect(result).toBe('{{unknown}}');
  });

  // ---- Default values ----

  it('uses default value when variable is missing', () => {
    const result = renderTemplate('Hello {{name:-World}}!', {});
    expect(result).toBe('Hello World!');
  });

  it('ignores default when variable is present', () => {
    const result = renderTemplate('Hello {{name:-World}}!', { name: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('uses default for empty string variable', () => {
    const result = renderTemplate('Model: {{model:-default}}', { model: '' });
    expect(result).toBe('Model: default');
  });

  // ---- Conditional blocks (#) ----

  it('renders conditional block when value exists', () => {
    const template = '{{#instructions}}## Rules\n{{instructions}}{{/instructions}}';
    const result = renderTemplate(template, { instructions: 'Be careful' });
    expect(result).toContain('## Rules');
    expect(result).toContain('Be careful');
  });

  it('removes conditional block when value is empty/missing', () => {
    const template = 'Prefix\n{{#instructions}}## Rules\n{{instructions}}{{/instructions}}\nSuffix';
    const result = renderTemplate(template, {});
    expect(result).toBe('Prefix\n\nSuffix');
  });

  // ---- Inverted blocks (^) ----

  it('renders inverted block when value is missing', () => {
    const template = '{{^instructions}}No special instructions.{{/instructions}}';
    const result = renderTemplate(template, {});
    expect(result).toBe('No special instructions.');
  });

  it('hides inverted block when value is present', () => {
    const template = '{{^instructions}}No instructions.{{/instructions}}';
    const result = renderTemplate(template, { instructions: 'Be careful' });
    expect(result).toBe('');
  });

  // ---- Nested blocks ----

  it('handles nested conditional blocks', () => {
    const template =
      '{{#context:body}}Context: {{context:body}}\n{{#instructions}}Rules: {{instructions}}{{/instructions}}{{/context:body}}';
    const result = renderTemplate(template, {
      'context:body': 'Security audit scope',
      instructions: 'Use OWASP Top 10',
    });
    expect(result).toContain('Context: Security audit scope');
    expect(result).toContain('Rules: Use OWASP Top 10');
  });

  it('skips nested content when outer block is empty', () => {
    const template =
      '{{#context:body}}Context present\n{{#instructions}}Rules: {{instructions}}{{/instructions}}{{/context:body}}';
    const result = renderTemplate(template, {
      instructions: 'Should not show',
    });
    expect(result).toBe('');
  });

  // ---- #each loops ----

  it('iterates over string array with #each', () => {
    const template = 'Items:\n{{#each files}}- {{this}}\n{{/each}}';
    const result = renderTemplate(template, {
      files: ['a.ts', 'b.ts', 'c.ts'],
    });
    expect(result).toContain('- a.ts');
    expect(result).toContain('- b.ts');
    expect(result).toContain('- c.ts');
  });

  it('renders nothing for empty array', () => {
    const template = '{{#each files}}- {{this}}\n{{/each}}';
    const result = renderTemplate(template, { files: [] });
    expect(result).toBe('');
  });

  it('renders nothing for missing array', () => {
    const template = '{{#each files}}- {{this}}\n{{/each}}';
    const result = renderTemplate(template, {});
    expect(result).toBe('');
  });

  // ---- Combined features ----

  it('handles context:body and workflow:body variables', () => {
    const template =
      '{{#context:body}}{{context:body}}{{/context:body}}\n{{userPrompt}}';
    const result = renderTemplate(template, {
      'context:body': 'Security rules here',
      userPrompt: 'Review this code',
    });
    expect(result).toContain('Security rules here');
    expect(result).toContain('Review this code');
  });

  it('preserves whitespace around blocks', () => {
    const template = 'Header\n{{#body}}\nBody: {{body}}\n{{/body}}\nFooter';
    const result = renderTemplate(template, { body: 'content' });
    expect(result).toBe('Header\n\nBody: content\n\nFooter');
  });

  it('handles complex template combining all features', () => {
    const template = [
      '# Role',
      'You are {{role:-a helpful assistant}}.',
      '',
      '{{#context:body}}',
      '## Context',
      '{{context:body}}',
      '{{/context:body}}',
      '',
      '{{#workflow:body}}',
      '## Workflow: {{workflow:name:-unnamed}}',
      '{{workflow:body}}',
      '{{/workflow:body}}',
      '',
      '{{^instructions}}',
      '> No project-specific requirements.',
      '{{/instructions}}',
      '',
      '{{#instructions}}',
      '## Requirements',
      '{{instructions}}',
      '{{/instructions}}',
      '',
      '## Files',
      '{{#each files}}',
      '- {{this}}',
      '{{/each}}',
      '',
      '## Request',
      '{{userPrompt}}',
    ].join('\n');

    const result = renderTemplate(template, {
      role: 'Code Reviewer',
      'context:body': 'Check for SQL injection and XSS.',
      'workflow:name': 'Security Audit',
      'workflow:body': '1. Scan\n2. Report',
      instructions: 'Use OWASP Top 10',
      files: ['src/auth.ts', 'src/api.ts'],
      userPrompt: 'Review auth module',
    });

    expect(result).toContain('# Role');
    expect(result).toContain('You are Code Reviewer.');
    expect(result).toContain('## Context');
    expect(result).toContain('Check for SQL injection and XSS.');
    expect(result).toContain('## Workflow: Security Audit');
    expect(result).toContain('1. Scan\n2. Report');
    expect(result).toContain('## Requirements');
    expect(result).toContain('Use OWASP Top 10');
    expect(result).toContain('## Files');
    expect(result).toContain('- src/auth.ts');
    expect(result).toContain('- src/api.ts');
    expect(result).toContain('## Request');
    expect(result).toContain('Review auth module');
    // Inverted block should NOT appear since instructions is present
    expect(result).not.toContain('No project-specific requirements');
  });
});

import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/template-engine.js';

describe('renderTemplate', () => {
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

  it('handles conditional blocks when value exists', () => {
    const template = '{{#instructions}}## Rules\n{{instructions}}{{/instructions}}';
    const result = renderTemplate(template, { instructions: 'Be careful' });
    expect(result).toContain('## Rules');
    expect(result).toContain('Be careful');
  });

  it('removes conditional blocks when value is empty', () => {
    const template = 'Prefix\n{{#instructions}}## Rules\n{{instructions}}{{/instructions}}\nSuffix';
    const result = renderTemplate(template, {});
    expect(result).toBe('Prefix\n\nSuffix');
  });

  it('handles context:body and workflow:body variables', () => {
    const template = '{{#context:body}}{{context:body}}{{/context:body}}\n{{userPrompt}}';
    const result = renderTemplate(template, {
      'context:body': 'Security rules here',
      userPrompt: 'Review this code',
    });
    expect(result).toContain('Security rules here');
    expect(result).toContain('Review this code');
  });

  it('keeps unknown variables as-is', () => {
    const result = renderTemplate('{{unknown}}', {});
    expect(result).toBe('{{unknown}}');
  });
});

/**
 * Mustache-style template engine for prompts.md.
 * Supports {{var}} substitution and {{#key}}...{{/key}} conditional blocks.
 */

export interface TemplateVars {
  userPrompt?: string;
  ['context:body']?: string;
  ['context:title']?: string;
  ['context:id']?: string;
  ['workflow:body']?: string;
  ['workflow:name']?: string;
  ['workflow:description']?: string;
  memory?: string;
  instructions?: string;
  locale?: string;
  [key: string]: string | undefined;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  let result = template;

  // Handle conditional blocks: {{#key}}...{{/key}}
  result = result.replace(/\{\{#(\S+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, content) => {
    const value = vars[key];
    return value ? content.replace(/\{\{(\S+)\}\}/g, (_m: string, k: string) => (k === key ? value : (vars[k] ?? `{{${k}}}`))) : '';
  });

  // Handle simple var substitution: {{var}}
  result = result.replace(/\{\{(\S+)\}\}/g, (_match, key) => {
    return vars[key] ?? `{{${key}}}`;
  });

  return result;
}

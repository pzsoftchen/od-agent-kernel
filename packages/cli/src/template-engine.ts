/**
 * Mustache-style template engine for prompts.md.
 *
 * Supported syntax:
 *   {{var}}                 — simple variable substitution
 *   {{var:-default}}        — variable with fallback default value
 *   {{#key}}...{{/key}}     — conditional block (renders if key is truthy)
 *   {{^key}}...{{/key}}     — inverted block (renders if key is falsy/missing)
 *   {{#each key}}...{{/each}} — iteration block (renders for each item)
 *   {{this}} / {{.}}        — current item in an #each loop
 *   {{this.prop}}           — property access on current item
 *
 * Blocks can be nested arbitrarily.
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
  [key: string]: string | string[] | undefined;
}

type LoopContext = Array<Record<string, string>>;

/**
 * Render a Mustache-style template with the given variables.
 *
 * Processing order (outermost first):
 * 1. {{#each key}}...{{/each}} — iterate over array variable
 * 2. {{#key}}...{{/key}}       — conditional (truthy)
 * 3. {{^key}}...{{/key}}       — inverted conditional (falsy/missing)
 * 4. {{var:-default}}          — variable with default
 * 5. {{var}}                   — simple substitution
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return processBlocks(template, vars, []);
}

// ---- Internal block processor ----

function processBlocks(
  template: string,
  vars: TemplateVars,
  loopStack: LoopContext,
): string {
  // Process from innermost to outermost: each → # → ^
  let result = template;

  // 1. {{#each key}}...{{/each}} — iteration blocks
  result = processEachBlocks(result, vars, loopStack);

  // 2. {{#key}}...{{/key}} — conditional blocks (truthy)
  result = processConditionalBlocks(result, vars, loopStack, false);

  // 3. {{^key}}...{{/key}} — inverted blocks (falsy/missing)
  result = processConditionalBlocks(result, vars, loopStack, true);

  // 4. Variable substitution (with defaults)
  result = substituteVariables(result, vars, loopStack);

  return result;
}

// ---- #each block processor ----

const EACH_RE = /\{\{#each\s+(\S+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

function processEachBlocks(
  template: string,
  vars: TemplateVars,
  parentLoopStack: LoopContext,
): string {
  return template.replace(
    EACH_RE,
    (_match: string, key: string, content: string) => {
      const value = vars[key];
      if (!Array.isArray(value) || value.length === 0) return '';

      const items: LoopContext = value.map((item) => {
        if (typeof item === 'string') {
          return { '.': item, this: item };
        }
        // Item is an object — copy its keys and add loop built-ins
        const obj: Record<string, string> = { '.': '', this: '' };
        for (const [k, v] of Object.entries(item)) {
          if (typeof v === 'string') obj[k] = v;
        }
        return obj;
      });

      return items
        .map((item) => {
          // Process nested blocks within the loop body, with the item
          // on top of the loop stack
          const body = processBlocks(content, vars, [...parentLoopStack, item]);
          return body;
        })
        .join('');
    },
  );
}

// ---- Conditional block processor (# and ^) ----

function processConditionalBlocks(
  template: string,
  vars: TemplateVars,
  loopStack: LoopContext,
  inverted: boolean,
): string {
  const prefix = inverted ? '\\^' : '#';
  const re = new RegExp(
    `\\{\\{${prefix}(\\S+)\\}\\}([\\s\\S]*?)\\{\\{/\\1\\}\\}`,
    'g',
  );

  return template.replace(
    re,
    (_match: string, key: string, content: string) => {
      const value = resolveVar(key, vars, loopStack);
      const isTruthy = inverted ? !value : !!value;

      if (!isTruthy) return '';

      // Recursively process nested blocks in the content
      return processBlocks(content, vars, loopStack);
    },
  );
}

// ---- Variable substitution ----

const DEFAULT_RE = /\{\{(\S+?):-([^}]*)\}\}/g;
const SIMPLE_RE = /\{\{(\S+)\}\}/g;

function substituteVariables(
  template: string,
  vars: TemplateVars,
  loopStack: LoopContext,
): string {
  let result = template;

  // {{var:-default}} — with default value
  result = result.replace(
    DEFAULT_RE,
    (_match: string, key: string, defaultVal: string) => {
      const resolved = resolveVar(key, vars, loopStack);
      return resolved !== undefined && resolved !== ''
        ? resolved
        : defaultVal;
    },
  );

  // {{var}} — simple substitution
  result = result.replace(SIMPLE_RE, (_match: string, key: string) => {
    const resolved = resolveVar(key, vars, loopStack);
    return resolved ?? `{{${key}}}`;
  });

  return result;
}

// ---- Variable resolution ----

/**
 * Resolve a variable key. Checks in order:
 * 1. Loop stack (innermost first) — supports `this`, `.`, `this.prop`
 * 2. Template vars
 *
 * Returns undefined if the variable is not found.
 */
function resolveVar(
  key: string,
  vars: TemplateVars,
  loopStack: LoopContext,
): string | undefined {
  // Check loop stack (innermost first)
  for (let i = loopStack.length - 1; i >= 0; i--) {
    const ctx = loopStack[i]!;
    // {{this}} or {{.}} — the current item's string value
    if (key === 'this' || key === '.') {
      if (ctx.this) return ctx.this;
      if (ctx['.']) return ctx['.'];
      // Fallback: return first string value in the context
      for (const v of Object.values(ctx)) {
        if (typeof v === 'string' && v) return v;
      }
      return undefined;
    }
    // {{this.prop}} — property access
    if (key.startsWith('this.') && ctx[key.slice(5)] !== undefined) {
      return ctx[key.slice(5)];
    }
    // Direct key in loop context
    if (ctx[key] !== undefined) return ctx[key];
  }

  // Check template vars
  const varValue = vars[key];
  if (typeof varValue === 'string') return varValue;
  if (Array.isArray(varValue)) {
    // Arrays are not rendered as simple vars — use {{#each}} for iteration
    return undefined;
  }
  return undefined;
}

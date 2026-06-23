/**
 * Model utilities — ported from apps/daemon/src/runtimes/models.ts.
 */

import type { RuntimeModelOption } from './types.js';

/** Default model option representing the CLI's own configuration. */
export const DEFAULT_MODEL_OPTION: RuntimeModelOption = {
  id: 'default',
  label: 'Default (CLI config)',
};

/** Sanitize a custom model ID string. Returns null if invalid. */
export function sanitizeCustomModel(id: string | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 256) return null;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null;
  return trimmed;
}

// Stubs for live model caching — not used in standalone kernel
export function getRememberedLiveModels(_agentId: string, _scope?: string): RuntimeModelOption[] | null { return null; }
export function rememberLiveModels(_agentId: string, _models: RuntimeModelOption[], _scope?: string): void {}

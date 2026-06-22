/**
 * Shared constants for agent definitions.
 * Ported from apps/daemon/src/runtimes/defs/shared.ts with path fixes.
 *
 * acp.ts and pi-rpc.ts are now under ../protocol/ instead of ../../.
 */

import { execAgentFile } from '../invocation.js';
import type { RuntimeModelOption } from '../types.js';

/** Re-export model detection from ACP protocol parser. */
export { detectAcpModels } from '../protocol/acp.js';

/** Re-export model parsing from Pi RPC parser. */
export { parsePiModels } from '../protocol/pi-rpc.js';

export { execAgentFile };

export const DEFAULT_MODEL_OPTION: RuntimeModelOption = {
  id: 'default',
  label: 'Default (CLI config)',
};

/**
 * Clamp a Codex reasoning effort level to the valid range.
 * Codex only accepts 'low', 'medium', 'high'.
 */
export function clampCodexReasoning(
  modelId: string,
  effort: string | null | undefined,
): string | undefined {
  if (!effort) return undefined;
  const valid = ['low', 'medium', 'high'];
  return valid.includes(effort) ? effort : undefined;
}

/**
 * Parse newline-separated model IDs into RuntimeModelOption[].
 */
export function parseLineSeparatedModels(
  stdout: string,
): RuntimeModelOption[] | null {
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return lines.map((id) => ({ id, label: id }));
}

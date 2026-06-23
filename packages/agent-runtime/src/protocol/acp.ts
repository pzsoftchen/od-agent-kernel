/**
 * ACP (Agent Communication Protocol) parser.
 * Ported from apps/daemon/src/acp.ts.
 *
 * Full implementation (~1,351 lines) to be ported in a follow-up phase.
 * This stub provides the minimal exports needed by defs/shared.ts with
 * the correct function signatures.
 */

import type { RuntimeModelOption } from '../types.js';

export interface AcpDetectModelsOptions {
  bin: string;
  args: string[];
  env?: NodeJS.ProcessEnv | Record<string, string>;
  timeoutMs?: number;
  /** Default model ID or option for the ACP session. */
  defaultModelOption?: string | { id: string; label: string };
  /** Optional model parameter for session/set_model. */
  forModel?: string | null;
}

/**
 * Detect available models via ACP `session/list_models`.
 * Full implementation handles JSON-RPC handshake, session management,
 * and multi-chunk response parsing.
 */
export async function detectAcpModels(
  _options: AcpDetectModelsOptions,
): Promise<RuntimeModelOption[] | null> {
  // Full implementation to be ported from apps/daemon/src/acp.ts
  return null;
}

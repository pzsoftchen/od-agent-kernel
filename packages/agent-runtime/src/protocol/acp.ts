/**
 * ACP (Agent Communication Protocol) parser.
 * Ported from apps/daemon/src/acp.ts.
 *
 * Full implementation (~1,351 lines) to be ported in a follow-up phase.
 * This stub provides the minimal exports needed by defs/shared.ts.
 */

import type { RuntimeModelOption } from '../types.js';

/**
 * Detect available models via ACP `session/list_models`.
 * Full implementation handles JSON-RPC handshake, session management,
 * and multi-chunk response parsing.
 */
export async function detectAcpModels(
  _resolvedBin: string,
  _env: NodeJS.ProcessEnv | Record<string, string>,
): Promise<RuntimeModelOption[] | null> {
  // Full implementation to be ported from apps/daemon/src/acp.ts
  return null;
}

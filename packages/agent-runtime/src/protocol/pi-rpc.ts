/**
 * Pi Agent RPC parser.
 * Ported from apps/daemon/src/pi-rpc.ts.
 *
 * Full implementation (~684 lines) to be ported in a follow-up phase.
 * This stub provides the minimal exports needed by defs/shared.ts.
 */

import type { RuntimeModelOption } from '../types.js';

/**
 * Parse Pi CLI model output into RuntimeModelOption[].
 * Full implementation handles the Pi JSON-RPC response format.
 */
export function parsePiModels(_stdout: string): RuntimeModelOption[] | null {
  // Full implementation to be ported from apps/daemon/src/pi-rpc.ts
  return null;
}

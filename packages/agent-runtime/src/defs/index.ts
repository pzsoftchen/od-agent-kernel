/**
 * Agent definition registry — all known agent adapters.
 * Ported from apps/daemon/src/runtimes/registry.ts pattern.
 */

import type { RuntimeAgentDef } from '../types.js';
import { claudeAgentDef } from './claude.js';

/** All built-in agent definitions. */
export const AGENT_DEFS: RuntimeAgentDef[] = [
  claudeAgentDef,
];

/** Look up an agent definition by ID. */
export function getAgentDef(id: string): RuntimeAgentDef | undefined {
  return AGENT_DEFS.find((def) => def.id === id);
}

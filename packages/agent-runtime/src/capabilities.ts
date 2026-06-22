/**
 * Agent capability flag storage.
 * Ported from apps/daemon/src/runtimes/capabilities.ts.
 */

import type { RuntimeCapabilityMap } from './types.js';

/** Mutable capability map shared across agent definitions. */
export const agentCapabilities = new Map<string, RuntimeCapabilityMap>();

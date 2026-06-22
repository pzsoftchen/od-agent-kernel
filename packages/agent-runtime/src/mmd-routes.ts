/**
 * MMD (Multi-Model Daemon) route resolution.
 * Ported from apps/daemon/src/runtimes/mmd-routes.ts.
 */

import type { RuntimeModelOption } from './types.js';

/**
 * Load MMD route models from environment.
 * Returns fallback models if no MMD routes are configured.
 */
export function loadMmdRouteModels(
  _env: NodeJS.ProcessEnv,
  fallbackModels: RuntimeModelOption[],
): RuntimeModelOption[] {
  return fallbackModels;
}

/**
 * Load MMD route launch environment for a specific model.
 */
export function loadMmdRouteLaunchEnv(
  _env: NodeJS.ProcessEnv,
  _modelId: string,
): Record<string, string> | null {
  return null;
}

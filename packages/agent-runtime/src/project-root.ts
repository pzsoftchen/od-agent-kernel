/**
 * Project root resolution utilities.
 * Ported from apps/daemon/src/project-root.ts.
 */

import path from 'node:path';

/** Resolve the project root from a nested module's path. */
export function resolveProjectRootFromNestedModule(modulePath: string): string {
  // Walk up from the module path until we find a package.json or hit root
  let current = path.dirname(modulePath);
  const root = path.parse(current).root;
  while (current !== root) {
    try {
      // In the kernel, the project root is simply the CWD
      return process.cwd();
    } catch {
      current = path.dirname(current);
    }
  }
  return process.cwd();
}

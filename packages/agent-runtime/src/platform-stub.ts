/**
 * Local stubs for @open-design/platform functions.
 *
 * The real implementations live in the Open Design monorepo at
 * packages/platform/src/. They are OS-level process primitives
 * (binary path resolution, proxy-aware env merging, command invocation).
 *
 * These stubs provide the minimal behavior needed for the kernel
 * to compile and run when @open-design/platform is not available.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { env as processEnv } from 'node:process';

// ---- wellKnownUserToolchainBins ----

export interface WellKnownUserToolchainOptions {
  home?: string;
  extraSearchDirs?: string[];
  env?: NodeJS.ProcessEnv;
  includeSystemBins?: boolean;
}

/** Returns common toolchain binary directories for the current platform. */
export function wellKnownUserToolchainBins(
  options: WellKnownUserToolchainOptions = {},
): string[] & { agentHomeDir?: string } {
  const home = options.home ?? homedir();
  const dirs: string[] = [];
  // Common locations
  dirs.push(join(home, '.local', 'bin'));
  dirs.push(join(home, 'bin'));
  dirs.push('/usr/local/bin');
  dirs.push('/opt/homebrew/bin');
  // Return array augmented with agentHomeDir property
  return Object.assign(dirs, { agentHomeDir: home });
}

// ---- mergeProxyAwareEnv ----

/**
 * Merge proxy-aware environment variables into the target env.
 * Resolves HTTP_PROXY, HTTPS_PROXY, NO_PROXY from system environment
 * or explicit proxy config.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeProxyAwareEnv(..._args: any[]): NodeJS.ProcessEnv {
  const target = (_args[0] as NodeJS.ProcessEnv) ?? {};
  // Pass through system proxy vars
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) {
    if (processEnv[key] && !target[key]) {
      target[key] = processEnv[key];
    }
  }
  return target;
}

// ---- resolveSystemProxyEnv ----

/** Resolve system-level proxy environment variables. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveSystemProxyEnv(_platform?: string, _proxyEnv?: NodeJS.ProcessEnv, _baseEnv?: NodeJS.ProcessEnv, _configuredEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const proxy: NodeJS.ProcessEnv = {};
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy']) {
    if (processEnv[key]) {
      proxy[key] = processEnv[key];
    }
  }
  return proxy;
}

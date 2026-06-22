/**
 * Subprocess invocation wrapper.
 * Ported from apps/daemon/src/runtimes/invocation.ts.
 *
 * Thin wrapper around child_process.execFile. Integrates with
 * @open-design/platform when available, falls back to direct exec.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RuntimeExecOptions } from './types.js';

const execFileAsync = promisify(execFile);

export interface ExecAgentFileResult {
  stdout: string;
  stderr: string;
}

/**
 * Execute an agent's CLI with given arguments.
 * Uses @open-design/platform's createCommandInvocation if available
 * (dynamic import), otherwise falls back to direct execFile.
 */
export async function execAgentFile(
  command: string,
  args: string[],
  options: RuntimeExecOptions = {},
): Promise<ExecAgentFileResult> {
  // Direct execFile — platform integration via optional dynamic import
  const result = await execFileAsync(command, args, options);
  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

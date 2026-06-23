/**
 * Local stubs for sandbox-mode functions.
 * Sandbox mode restricts agent file access to specific project directories.
 * Disabled by default in the standalone kernel.
 */

export interface SandboxRuntimeRoots { projectRoot: string; agentHomeDir: string }
export interface SandboxRuntimeConfig { enabled: boolean; dataDir: string; roots: SandboxRuntimeRoots; agentProfilesConfigPath?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSandboxModeEnabled(_env?: any): boolean { return false; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveSandboxRuntimeConfig(_env: any, _projectRoot: string): SandboxRuntimeConfig | null { return null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveSandboxRuntimeConfigFromEnv(_env: any, _projectRoot?: string): SandboxRuntimeConfig | null { return null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySandboxRuntimeEnv(env: any, _config: SandboxRuntimeConfig): any { return env; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sandboxAgentProfilesConfigPath(_arg: any): string { return ''; }
export function ensureSandboxRuntimeDirs(_config: SandboxRuntimeConfig): void {}

/**
 * Dependency injection interface for the Agent Runtime.
 *
 * All design-specific integrations (sandbox mode, AMR/Vela, app config,
 * media policy) are injected through this interface rather than imported
 * directly. This keeps the runtime kernel free of Open Design specifics.
 */

// ---- Sandbox configuration ----

export interface SandboxRuntimeConfig {
  /** Whether sandbox mode is enabled for the current process. */
  enabled: boolean;
  /** Root directories available to the sandbox. */
  roots?: string[];
  /** Extra environment variables to inject. */
  env?: Record<string, string>;
}

export interface SandboxConfigDeps {
  /** Check if sandbox mode is enabled from process environment. */
  isEnabled: (env: NodeJS.ProcessEnv) => boolean;
  /** Resolve full sandbox config from environment + project root. */
  resolveConfig: (
    env: NodeJS.ProcessEnv,
    projectRoot: string,
  ) => SandboxRuntimeConfig | null;
  /** Shortcut: resolve sandbox config from env alone. */
  resolveFromEnv: (
    env: NodeJS.ProcessEnv,
  ) => SandboxRuntimeConfig | null;
  /** Ensure sandbox runtime directories exist. */
  ensureDirs?: (config: SandboxRuntimeConfig) => void;
}

// ---- AMR / Vela integration ----

export interface AmrIntegrationDeps {
  /** Resolve the AMR profile from environment (prod/test/local). */
  resolveProfile: (env: NodeJS.ProcessEnv) => string;
  /** Build environment variables for the Vela/AMR profile. */
  profileEnv: (env: NodeJS.ProcessEnv) => Record<string, string>;
  /** Determine the AMR model scope for model detection. */
  modelScope: (env: NodeJS.ProcessEnv) => string;
}

// ---- App configuration ----

export interface AppConfigDeps {
  /** Synchronously read the application configuration. */
  readSync: () => Record<string, unknown>;
}

// ---- Media policy ----

export interface MediaPolicyDeps {
  /** Normalize a media execution policy value for a run. */
  normalizeForRun: (value: unknown) => unknown;
}

// ---- Aggregate deps ----

export interface RuntimeModuleDeps {
  sandboxConfig?: SandboxConfigDeps;
  amrIntegration?: AmrIntegrationDeps;
  appConfig?: AppConfigDeps;
  mediaPolicy?: MediaPolicyDeps;
}

// ---- Default (no-op) implementations ----

export const defaultSandboxConfig: SandboxConfigDeps = {
  isEnabled: () => false,
  resolveConfig: () => null,
  resolveFromEnv: () => null,
};

export const defaultAmrIntegration: AmrIntegrationDeps = {
  resolveProfile: () => 'prod',
  profileEnv: () => ({}),
  modelScope: () => 'prod',
};

export const defaultAppConfig: AppConfigDeps = {
  readSync: () => ({}),
};

export const defaultMediaPolicy: MediaPolicyDeps = {
  normalizeForRun: (value) => value,
};

/** Default deps — all optional integrations disabled. */
export const defaultDeps: Required<RuntimeModuleDeps> = {
  sandboxConfig: defaultSandboxConfig,
  amrIntegration: defaultAmrIntegration,
  appConfig: defaultAppConfig,
  mediaPolicy: defaultMediaPolicy,
};

/** Merge user-provided deps with defaults. */
export function resolveDeps(
  deps: RuntimeModuleDeps = {},
): Required<RuntimeModuleDeps> {
  return {
    sandboxConfig: deps.sandboxConfig ?? defaultSandboxConfig,
    amrIntegration: deps.amrIntegration ?? defaultAmrIntegration,
    appConfig: deps.appConfig ?? defaultAppConfig,
    mediaPolicy: deps.mediaPolicy ?? defaultMediaPolicy,
  };
}

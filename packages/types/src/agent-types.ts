/**
 * Agent-related types extracted from @open-design/contracts/api/registry.ts
 * and @open-design/contracts/analytics/events.ts.
 */

// ---- Model types ----

export interface AgentModelOption {
  id: string;
  label: string;
}

// ---- Diagnostic types ----

/**
 * A typed "what should the UI do to fix this" intent attached to an
 * {@link AgentDiagnostic}.
 */
export type AgentFixIntent =
  /** Open the agent's configuration / auth docs. */
  | { kind: 'openDocs' }
  /** Open the agent's install / download page. */
  | { kind: 'openInstall' }
  /** Re-run agent detection. */
  | { kind: 'rescan' }
  /** Prompt the user to set an explicit binary path via env var. */
  | { kind: 'setEnv'; envKey: string }
  /** Clear a previously-set binary override. */
  | { kind: 'clearEnv'; envKey: string }
  /** Launch the agent's interactive sign-in in a system terminal. */
  | { kind: 'launchOAuth'; agentId: string };

/**
 * Why a CLI agent is unavailable or only partially usable.
 */
export type AgentDiagnosticReason =
  /** The binary was not found on PATH. */
  | 'not-on-path'
  /** A file matched but is not executable. */
  | 'not-executable'
  /** A wrapper/shim was found but its target is gone. */
  | 'shim-broken'
  /** A user-set *_BIN override points at a missing/invalid file. */
  | 'configured-bin-invalid'
  /** Installed and invocable, but the CLI is not authenticated. */
  | 'auth-missing'
  /** Installed, but auth status could not be verified. */
  | 'auth-unknown';

export type AgentDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface AgentDiagnostic {
  reason: AgentDiagnosticReason;
  severity: AgentDiagnosticSeverity;
  /** Short, human-readable, single-sentence explanation. */
  message: string;
  /** Optional longer context (e.g. the probe's stderr tail). */
  detail?: string;
  /** Directories PATH detection searched. */
  searchedDirs?: string[];
  /** Ordered fix affordances the UI should offer for this diagnostic. */
  fixActions?: AgentFixIntent[];
}

// ---- Agent info ----

export interface AgentInfo {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;
  version?: string | null;
  diagnostics?: AgentDiagnostic[];
  models?: AgentModelOption[];
  modelsSource?: 'live' | 'fallback';
  reasoningOptions?: AgentModelOption[];
  installUrl?: string;
  docsUrl?: string;
  externalMcpInjection?:
    | 'claude-mcp-json'
    | 'acp-merge'
    | 'opencode-env-content';
  supportsCustomModel?: boolean;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

// ---- AMR types ----

export type AmrModelsSource = 'preset' | 'remote';

export interface AmrModelsResponse {
  source: AmrModelsSource;
  models: AgentModelOption[];
  refreshing: boolean;
  stale?: boolean;
  remoteError?: string;
}

// ---- Analytics types ----

/** Result of an agent run for analytics tracking. */
export type TrackingRunResult = 'success' | 'failed' | 'cancelled';

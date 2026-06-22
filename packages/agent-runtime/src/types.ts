/**
 * Core runtime types — ported from apps/daemon/src/runtimes/types.ts.
 * All @open-design/contracts imports resolved through @od-kernel/types.
 */

import type { ExecFileOptions } from 'node:child_process';
import type { AgentDiagnostic } from '@od-kernel/types';

export type { AgentDiagnostic } from '@od-kernel/types';

export type RuntimeEnv = NodeJS.ProcessEnv | Record<string, string>;

export type RuntimeModelOption = {
  id: string;
  label: string;
};

export type RuntimeModelSource = 'live' | 'fallback';

export type RuntimeReasoningOption = RuntimeModelOption;

export type RuntimeBuildOptions = {
  model?: string | null;
  reasoning?: string | null;
};

export type RuntimeContext = {
  cwd?: string;
  hasPriorAssistantTurn?: boolean;
  agentLogFilePath?: string;
  antigravitySettingsPath?: string;
  promptFilePath?: string;
  resumeSessionId?: string | null;
  newSessionId?: string;
};

export type RuntimeCapabilityMap = Record<string, boolean>;

export type RuntimeListModels = {
  args: string[];
  timeoutMs?: number;
  parse: (stdout: string) => RuntimeModelOption[] | null;
};

export type RuntimePromptBudgetError = {
  code: 'AGENT_PROMPT_TOO_LARGE';
  message: string;
  bytes?: number;
  commandLineLength?: number;
  limit: number;
};

export type RuntimeAgentDef = {
  id: string;
  name: string;
  bin: string;
  versionArgs: string[];
  fallbackModels: RuntimeModelOption[];
  buildArgs: (
    prompt: string,
    imagePaths: string[],
    extraAllowedDirs?: string[],
    options?: RuntimeBuildOptions,
    runtimeContext?: RuntimeContext,
  ) => string[];
  streamFormat: string;
  fallbackBins?: string[];
  versionProbeTimeoutMs?: number;
  helpArgs?: string[];
  capabilityFlags?: Record<string, string>;
  promptViaFile?: boolean;
  promptViaStdin?: boolean;
  promptInputFormat?: 'text' | 'stream-json';
  eventParser?: string;
  env?: Record<string, string>;
  listModels?: RuntimeListModels;
  fetchModels?: (
    resolvedBin: string,
    env: RuntimeEnv,
  ) => Promise<RuntimeModelOption[] | null>;
  reasoningOptions?: RuntimeReasoningOption[];
  supportsImagePaths?: boolean;
  maxPromptArgBytes?: number;
  mcpDiscovery?: string;
  externalMcpInjection?:
    | 'claude-mcp-json'
    | 'acp-merge'
    | 'opencode-env-content';
  installUrl?: string;
  docsUrl?: string;
  supportsCustomModel?: boolean;
  resumesSessionViaCli?: boolean;
  defaultModelEnvVar?: string;
  inactivityTimeoutMs?: number;
  authProbe?: {
    args: string[];
    timeoutMs?: number;
  };
  acpMcpEnvFormat?: 'array' | 'map';
};

export type DetectedAgent = Omit<
  RuntimeAgentDef,
  | 'buildArgs'
  | 'listModels'
  | 'fetchModels'
  | 'fallbackModels'
  | 'helpArgs'
  | 'capabilityFlags'
  | 'fallbackBins'
  | 'versionProbeTimeoutMs'
  | 'maxPromptArgBytes'
  | 'env'
  | 'inactivityTimeoutMs'
  | 'authProbe'
> & {
  models: RuntimeModelOption[];
  modelsSource: RuntimeModelSource;
  available: boolean;
  authStatus?: 'ok' | 'missing' | 'unknown';
  authMessage?: string;
  path?: string;
  version?: string | null;
  diagnostics?: AgentDiagnostic[];
};

export type RuntimeExecOptions = ExecFileOptions & {
  env?: NodeJS.ProcessEnv;
};

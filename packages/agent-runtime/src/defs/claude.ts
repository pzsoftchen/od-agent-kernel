/**
 * Claude Code agent definition.
 * Ported from apps/daemon/src/runtimes/defs/claude.ts.
 */

import { agentCapabilities } from '../capabilities.js';
import { loadMmdRouteModels } from '../mmd-routes.js';
import {
  DEFAULT_MODEL_OPTION,
  execAgentFile,
  detectAcpModels,
} from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const claudeAgentDef: RuntimeAgentDef = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  versionArgs: ['--version'],
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  ],
  buildArgs(prompt, _imagePaths, extraAllowedDirs = [], options = {}) {
    const args: string[] = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
    ];
    if (options.model && options.model !== 'default') {
      args.push('--model', options.model);
    }
    if (extraAllowedDirs.length > 0) {
      args.push('--extra-dirs', extraAllowedDirs.join(','));
    }
    return args;
  },
  streamFormat: 'stream-json',
  fallbackBins: ['claude'],
  versionProbeTimeoutMs: 15_000,
  capabilityFlags: {
    surgicalEdit: 'true',
    nativeSkillLoading: 'true',
    streaming: 'true',
    resume: 'true',
    permissionMode: 'permissive',
  },
  promptViaStdin: false,
  promptInputFormat: 'stream-json',
  eventParser: 'claude-stream',
  listModels: {
    args: ['--list-models'],
    timeoutMs: 15_000,
    parse(stdout) {
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return null;
      return lines.map((id) => ({ id, label: id }));
    },
  },
  fetchModels: async (_resolvedBin, env) => loadMmdRouteModels(env, [
    DEFAULT_MODEL_OPTION,
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  ]),
  reasoningOptions: [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'xhigh', label: 'X-High' },
    { id: 'max', label: 'Max' },
  ],
  supportsImagePaths: true,
  maxPromptArgBytes: 2_000_000,
  mcpDiscovery: 'user',
  externalMcpInjection: 'claude-mcp-json',
  installUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
  docsUrl: 'https://docs.claude.com/en/docs/claude-code',
  supportsCustomModel: true,
};

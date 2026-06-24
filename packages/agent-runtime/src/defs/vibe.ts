import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Mistral Vibe CLI — ACP-based coding agent by Mistral AI.
 *
 * Vibe runs as a background ACP server (`vibe-acp` with no subcommand).
 * Models are discovered through the ACP handshake. External MCP servers
 * are merged via acp-merge injection.
 *
 * @see https://mistral.ai/vibe
 */
export const vibeAgentDef = {
    id: 'vibe',
    name: 'Mistral Vibe CLI',
    bin: 'vibe-acp',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['vibe-acp', 'vibe'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: [],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => [],
    streamFormat: 'acp-json-rpc',
    capabilityFlags: {
      surgicalEdit: 'true',
      streaming: 'true',
      resume: 'true',
      permissionMode: 'permissive',
    },
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    supportsImagePaths: true,
    installUrl: 'https://mistral.ai/vibe',
    docsUrl: 'https://docs.mistral.ai/vibe',
} satisfies RuntimeAgentDef;

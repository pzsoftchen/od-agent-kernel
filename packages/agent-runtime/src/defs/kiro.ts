import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Kiro CLI — ACP-based coding agent by AWS.
 *
 * Kiro communicates over the Agent Communication Protocol (ACP) via
 * `kiro-cli acp`. Models are discovered through the ACP handshake.
 * External MCP servers are merged via acp-merge injection.
 *
 * @see https://aws.amazon.com/kiro/
 */
export const kiroAgentDef = {
    id: 'kiro',
    name: 'Kiro CLI',
    bin: 'kiro-cli',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['kiro-cli', 'kiro'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => ['acp'],
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
    installUrl: 'https://aws.amazon.com/kiro/',
    docsUrl: 'https://aws.amazon.com/kiro/',
} satisfies RuntimeAgentDef;

import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Kilo Code — ACP-based coding agent.
 *
 * Kilo communicates over the Agent Communication Protocol (ACP) via
 * `kilo acp`. Models are discovered through the ACP handshake, and
 * external MCP servers are merged via acp-merge injection.
 *
 * @see https://docs.kilocode.com
 */
export const kiloAgentDef = {
    id: 'kilo',
    name: 'Kilo Code',
    bin: 'kilo',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['kilo'],
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
    installUrl: 'https://docs.kilocode.com/installation',
    docsUrl: 'https://docs.kilocode.com',
} satisfies RuntimeAgentDef;

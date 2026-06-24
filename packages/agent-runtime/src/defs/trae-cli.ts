import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Trae CLI — ByteDance's ACP-based coding agent.
 *
 * Trae CLI runs as `traecli acp serve --yolo` and communicates over the
 * Agent Communication Protocol. Models are discovered through the ACP
 * handshake. MCP servers are merged via acp-merge injection.
 *
 * @see https://trae.ai
 */
export const traeCliAgentDef = {
    id: 'trae-cli',
    name: 'Trae CLI',
    bin: 'traecli',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['traecli', 'trae'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp', 'serve'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    fallbackModels: [DEFAULT_MODEL_OPTION],
    buildArgs: () => ['acp', 'serve', '--yolo'],
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
    installUrl: 'https://trae.ai/download',
    docsUrl: 'https://trae.ai/docs',
} satisfies RuntimeAgentDef;

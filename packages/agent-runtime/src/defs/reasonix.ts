import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Reasonix's ACP code reads the REASONIX_ACP_SYSTEM_APPEND env var and
// appends it to its code system prompt, so the model sees both coding
// rules and any consumer-specific framing.
//
// The kernel intentionally ships NO consumer-specific content here: the
// previous version embedded a hardcoded "Open Design" design-workflow
// block, which leaked downstream/consumer concerns into the kernel.
// Downstream consumers inject their own append text by setting
// REASONIX_ACP_SYSTEM_APPEND in the spawn environment (e.g. via the
// env-merge in the orchestrator / RuntimeModuleDeps). The def only
// guarantees the var name is documented; it sets no value itself.
//
// NOTE: `env` is omitted rather than set to an empty string, because an
// empty REASONIX_ACP_SYSTEM_APPEND would actively overwrite a value the
// consumer placed in the spawn env (orchestrator spreads def.env AFTER
// the base env). Leaving it unset preserves whatever the caller set.

export const reasonixAgentDef = {
    id: 'reasonix',
    name: 'DeepSeek Reasonix',
    bin: 'reasonix',
    fallbackBins: ['dsnix'],
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Reasonix ships an ACP (Agent Client Protocol) mode via `reasonix acp`
    // that speaks NDJSON JSON-RPC over stdio — the same wire format Hermes,
    // Kimi, Kilo, Kiro, and Vibe use. This avoids the Windows CreateProcess
    // ~32 KB command-line limit entirely: the prompt travels as a JSON-RPC
    // message body through stdin, not as a positional argv entry.
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    // reasonix 1.x (Go rewrite) expects MCP env as `{"KEY":"val"}` map,
    // not the `[{name, value}]` array shape that Hermes/Kimi/Vibe use.
    // The 0.x TypeScript releases accepted the array form; ≥1.0 needs map.
    acpMcpEnvFormat: 'map',
    // REASONIX_ACP_SYSTEM_APPEND: see comment above — set by the consumer,
    // not the kernel, so no consumer-specific prompt lives here.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    ],
    installUrl: 'https://github.com/esengine/DeepSeek-Reasonix',
    docsUrl: 'https://esengine.github.io/DeepSeek-Reasonix/',
} satisfies RuntimeAgentDef;

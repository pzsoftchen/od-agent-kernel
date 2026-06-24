import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Kimi CLI — Moonshot AI's coding agent.
 *
 * Kimi uses `-p <prompt> --output-format stream-json` for non-interactive
 * runs. The `listModels` probe delegates to `kimi models` which prints
 * one model ID per line. Prompt delivery is via CLI argument (not stdin),
 * with `maxPromptArgBytes: 30_000` to catch oversized payloads before spawn.
 *
 * @see https://kimi.moonshot.cn
 */
export const kimiAgentDef = {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['kimi'],
    listModels: {
      args: ['models'],
      parse: parseLineSeparatedModels,
      timeoutMs: 15_000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    buildArgs: (prompt, _imagePaths, _extraAllowedDirs = [], options = {}) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    // Kimi's prompt mode requires the full composed prompt as `-p <prompt>`.
    // Keep this under Windows' ~32 KB CreateProcess command-line ceiling so
    // /api/chat can fail fast with AGENT_PROMPT_TOO_LARGE instead of letting
    // spawn surface ENAMETOOLONG / E2BIG.
    maxPromptArgBytes: 30_000,
    streamFormat: 'json-event-stream',
    eventParser: 'kimi',
    capabilityFlags: {
      surgicalEdit: 'true',
      streaming: 'true',
      resume: 'true',
      permissionMode: 'permissive',
    },
    reasoningOptions: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
    ],
    supportsImagePaths: true,
    installUrl: 'https://kimi.moonshot.cn',
    docsUrl: 'https://kimi.moonshot.cn/docs',
    supportsCustomModel: true,
} satisfies RuntimeAgentDef;

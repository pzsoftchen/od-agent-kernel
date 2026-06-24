import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

/**
 * Qwen Code — Alibaba's coding agent (Gemini-CLI fork).
 *
 * Qwen Code is a fork of Google's Gemini CLI. It supports `--yolo`
 * non-interactive mode, stdin prompt delivery, and `--model` selection.
 * The `listModels` probe delegates to `qwen models` which prints one
 * model ID per line.
 *
 * @see https://github.com/QwenLM/qwen-code
 */
export const qwenAgentDef = {
    id: 'qwen',
    name: 'Qwen Code',
    bin: 'qwen',
    versionArgs: ['--version'],
    versionProbeTimeoutMs: 10_000,
    fallbackBins: ['qwen', 'qwen-code'],
    listModels: {
      args: ['models'],
      parse: parseLineSeparatedModels,
      timeoutMs: 15_000,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
      { id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' },
    ],
    // Prompt delivered via stdin (gated by `promptViaStdin: true`) to avoid Windows
    // `spawn ENAMETOOLONG` for large composed prompts. Qwen Code is a
    // Gemini-CLI fork and supports the same `--yolo` non-interactive mode.
    // Qwen Code reads from piped stdin when no positional prompt is supplied.
    // Current Qwen treats/rejects a bare `-` rather than needing it as a stdin sentinel.
    buildArgs: (_prompt, _imagePaths, _extra, options = {}) => {
      const args = ['--yolo'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'json-event-stream',
    eventParser: 'gemini',
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
    installUrl: 'https://github.com/QwenLM/qwen-code#installation',
    docsUrl: 'https://github.com/QwenLM/qwen-code',
    supportsCustomModel: true,
} satisfies RuntimeAgentDef;

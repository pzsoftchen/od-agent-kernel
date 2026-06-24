/**
 * Agent definition registry — all known agent adapters.
 *
 * Built-in definitions are listed below.  User-defined local profiles
 * (from ~/.open-design/agents.local.json or OD_AGENT_PROFILES_CONFIG)
 * are merged at load time via readLocalAgentProfileDefs.
 */

import type { RuntimeAgentDef } from '../types.js';
import { aiderAgentDef } from './aider.js';
import { ampAgentDef } from './amp.js';
import { amrAgentDef } from './amr.js';
import { antigravityAgentDef } from './antigravity.js';
import { claudeAgentDef } from './claude.js';
import { codebuddyAgentDef } from './codebuddy.js';
import { codexAgentDef } from './codex.js';
import { copilotAgentDef } from './copilot.js';
import { cursorAgentDef } from './cursor-agent.js';
import { deepseekAgentDef } from './deepseek.js';
import { devinAgentDef } from './devin.js';
import { geminiAgentDef } from './gemini.js';
import { grokBuildAgentDef } from './grok-build.js';
import { hermesAgentDef } from './hermes.js';
import { kiloAgentDef } from './kilo.js';
import { kimiAgentDef } from './kimi.js';
import { kiroAgentDef } from './kiro.js';
import { opencodeAgentDef } from './opencode.js';
import { piAgentDef } from './pi.js';
import { qoderAgentDef } from './qoder.js';
import { qwenAgentDef } from './qwen.js';
import { reasonixAgentDef } from './reasonix.js';
import { traeCliAgentDef } from './trae-cli.js';
import { vibeAgentDef } from './vibe.js';
import { readLocalAgentProfileDefs } from '../local-profiles.js';

/** All built-in agent definitions (24 agents). */
const BUILTIN_DEFS: RuntimeAgentDef[] = [
  aiderAgentDef,
  ampAgentDef,
  amrAgentDef,
  antigravityAgentDef,
  claudeAgentDef,
  codebuddyAgentDef,
  codexAgentDef,
  copilotAgentDef,
  cursorAgentDef,
  deepseekAgentDef,
  devinAgentDef,
  geminiAgentDef,
  grokBuildAgentDef,
  hermesAgentDef,
  kiloAgentDef,
  kimiAgentDef,
  kiroAgentDef,
  opencodeAgentDef,
  piAgentDef,
  qoderAgentDef,
  qwenAgentDef,
  reasonixAgentDef,
  traeCliAgentDef,
  vibeAgentDef,
] as RuntimeAgentDef[];

/**
 * Merge local agent profiles on top of built-in definitions.
 * Reads from ~/.open-design/agents.local.json (or OD_AGENT_PROFILES_CONFIG).
 * Failures (missing file, bad JSON, etc.) are silently swallowed —
 * the built-in definitions always work.
 */
function mergeLocalProfiles(): RuntimeAgentDef[] {
  try {
    const localDefs = readLocalAgentProfileDefs(BUILTIN_DEFS);
    if (localDefs.length > 0) {
      return [...BUILTIN_DEFS, ...localDefs];
    }
  } catch {
    // Config file missing or malformed — use built-in definitions only.
  }
  return BUILTIN_DEFS;
}

/** All agent definitions (built-in + local profiles). */
export const AGENT_DEFS: RuntimeAgentDef[] = mergeLocalProfiles();

/** Look up an agent definition by ID. */
export function getAgentDef(id: string): RuntimeAgentDef | undefined {
  return AGENT_DEFS.find((def) => def.id === id);
}

/** Re-export built-in defs for consumers that need to distinguish. */
export { BUILTIN_DEFS };

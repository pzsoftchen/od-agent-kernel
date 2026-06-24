/**
 * SKILL.md file scanner.
 * Extracted from apps/daemon/src/skills.ts.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export type SkillSource = 'built-in' | 'user';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  dir: string;
  body: string;
  triggers?: string[];
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  triggers?: string[];
}

function parseFrontmatter(content: string): { data: SkillFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const yaml = match[1]!;
  const body = match[2]!;
  const data: SkillFrontmatter = {};
  for (const line of yaml.split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!;
    let value: string | string[] = kv[2]!.trim();
    if (key === 'triggers') {
      value = value.replace(/[\[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    (data as Record<string, unknown>)[key] = value;
  }
  return { data, body };
}

export async function parseSkillFile(filePath: string): Promise<{ data: SkillFrontmatter; body: string }> {
  const content = await readFile(filePath, 'utf-8');
  return parseFrontmatter(content);
}

export async function listSkills(roots: string | readonly string[]): Promise<SkillInfo[]> {
  const rootDirs = Array.isArray(roots) ? roots : [roots];
  const skills: SkillInfo[] = [];

  for (const root of rootDirs) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(root, entry.name);
        const skillFile = path.join(skillDir, 'SKILL.md');
        try {
          const parsed = await parseSkillFile(skillFile);
          skills.push({
            id: entry.name,
            name: parsed.data.name ?? entry.name,
            description: parsed.data.description ?? '',
            source: 'user' as SkillSource,
            dir: skillDir,
            body: parsed.body,
            triggers: parsed.data.triggers,
          });
        } catch {
          // Skip dirs without SKILL.md
        }
      }
    } catch {
      // Root dir doesn't exist — skip
    }
  }

  return skills;
}

export function findSkillById(skills: SkillInfo[], id: string): SkillInfo | undefined {
  return skills.find((s) => s.id === id);
}

// ---- Trigger matching ----

/**
 * A trigger can be:
 *  - A plain substring: "review" matches any message containing "review"
 *  - A /regex/ pattern: "/review|audit/" matches messages with "review" or "audit"
 *  - A keyword prefix "kw:": "kw:review,audit" matches whole-word keywords
 *
 * Matching is case-insensitive.
 */
export function matchTrigger(message: string, trigger: string): boolean {
  const trimmed = trigger.trim();
  if (!trimmed) return false;

  const msg = message.toLowerCase();

  // Regex pattern: /pattern/flags
  const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/);
  if (regexMatch) {
    try {
      const re = new RegExp(regexMatch[1]!, regexMatch[2] || 'i');
      return re.test(message); // Use original message for regex (flags handle case)
    } catch {
      return false; // Invalid regex — don't match
    }
  }

  // Keyword prefix: "kw:word1,word2,..."
  if (trimmed.startsWith('kw:')) {
    const keywords = trimmed.slice(3).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.length === 0) return false;
    // Match whole words only
    const wordBoundary = /\b\w+\b/g;
    const msgWords = new Set(msg.match(wordBoundary)?.map((w) => w.toLowerCase()) ?? []);
    return keywords.some((kw) => msgWords.has(kw));
  }

  // Default: substring match (case-insensitive)
  return msg.includes(trimmed.toLowerCase());
}

/**
 * Find the first workflow whose triggers match the given message.
 * Returns the matching SkillInfo, or null if no trigger matches.
 *
 * Workflows without triggers never auto-match.
 */
export function findMatchingWorkflow(
  skills: SkillInfo[],
  message: string,
): SkillInfo | null {
  for (const skill of skills) {
    if (!skill.triggers || skill.triggers.length === 0) continue;
    for (const trigger of skill.triggers) {
      if (matchTrigger(message, trigger)) {
        return skill;
      }
    }
  }
  return null;
}

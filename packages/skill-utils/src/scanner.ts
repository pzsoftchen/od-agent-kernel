/**
 * SKILL.md file scanner.
 * Extracted from apps/daemon/src/skills.ts.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createApiError } from '@od-kernel/types';

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

/**
 * Skill file staging to cwd for agent access.
 * Extracted from apps/daemon/src/cwd-aliases.ts.
 */

import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const SKILLS_CWD_ALIAS = '.od-skills';

export async function stageSkillFiles(
  cwd: string,
  skill: { dir: string; name: string },
): Promise<string> {
  const aliasDir = path.join(cwd, SKILLS_CWD_ALIAS, skill.name);
  await mkdir(aliasDir, { recursive: true });
  await cp(skill.dir, aliasDir, { recursive: true, dereference: true });
  return aliasDir;
}

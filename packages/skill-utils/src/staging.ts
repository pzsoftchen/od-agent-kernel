/**
 * Skill file staging to cwd for agent access.
 * Extracted from apps/daemon/src/cwd-aliases.ts.
 */

import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

export const SKILLS_CWD_ALIAS = '.od-skills';

/**
 * Sanitize a skill name for use as a single directory segment.
 *
 * `skill.name` originates from a SKILL.md frontmatter `name:` field
 * (user-controlled, see scanner.ts) and flows directly into `path.join`.
 * Without sanitization a name like `../../../etc/cron.d` would resolve the
 * staging dir outside `cwd/.od-skills`, letting a malicious skill write
 * arbitrary files (authorized_keys, .bashrc, …).
 *
 * We REJECT (not silently rewrite) any name that contains a path separator,
 * `..`, a NUL byte, or that trims empty. A skill name is expected to be a
 * single plain label; anything else is treated as a traversal attempt so
 * the failure is explicit rather than a confusingly-named staged dir.
 */
function sanitizeSkillName(name: string): string {
  const cleaned = String(name ?? '').trim();
  if (
    !cleaned ||
    cleaned === '.' ||
    cleaned === '..' ||
    cleaned.includes('/') ||
    cleaned.includes('\\') ||
    cleaned.includes('..') ||
    cleaned.includes('\0')
  ) {
    throw new Error(`Invalid skill name (path traversal blocked): "${name}"`);
  }
  return cleaned;
}

export async function stageSkillFiles(
  cwd: string,
  skill: { dir: string; name: string },
): Promise<string> {
  const skillsRoot = path.resolve(cwd, SKILLS_CWD_ALIAS);
  const safeName = sanitizeSkillName(skill.name);
  const aliasDir = path.resolve(skillsRoot, safeName);

  // Defense in depth: even after sanitization, confirm the resolved dir is
  // strictly contained under the staging root. Guards against any platform
  // path-normalization quirks the basename strip didn't anticipate.
  const rel = path.relative(skillsRoot, aliasDir);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Skill staging path escapes ${SKILLS_CWD_ALIAS}/: "${skill.name}"`);
  }

  await mkdir(aliasDir, { recursive: true });
  await cp(skill.dir, aliasDir, { recursive: true, dereference: true });
  return aliasDir;
}

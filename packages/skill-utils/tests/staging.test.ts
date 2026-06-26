import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stageSkillFiles, SKILLS_CWD_ALIAS } from '../src/staging.js';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Regression: stageSkillFiles used `skill.name` (from SKILL.md frontmatter,
// user-controlled) directly in path.join. A name like `../../../etc/...`
// resolved the staging dir outside cwd/.od-skills, letting a malicious skill
// write arbitrary files. The fix sanitizes the name and verifies the
// resolved dir stays inside the staging root.

describe('stageSkillFiles — path traversal protection', () => {
  let workDir: string;
  let skillDir: string;

  beforeEach(async () => {
    workDir = path.join(tmpdir(), `od-stage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    skillDir = path.join(workDir, 'source-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# skill\nbody');
    await writeFile(path.join(skillDir, 'ref.txt'), 'sidecar');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('stages a normally-named skill under .od-skills', async () => {
    const staged = await stageSkillFiles(workDir, { dir: skillDir, name: 'code-review' });
    expect(staged).toBe(path.resolve(workDir, SKILLS_CWD_ALIAS, 'code-review'));
    await expect(readFile(path.join(staged, 'SKILL.md'), 'utf-8')).resolves.toContain('body');
    await expect(readFile(path.join(staged, 'ref.txt'), 'utf-8')).resolves.toBe('sidecar');
  });

  it.each([
    '../../../etc/evil',
    '..',
    '../..',
    'a/../../b',
    'foo\\..\\bar',
    'name\0x',
    '',
    '   ',
    '.',
  ])('rejects traversal / invalid name: %p', async (badName) => {
    await expect(stageSkillFiles(workDir, { dir: skillDir, name: badName })).rejects.toThrow();
    // Confirm nothing was written outside .od-skills (no traversal file created).
    // The only legitimate write target is under .od-skills.
    const outsideMarker = path.join(workDir, 'evil-marker.txt');
    await expect(readFile(outsideMarker, 'utf-8')).rejects.toThrow();
  });

  it('rejects an absolute path as the skill name', async () => {
    const abs = path.join(workDir, 'absolute-escape');
    await expect(stageSkillFiles(workDir, { dir: skillDir, name: abs })).rejects.toThrow();
  });

  it('rejects a name with embedded separators (no silent basename rewrite)', async () => {
    // Policy: any separator or `..` is rejected outright, not rewritten, so a
    // traversal attempt can't smuggle a different dir name through.
    await expect(stageSkillFiles(workDir, { dir: skillDir, name: 'safe/../evil' })).rejects.toThrow();
  });
});

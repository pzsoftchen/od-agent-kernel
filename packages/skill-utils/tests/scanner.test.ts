import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/scanner.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('parseSkillFile', () => {
  it('parses YAML frontmatter and body', async () => {
    const dir = path.join(tmpdir(), `skill-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'SKILL.md');
    await writeFile(filePath, '---\nname: code-review\ndescription: Review code for security issues\ntriggers: [review, audit]\n---\n# Code Review Workflow\n\n1. Check OWASP Top 10\n2. Report findings');

    try {
      const result = await parseSkillFile(filePath);
      expect(result.data.name).toBe('code-review');
      expect(result.data.description).toBe('Review code for security issues');
      expect(result.data.triggers).toEqual(['review', 'audit']);
      expect(result.body).toContain('# Code Review Workflow');
      expect(result.body).not.toContain('---');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('handles missing frontmatter gracefully', async () => {
    const dir = path.join(tmpdir(), `skill-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'SKILL.md');
    await writeFile(filePath, '# Just a heading\n\nSome body text');

    try {
      const result = await parseSkillFile(filePath);
      expect(result.data.name).toBeUndefined();
      expect(result.data.description).toBeUndefined();
      expect(result.body).toContain('# Just a heading');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

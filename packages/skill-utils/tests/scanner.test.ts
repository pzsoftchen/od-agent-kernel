import { describe, it, expect } from 'vitest';
import { parseSkillFile, matchTrigger, findMatchingWorkflow } from '../src/scanner.js';
import type { SkillInfo } from '../src/scanner.js';
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

describe('matchTrigger', () => {
  // ---- Substring matching (default) ----

  it('matches substring (case-insensitive)', () => {
    expect(matchTrigger('Please review this code', 'review')).toBe(true);
    expect(matchTrigger('Please REVIEW this code', 'review')).toBe(true);
  });

  it('rejects non-matching substring', () => {
    expect(matchTrigger('Please analyze this data', 'review')).toBe(false);
  });

  it('rejects empty trigger', () => {
    expect(matchTrigger('anything', '')).toBe(false);
    expect(matchTrigger('anything', '  ')).toBe(false);
  });

  // ---- Regex matching ----

  it('matches regex pattern', () => {
    expect(matchTrigger('review this code', '/review|audit/')).toBe(true);
    expect(matchTrigger('audit this code', '/review|audit/')).toBe(true);
    expect(matchTrigger('analyze this code', '/review|audit/')).toBe(false);
  });

  it('handles regex with flags', () => {
    expect(matchTrigger('REVIEW THIS', '/review/i')).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    expect(matchTrigger('anything', '/[invalid/')).toBe(false);
  });

  // ---- Keyword matching (kw:) ----

  it('matches whole-word keywords', () => {
    expect(matchTrigger('please review this code', 'kw:review,audit')).toBe(true);
    expect(matchTrigger('conduct an audit', 'kw:review,audit')).toBe(true);
  });

  it('rejects partial word matches for keywords', () => {
    // "preview" contains "review" but is not the whole word
    expect(matchTrigger('this is a preview', 'kw:review')).toBe(false);
  });

  it('matches comma-separated keywords', () => {
    expect(matchTrigger('analyze data', 'kw:review, analyze, audit')).toBe(true);
  });
});

describe('findMatchingWorkflow', () => {
  function makeSkill(id: string, triggers: string[]): SkillInfo {
    return {
      id,
      name: id,
      description: '',
      source: 'user',
      dir: `/tmp/${id}`,
      body: '',
      triggers,
    };
  }

  it('returns matching workflow by trigger', () => {
    const skills = [
      makeSkill('code-review', ['review', 'audit']),
      makeSkill('data-analysis', ['analyze', 'statistics']),
    ];
    const result = findMatchingWorkflow(skills, 'please review this code');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('code-review');
  });

  it('returns null when no trigger matches', () => {
    const skills = [
      makeSkill('code-review', ['review']),
      makeSkill('data-analysis', ['analyze']),
    ];
    const result = findMatchingWorkflow(skills, 'deploy this to production');
    expect(result).toBeNull();
  });

  it('skips skills without triggers', () => {
    const skills = [
      { ...makeSkill('generic', []), triggers: undefined },
      makeSkill('code-review', ['review']),
    ];
    const result = findMatchingWorkflow(skills, 'review this');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('code-review');
  });

  it('returns first match when multiple match', () => {
    const skills = [
      makeSkill('code-review', ['review']),
      makeSkill('security-audit', ['review', 'security']),
    ];
    const result = findMatchingWorkflow(skills, 'review this');
    expect(result!.id).toBe('code-review'); // first match wins
  });

  it('returns null for empty skills list', () => {
    expect(findMatchingWorkflow([], 'anything')).toBeNull();
  });
});

/**
 * Integration test: verify that `od-kernel init` creates a valid domain project
 * that can be loaded, extended, and rendered correctly by the dev command flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { listSkills, findMatchingWorkflow } from '@od-kernel/skill-utils';
import { renderTemplate } from '../src/template-engine.js';

describe('init→dev integration', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'od-kernel-test-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ---- P0-1: init creates a valid project ----

  describe('init command', () => {
    it('creates the domain directory structure with valid output', async () => {
      const cwd = process.cwd();
      try {
        process.chdir(tmpDir);
        await initCommand('init-test', { template: 'minimal' });

        const dir = join(tmpDir, 'init-test');

        // Verify directory structure
        await expect(readFile(join(dir, 'domain', 'prompts.md'), 'utf-8')).resolves.toBeDefined();
        await expect(readFile(join(dir, 'package.json'), 'utf-8')).resolves.toBeDefined();
        await expect(readFile(join(dir, 'README.md'), 'utf-8')).resolves.toBeDefined();

        // Verify prompts.md contains all template blocks for extension
        const promptsContent = await readFile(join(dir, 'domain', 'prompts.md'), 'utf-8');
        expect(promptsContent).toContain('{{#context:body}}');
        expect(promptsContent).toContain('{{#workflow:body}}');
        expect(promptsContent).toContain('{{#memory}}');
        expect(promptsContent).toContain('{{#instructions}}');
        expect(promptsContent).toContain('{{userPrompt}}');

        // Verify package.json — no unpublished dependency
        const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('init-test');
        expect(pkg.private).toBe(true);
        expect(pkg.scripts.dev).toBe('od-kernel dev');
        expect(pkg.dependencies).toBeUndefined();

        // Verify README has setup instructions
        const readme = await readFile(join(dir, 'README.md'), 'utf-8');
        expect(readme).toContain('init-test');
        expect(readme).toContain('od-kernel dev');
        expect(readme).toContain('od-kernel add');
      } finally {
        process.chdir(cwd);
      }
    });
  });

  // ---- P0-2: template rendering with context/workflow/memory ----

  describe('template rendering', () => {
    it('renders minimal template with all optional blocks', () => {
      const template = `# Role
You are a helpful assistant.

{{#context:body}}
# Domain Context: {{context:title}}
{{context:body}}
{{/context:body}}

{{#workflow:body}}
# Workflow: {{workflow:name}}
{{workflow:body}}
{{/workflow:body}}

{{#memory}}
# Memory
{{memory}}
{{/memory}}

{{#instructions}}
# Instructions
{{instructions}}
{{/instructions}}

# Request
{{userPrompt}}`;

      // Case 1: no optional blocks — only userPrompt
      const result1 = renderTemplate(template, { userPrompt: 'Hello' });
      expect(result1).toContain('# Role');
      expect(result1).toContain('# Request');
      expect(result1).toContain('Hello');
      expect(result1).not.toContain('# Domain Context');
      expect(result1).not.toContain('# Workflow');
      expect(result1).not.toContain('# Memory');
      expect(result1).not.toContain('# Instructions');

      // Case 2: with context and workflow
      const result2 = renderTemplate(template, {
        userPrompt: 'Review this',
        'context:body': 'Always check OWASP Top 10',
        'context:title': 'Security Rules',
        'workflow:body': '1. Scan\n2. Report',
        'workflow:name': 'Security Audit',
      });
      expect(result2).toContain('# Domain Context: Security Rules');
      expect(result2).toContain('OWASP Top 10');
      expect(result2).toContain('# Workflow: Security Audit');
      expect(result2).toContain('1. Scan');
      expect(result2).not.toContain('# Memory');

      // Case 3: with memory
      const result3 = renderTemplate(template, {
        userPrompt: 'Hello',
        memory: 'User prefers Chinese replies',
      });
      expect(result3).toContain('# Memory');
      expect(result3).toContain('Chinese replies');

      // Case 4: all blocks
      const result4 = renderTemplate(template, {
        userPrompt: 'Full test',
        'context:body': 'Domain rules',
        'context:title': 'Test Domain',
        'workflow:body': 'Steps',
        'workflow:name': 'Test Flow',
        memory: 'Memory content',
        instructions: 'Custom instructions',
      });
      expect(result4).toContain('# Domain Context: Test Domain');
      expect(result4).toContain('# Workflow: Test Flow');
      expect(result4).toContain('# Memory');
      expect(result4).toContain('Memory content');
      expect(result4).toContain('# Instructions');
      expect(result4).toContain('Custom instructions');
    });
  });

  // ---- P1-1: skill-utils requiresContext parsing ----

  describe('skill-utils requiresContext', () => {
    let skills: Awaited<ReturnType<typeof listSkills>>;

    beforeAll(async () => {
      skills = await listSkills([join(__dirname, 'fixtures')]);
    });

    it('defaults requiresContext to true when not specified', () => {
      const skill = skills.find((s) => s.id === 'workflow-no-requires-context');
      expect(skill).toBeDefined();
      expect(skill!.requiresContext).toBe(true);
    });

    it('parses requiresContext: false from frontmatter', () => {
      const skill = skills.find((s) => s.id === 'workflow-requires-context-false');
      expect(skill).toBeDefined();
      expect(skill!.requiresContext).toBe(false);
    });

    it('parses requiresContext: true from frontmatter', () => {
      const skill = skills.find((s) => s.id === 'workflow-requires-context-true');
      expect(skill).toBeDefined();
      expect(skill!.requiresContext).toBe(true);
    });
  });

  // ---- P2-2: add command generates helpful SKILL.md ----

  describe('add command', () => {
    it('add context creates CONTEXT.md', async () => {
      const dir = join(tmpDir, 'add-context-test');
      const cwd = process.cwd();
      try {
        await mkdir(join(dir, 'domain', 'contexts'), { recursive: true });
        await mkdir(join(dir, 'domain', 'workflows'), { recursive: true });
        process.chdir(dir);
        await addCommand('context', 'myctx');

        const content = await readFile(
          join(dir, 'domain', 'contexts', 'myctx', 'CONTEXT.md'),
          'utf-8',
        );
        expect(content).toContain('# myctx');
        expect(content).toContain('## Overview');
      } finally {
        process.chdir(cwd);
      }
    });

    it('add workflow creates SKILL.md with trigger syntax docs', async () => {
      const dir = join(tmpDir, 'add-workflow-test');
      const cwd = process.cwd();
      try {
        await mkdir(join(dir, 'domain', 'contexts'), { recursive: true });
        await mkdir(join(dir, 'domain', 'workflows'), { recursive: true });
        process.chdir(dir);
        await addCommand('workflow', 'myflow');

        const content = await readFile(
          join(dir, 'domain', 'workflows', 'myflow', 'SKILL.md'),
          'utf-8',
        );
        expect(content).toContain('name: myflow');
        expect(content).toContain('triggers: []');
        expect(content).toContain('Substring match');
        expect(content).toContain('Regex pattern');
        expect(content).toContain('Keyword match');
        expect(content).toContain('kw:review');
        expect(content).toContain('requiresContext');
      } finally {
        process.chdir(cwd);
      }
    });
  });

  // ---- Workflow auto-matching ----

  describe('workflow auto-matching', () => {
    it('matches substring triggers', () => {
      const skills = [
        {
          id: 'review', name: 'Code Review', description: '',
          source: 'user' as const, dir: '/tmp', body: '',
          triggers: ['review'], requiresContext: true,
        },
      ];
      expect(findMatchingWorkflow(skills, 'Please review this code')?.id).toBe('review');
    });

    it('matches regex triggers', () => {
      const skills = [
        {
          id: 'security', name: 'Security Audit', description: '',
          source: 'user' as const, dir: '/tmp', body: '',
          triggers: ['/audit|security check/i'], requiresContext: true,
        },
      ];
      expect(findMatchingWorkflow(skills, 'Run a security check on this')?.id).toBe('security');
    });

    it('matches keyword triggers', () => {
      const skills = [
        {
          id: 'deploy', name: 'Deploy', description: '',
          source: 'user' as const, dir: '/tmp', body: '',
          triggers: ['kw:deploy,release,ship'], requiresContext: true,
        },
      ];
      expect(findMatchingWorkflow(skills, 'Let me ship this update')?.id).toBe('deploy');
    });

    it('does not match unrelated messages', () => {
      const skills = [
        {
          id: 'review', name: 'Code Review', description: '',
          source: 'user' as const, dir: '/tmp', body: '',
          triggers: ['review'], requiresContext: true,
        },
      ];
      expect(findMatchingWorkflow(skills, 'Write a poem')).toBeNull();
    });

    it('workflows without triggers never auto-match', () => {
      const skills = [
        {
          id: 'helper', name: 'Helper', description: '',
          source: 'user' as const, dir: '/tmp', body: '',
          triggers: undefined, requiresContext: true,
        },
      ];
      expect(findMatchingWorkflow(skills, 'help me')).toBeNull();
    });
  });
});

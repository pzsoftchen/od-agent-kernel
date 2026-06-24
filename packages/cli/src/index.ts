#!/usr/bin/env node
/**
 * @od-kernel/cli — npx CLI entry point.
 *
 * Usage:
 *   npx @od-kernel/cli init my-app --template code-review
 *   npx @od-kernel/cli dev
 *   npx @od-kernel/cli add context security-audit
 *   npx @od-kernel/cli add workflow code-review
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('od-kernel')
  .description('Agent orchestration kernel CLI — extend business scenarios with Markdown alone')
  .version('0.1.0');

program
  .command('init <name>')
  .description('Scaffold a new business application')
  .option('-t, --template <name>', 'Template to use (minimal, code-review, legal-review, data-analysis)', 'minimal')
  .action(async (name: string, options: { template?: string }) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(name, options);
  });

program
  .command('dev')
  .description('Start development server with auto-discovery of domain/')
  .option('-p, --port <number>', 'Port to listen on', '7456')
  .action(async (options: { port?: string }) => {
    const { devCommand } = await import('./commands/dev.js');
    await devCommand(options);
  });

program
  .command('add <type> <name>')
  .description('Add a domain context or workflow')
  .action(async (type: string, name: string) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(type, name);
  });

program
  .command('templates')
  .description('List available project templates')
  .action(async () => {
    // Dynamically scan the templates directory so new templates
    // show up automatically without manual CLI updates.
    const { readdir } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const templatesDir = path.join(__dirname, 'templates');

    try {
      const entries = await readdir(templatesDir, { withFileTypes: true });
      const templates = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      if (templates.length === 0) {
        console.log('No templates found.');
        return;
      }

      // Read descriptions from each template's SKILL.md or CONTEXT.md
      // Fall back to the directory name if no description is found.
      const { readFile } = await import('node:fs/promises');
      const templateDescriptions: { name: string; description: string }[] = [];

      for (const name of templates) {
        let description = '';
        // Try to extract the first heading from prompts.md as a one-line hint
        const promptsPath = path.join(templatesDir, name, 'prompts.md');
        try {
          const content = await readFile(promptsPath, 'utf-8');
          const firstLine = content.split('\n').find((l) => l.startsWith('# '));
          if (firstLine) {
            description = firstLine.replace(/^# /, '').trim();
          }
        } catch {
          description = `${name} template`;
        }
        templateDescriptions.push({ name, description });
      }

      console.log('Available templates:');
      for (const t of templateDescriptions) {
        const label = `  ${t.name.padEnd(16)} — ${t.description}`;
        console.log(label);
      }
      console.log('');
      console.log('Usage: npx @od-kernel/cli init my-app --template <name>');
    } catch {
      // If templates directory doesn't exist, show a sensible message
      console.log('No templates directory found.');
      console.log('Usage: npx @od-kernel/cli init my-app --template <name>');
    }
  });

program
  .command('agents')
  .description('List available agents on this system')
  .action(async () => {
    try {
      const { createAgentOrchestrator } = await import('@od-kernel/agent-runtime');
      const orchestrator = createAgentOrchestrator();
      const agents = await orchestrator.listAgents();
      console.log('Agent detection results:');
      console.log('');
      for (const agent of agents) {
        const status = agent.available ? '✅ available' : '❌ unavailable';
        const version = agent.version ? ` (${agent.version})` : '';
        console.log(`  ${agent.name.padEnd(20)} ${status}${version}`);
        if (agent.authStatus) {
          console.log(`    auth: ${agent.authStatus}`);
        }
        if (agent.diagnostics?.length) {
          for (const d of agent.diagnostics) {
            console.log(`    ⚠️  ${d.message}`);
          }
        }
      }
      console.log('');
      console.log(`${agents.filter(a => a.available).length}/${agents.length} agents available`);
    } catch (err) {
      console.error('Failed to detect agents:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse(process.argv);

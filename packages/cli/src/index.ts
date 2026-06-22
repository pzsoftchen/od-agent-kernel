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

program.parse(process.argv);

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
  .action(() => {
    console.log('Available templates:');
    console.log('  minimal         — Empty domain files, start from scratch');
    console.log('  code-review     — Security-focused code review setup');
    console.log('  legal-review     — Contract and legal document review');
    console.log('  data-analysis   — Data analysis and visualization');
    console.log('');
    console.log('Usage: npx @od-kernel/cli init my-app --template <name>');
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

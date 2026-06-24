import { mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initCommand(name: string, options: { template?: string }): Promise<void> {
  const targetDir = path.join(process.cwd(), name);
  const template = options.template ?? 'minimal';

  // Create directory structure
  await mkdir(path.join(targetDir, 'domain', 'contexts'), { recursive: true });
  await mkdir(path.join(targetDir, 'domain', 'workflows'), { recursive: true });

  // Copy template files
  const templateDir = path.join(__dirname, '..', 'templates', template);
  try {
    await cp(templateDir, path.join(targetDir, 'domain'), { recursive: true });
  } catch {
    // Template not found — create minimal default
  }

  // Create domain/prompts.md if not exists
  const promptsPath = path.join(targetDir, 'domain', 'prompts.md');
  try {
    await writeFile(promptsPath, `# Role\nYou are a helpful AI assistant.\n\n# Request\n{{userPrompt}}\n`, { flag: 'wx' });
  } catch {
    // Already exists
  }

  // Create package.json
  await writeFile(
    path.join(targetDir, 'package.json'),
    JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        scripts: {
          dev: 'od-kernel dev',
          start: 'od-kernel dev',
          postinstall: 'echo "✅ Run: npx od-kernel dev"',
        },
        devDependencies: {},
      },
      null,
      2,
    ) + '\n',
  );

  // Create README.md with setup instructions
  await writeFile(
    path.join(targetDir, 'README.md'),
    [
      `# ${name}`,
      '',
      '## Setup',
      '',
      'Install the od-kernel CLI:',
      '',
      '```bash',
      '# From npm (once published):',
      'npm install -g @od-kernel/cli',
      '',
      '# Or from monorepo (development):',
      'cd path/to/od-agent-kernel/packages/cli',
      'pnpm link --global',
      '```',
      '',
      '## Development',
      '',
      '```bash',
      'od-kernel dev          # Start dev server on :7456',
      'od-kernel add context <name>   # Add a domain context',
      'od-kernel add workflow <name>  # Add a workflow',
      '```',
      '',
      '## Project Structure',
      '',
      '```',
      'domain/',
      '├── prompts.md              # System prompt template (Mustache)',
      '├── contexts/',
      '│   └── <name>/',
      '│       └── CONTEXT.md       # Domain knowledge',
      '└── workflows/',
      '    └── <name>/',
      '        └── SKILL.md         # Workflow with triggers',
      '```',
      '',
    ].join('\n') + '\n',
  );

  console.log(`✅ Created ${name}/`);
  console.log(`   cd ${name} && od-kernel dev`);
}

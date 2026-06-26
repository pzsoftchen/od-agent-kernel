import { mkdir, writeFile, cp, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

/**
 * Resolve a template directory that works in every execution context:
 *   - source (tests):      src/commands/init.ts   → ../templates/<name>
 *   - bundled & inlined:   dist/index.mjs          → ./templates/<name>
 *   - bundled & split:     dist/commands/init.mjs  → ../templates/<name>
 * esbuild may inline this module into the top-level bundle or emit it as a
 * chunk under dist/commands/, so the templates dir is sometimes a sibling
 * and sometimes a parent. Try both and return the first that exists.
 */
async function resolveTemplateDir(template: string): Promise<string | null> {
  const candidates = [
    path.join(__dirname, 'templates', template),
    path.join(__dirname, '..', 'templates', template),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // not present — try next candidate
    }
  }
  return null;
}

function validateName(name: string, label: string): void {
  if (!name || name !== name.trim()) {
    throw new Error(`${label} must not be empty or have leading/trailing whitespace`);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error(`${label} contains invalid characters: "${name}"`);
  }
}

export async function initCommand(name: string, options: { template?: string }): Promise<void> {
  validateName(name, 'Project name');
  const targetDir = path.join(process.cwd(), name);
  const template = options.template ?? 'minimal';

  // Create directory structure
  await mkdir(path.join(targetDir, 'domain', 'contexts'), { recursive: true });
  await mkdir(path.join(targetDir, 'domain', 'workflows'), { recursive: true });

  // Copy template files (resolved across source / inlined / split layouts).
  // If the template dir can't be found, fall through — the minimal prompts.md
  // write below still produces a usable scaffold.
  const templateDir = await resolveTemplateDir(template);
  if (templateDir) {
    await cp(templateDir, path.join(targetDir, 'domain'), { recursive: true });
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

  // Auto-install dependencies so the project is ready to run immediately.
  // Skip when pnpm binary isn't available (e.g. CI, Docker, or test fixtures).
  console.log('Installing dependencies...');
  try {
    await execFileAsync('pnpm', ['--version'], { timeout: 5_000 });
    await execFileAsync('pnpm', ['install'], { cwd: targetDir, timeout: 60_000 });
    console.log('✅ Dependencies installed');
  } catch {
    console.log('⚠️  Could not run "pnpm install" automatically.');
    console.log(`   Run it manually: cd ${name} && pnpm install`);
  }
}

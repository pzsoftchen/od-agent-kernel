import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function addCommand(type: string, name: string): Promise<void> {
  const cwd = process.cwd();

  if (type === 'context') {
    const dir = path.join(cwd, 'domain', 'contexts', name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'CONTEXT.md'),
      `# ${name}\n\n## Overview\nDescribe the domain context here.\n\n## Rules\n- Rule 1\n- Rule 2\n`,
    );
    console.log(`✅ Created domain/contexts/${name}/CONTEXT.md`);
  } else if (type === 'workflow') {
    const dir = path.join(cwd, 'domain', 'workflows', name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'SKILL.md'),
      [
        '---',
        `name: ${name}`,
        'description: Describe the workflow',
        '# Triggers support three syntaxes:',
        '#   - Substring match (case-insensitive):   review',
        '#   - Regex pattern:                         /review|audit code/i',
        '#   - Keyword match (whole words):           kw:review,audit,security',
        '# Separate multiple triggers with YAML list:',
        '#   triggers:',
        '#     - review',
        '#     - /security audit/i',
        'triggers: []',
        '# requiresContext: true   # Whether this workflow needs a domain context',
        '---',
        '',
        `# ${name} Workflow`,
        '',
        '1. Step one',
        '2. Step two',
        '3. Step three',
        '',
      ].join('\n') + '\n',
    );
    console.log(`✅ Created domain/workflows/${name}/SKILL.md`);
  } else {
    console.error(`Unknown type: ${type}. Use 'context' or 'workflow'.`);
  }
}

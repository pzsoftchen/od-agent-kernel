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
      `---\nname: ${name}\ndescription: Describe the workflow\ntriggers: []\n---\n# ${name} Workflow\n\n1. Step one\n2. Step two\n3. Step three\n`,
    );
    console.log(`✅ Created domain/workflows/${name}/SKILL.md`);
  } else {
    console.error(`Unknown type: ${type}. Use 'context' or 'workflow'.`);
  }
}

import { createApp, createDaemonRunService, registerHealthRoutes, registerAgentRoutes } from '@od-kernel/daemon-core';
import { createChatRouter, composePrompt } from '@od-kernel/chat-service';
import { createAgentOrchestrator } from '@od-kernel/agent-runtime';
import { listSkills, stageSkillFiles } from '@od-kernel/skill-utils';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { renderTemplate } from '../template-engine.js';

interface DomainContext {
  id: string; title: string; body: string;
}

export async function devCommand(options: { port?: string }): Promise<void> {
  const port = parseInt(options.port ?? '7456', 10);
  const cwd = process.cwd();
  const domainDir = path.join(cwd, 'domain');

  // Auto-discover contexts
  const contexts: DomainContext[] = [];
  try {
    const contextDirs = await readdir(path.join(domainDir, 'contexts'), { withFileTypes: true });
    for (const entry of contextDirs) {
      if (!entry.isDirectory()) continue;
      try {
        const body = await readFile(path.join(domainDir, 'contexts', entry.name, 'CONTEXT.md'), 'utf-8');
        const title = body.split('\n')[0]?.replace(/^#\s*/, '') ?? entry.name;
        contexts.push({ id: entry.name, title, body });
      } catch { /* skip */ }
    }
  } catch { /* no contexts dir */ }

  // Auto-discover workflows
  const workflows = await listSkills([path.join(domainDir, 'workflows')]);

  // Load prompts.md template
  let promptTemplate = '';
  try {
    promptTemplate = await readFile(path.join(domainDir, 'prompts.md'), 'utf-8');
  } catch { /* use default */ }

  // Infrastructure
  const app = createApp();
  const runs = createDaemonRunService();
  const orchestrator = createAgentOrchestrator();
  registerHealthRoutes(app);
  registerAgentRoutes(app, orchestrator);

  // Context endpoints
  app.get('/api/contexts', (_req, res) => res.json(contexts));
  app.get('/api/workflows', (_req, res) => res.json(workflows));

  // Chat router
  app.use('/api', createChatRouter({
    runs,
    orchestrator,
    composePrompt: (input) => {
      if (promptTemplate) {
        return renderTemplate(promptTemplate, {
          userPrompt: input.userPrompt,
          'context:body': input.activeContext?.body,
          'context:title': input.activeContext?.title,
          'context:id': input.activeContext?.id,
          'workflow:body': input.activeWorkflow?.body,
          'workflow:name': input.activeWorkflow?.name,
          instructions: input.instructions,
        });
      }
      return composePrompt(input);
    },
    resolveContext: {
      listAll: async () => contexts,
      resolve: async (id) => contexts.find((c) => c.id === id) ?? null,
    },
    resolveWorkflow: async (id) => {
      const skills = await listSkills([path.join(domainDir, 'workflows')]);
      const found = skills.find((w) => w.id === id);
      if (!found) return null;
      return {
        id: found.id,
        name: found.name,
        description: found.description,
        body: found.body,
        dir: found.dir,
        requiresContext: true,
      };
    },
    stageSkillFiles: async (cwd, workflow) => {
      const stagedDir = await stageSkillFiles(cwd, { dir: workflow.dir, name: workflow.name });
      return [stagedDir];
    },
  }));

  app.listen(port, async () => {
    const agents = await orchestrator.listAgents();
    console.log(`ready on :${port}`);
    console.log(`  contexts: ${contexts.length} found`);
    console.log(`  workflows: ${workflows.length} found`);
    console.log(`  agents: ${agents.map(a => a.id).join(', ')}`);
  });
}

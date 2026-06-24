import { createApp, createDaemonRunService, registerHealthRoutes, registerAgentRoutes } from '@od-kernel/daemon-core';
import { createChatRouter, composePrompt } from '@od-kernel/chat-service';
import { createAgentOrchestrator } from '@od-kernel/agent-runtime';
import { listSkills, stageSkillFiles, findMatchingWorkflow } from '@od-kernel/skill-utils';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { renderTemplate } from '../template-engine.js';

interface DomainContext {
  id: string; title: string; body: string;
}

export async function devCommand(options: { port?: string }): Promise<void> {
  const portStr = options.port ?? '7456';
  if (!/^\d{1,5}$/.test(portStr)) {
    throw new Error(`Invalid port: "${portStr}". Must be a number between 1-65535.`);
  }
  const port = parseInt(portStr, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`Port ${port} is out of range (1-65535).`);
  }
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

  // Load domain/memory.md if present
  let memoryText = '';
  try {
    memoryText = await readFile(path.join(domainDir, 'memory.md'), 'utf-8');
  } catch { /* no memory file — skip */ }

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
  // NOTE: Chat router routes already include /api prefix internally.
  // Do NOT add a mount prefix here — Express strips it and routes won't match.
  app.use(createChatRouter({
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
          'workflow:description': input.activeWorkflow?.description,
          instructions: input.instructions,
          memory: memoryText || undefined,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
        });
      }
      // Default prompt composer — propagate domain memory if loaded.
      return composePrompt({ ...input, memory: memoryText || input.memory });
    },
    resolveContext: {
      listAll: async () => contexts,
      resolve: async (id) => contexts.find((c) => c.id === id) ?? null,
    },
    resolveWorkflow: async (id) => {
      const found = workflows.find((w) => w.id === id);
      if (!found) return null;
      return {
        id: found.id,
        name: found.name,
        description: found.description,
        body: found.body,
        dir: found.dir,
        requiresContext: found.requiresContext ?? true,
      };
    },
    stageSkillFiles: async (cwd, workflow) => {
      const stagedDir = await stageSkillFiles(cwd, { dir: workflow.dir, name: workflow.name });
      return [stagedDir];
    },
    // Auto-match workflows based on trigger keywords in the user's message.
    // When a user says "review this code" and a workflow has trigger "review",
    // that workflow is automatically selected without explicit workflowId.
    autoMatchWorkflow: async (message: string) => {
      // Reuse the already-loaded workflows instead of re-reading from disk.
      const matched = findMatchingWorkflow(workflows, message);
      return matched?.id ?? null;
    },
  }));

  const server = app.listen(port, async () => {
    try {
      const agents = await orchestrator.listAgents();
      console.log(`ready on :${port}`);
      console.log(`  contexts: ${contexts.length} found`);
      console.log(`  workflows: ${workflows.length} found`);
      console.log(`  agents: ${agents.map(a => a.id).join(', ')}`);
    } catch (err) {
      console.error('Failed to detect agents on startup:', err instanceof Error ? err.message : String(err));
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Use -p <port> to choose a different one.`);
    } else {
      console.error(`Server error: ${err.message}`);
    }
    process.exit(1);
  });
}

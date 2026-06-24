import { createApp, createDaemonRunService, registerHealthRoutes, registerAgentRoutes } from '@od-kernel/daemon-core';
import { createChatRouter, composePrompt } from '@od-kernel/chat-service';
import { createAgentOrchestrator } from '@od-kernel/agent-runtime';
import { createProjectService, registerProjectRoutes } from '@od-kernel/project-service';
import { listSkills, stageSkillFiles, findMatchingWorkflow } from '@od-kernel/skill-utils';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderTemplate } from '../template-engine.js';
import type { Server } from 'node:http';

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

  // ---- Shared state that gets rebuilt on hot-reload ----

  /** Load domain/prompts.md (or .ts, if present) and return a composePrompt function. */
  async function loadPromptComposer(): Promise<
    (input: Parameters<typeof composePrompt>[0]) => string
  > {
    // Priority: domain/prompts.ts → domain/prompts.md → built-in default
    const tsPath = path.join(domainDir, 'prompts.ts');
    const mdPath = path.join(domainDir, 'prompts.md');

    if (existsSync(tsPath)) {
      try {
        // Dynamic import with cache busting for hot-reload support
        const mod = await import(`${pathToFileURL(tsPath).href}?t=${Date.now()}`);
        if (typeof mod.compose === 'function') {
          return mod.compose;
        }
        console.warn('[od-kernel] domain/prompts.ts found but no "compose" export — falling back to prompts.md');
      } catch (err) {
        console.warn(
          `[od-kernel] Failed to load domain/prompts.ts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Fall back to prompts.md with Mustache template engine
    if (existsSync(mdPath)) {
      const promptTemplate = await readFile(mdPath, 'utf-8');
      let memoryText = '';
      try {
        memoryText = await readFile(path.join(domainDir, 'memory.md'), 'utf-8');
      } catch { /* no memory file — skip */ }

      return (input) =>
        renderTemplate(promptTemplate, {
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

    // Built-in default
    let memoryText = '';
    try {
      memoryText = await readFile(path.join(domainDir, 'memory.md'), 'utf-8');
    } catch { /* skip */ }
    return (input) => composePrompt({ ...input, memory: memoryText || input.memory });
  }

  /** Auto-discover contexts from domain/contexts/. */
  async function discoverContexts(): Promise<DomainContext[]> {
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
    return contexts;
  }

  /** Build the full Express app with all routes. Isolated so hot-reload can rebuild it. */
  async function buildApp(): Promise<{ app: ReturnType<typeof createApp>; contexts: DomainContext[] }> {
    const app = createApp();
    const runs = createDaemonRunService();
    const orchestrator = createAgentOrchestrator();
    const contexts = await discoverContexts();
    const workflows = await listSkills([path.join(domainDir, 'workflows')]);
    const compose = await loadPromptComposer();

    // Standard routes
    registerHealthRoutes(app);
    registerAgentRoutes(app, orchestrator);

    // Project service (in-memory mode — SQLite via DB injection if needed)
    try {
      const projectService = createProjectService();
      registerProjectRoutes(app, projectService);
    } catch (err) {
      console.warn(`[od-kernel] Failed to register project routes: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Domain discovery endpoints
    app.get('/api/contexts', (_req, res) => res.json(contexts));
    app.get('/api/workflows', (_req, res) => res.json(workflows));

    // Chat router
    app.use(createChatRouter({
      runs,
      orchestrator,
      composePrompt: compose,
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
      autoMatchWorkflow: async (message: string) => {
        const matched = findMatchingWorkflow(workflows, message);
        return matched?.id ?? null;
      },
    }));

    return { app, contexts };
  }

  // ---- Start server ----

  let currentServer: Server | null = null;

  function listen(app: ReturnType<typeof createApp>, onReady: () => void): Server {
    const server = createServer(app);
    server.listen(port, () => onReady());
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Use -p <port> to choose a different one.`);
      } else {
        console.error(`Server error: ${err.message}`);
      }
      process.exit(1);
    });
    return server;
  }

  function swapServer(newApp: ReturnType<typeof createApp>, contexts: DomainContext[], workflowsCount: number) {
    const oldServer = currentServer;

    currentServer = listen(newApp, async () => {
      // Close the old server AFTER the new one is listening —
      // this avoids a gap where the port is unbound.
      if (oldServer) {
        oldServer.close(() => {
          // Cleanup complete
        });
      }

      try {
        const orchestrator = createAgentOrchestrator();
        const agents = await orchestrator.listAgents();
        console.log(`[od-kernel] ready on :${port} (reloaded)`);
        console.log(`  contexts: ${contexts.length} found`);
        console.log(`  workflows: ${workflowsCount} found`);
        console.log(`  agents: ${agents.map(a => a.id).join(', ')}`);
      } catch (err) {
        console.error('Failed to detect agents on reload:', err instanceof Error ? err.message : String(err));
      }
    });
  }

  // Initial start
  const { app: initialApp, contexts: initialContexts } = await buildApp();
  const initialWorkflows = await listSkills([path.join(domainDir, 'workflows')]);

  currentServer = listen(initialApp, async () => {
    try {
      const orchestrator = createAgentOrchestrator();
      const agents = await orchestrator.listAgents();
      console.log(`ready on :${port}`);
      console.log(`  contexts: ${initialContexts.length} found`);
      console.log(`  workflows: ${initialWorkflows.length} found`);
      console.log(`  agents: ${agents.map(a => a.id).join(', ')}`);
    } catch (err) {
      console.error('Failed to detect agents on startup:', err instanceof Error ? err.message : String(err));
    }
  });

  // ---- Hot-reload on domain/ changes (P1-1) ----

  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleDomainChange(filePath: string) {
    // Debounce: coalesce rapid successive writes into a single reload
    if (reloadTimer) clearTimeout(reloadTimer);

    reloadTimer = setTimeout(async () => {
      const rel = path.relative(cwd, filePath);
      console.log(`[od-kernel] ${rel} changed — reloading...`);
      try {
        const { app: newApp, contexts: newContexts } = await buildApp();
        const newWorkflows = await listSkills([path.join(domainDir, 'workflows')]);
        swapServer(newApp, newContexts, newWorkflows.length);
      } catch (err) {
        console.error(`[od-kernel] Reload failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 300); // 300ms debounce — enough to batch multi-file saves
  }

  // Only enable hot-reload if chokidar is installed.
  // We use a dynamic import so the CLI still works without chokidar
  // (e.g. when bundled or in minimal environments).
  try {
    const chokidar = await import('chokidar');
    const watcher = chokidar.watch(domainDir, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.od-skills/**',
        '**/dist/**',
      ],
      ignoreInitial: true,
      // Wait for writes to finish before firing (avoids reading half-written files)
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher.on('change', handleDomainChange);
    watcher.on('add', handleDomainChange);
    watcher.on('unlink', handleDomainChange);

    console.log(`[od-kernel] Watching ${path.relative(cwd, domainDir)} for changes...`);

    // Clean up watcher on process exit
    const cleanup = () => { watcher.close(); };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch {
    // chokidar not installed — hot-reload disabled.
    // The CLI still works; user must manually restart on file changes.
    console.log('[od-kernel] Hot-reload disabled (chokidar not found). Install with: pnpm add chokidar');
  }
}

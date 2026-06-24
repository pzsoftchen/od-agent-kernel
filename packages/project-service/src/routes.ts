/**
 * Express route registration for project CRUD.
 * Mounts standard REST endpoints for project management.
 */

import type { Express, Request, Response } from 'express';
import type { ProjectService } from './crud.js';

export function registerProjectRoutes(app: Express, service: ProjectService): void {
  // GET /api/projects — list all projects
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json({ projects: service.list() });
  });

  // POST /api/projects — create a new project
  app.post('/api/projects', (req: Request, res: Response) => {
    if (typeof req.body !== 'object' || req.body === null) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' },
      });
      return;
    }
    const { name, baseDir } = req.body as { name?: unknown; baseDir?: unknown };
    if (typeof name !== 'string' || !name.trim() || typeof baseDir !== 'string' || !baseDir.trim()) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'name and baseDir are required (non-empty strings)' },
      });
      return;
    }
    const project = service.create(name, baseDir);
    res.status(201).json(project);
  });

  // GET /api/projects/:id — get a single project
  app.get('/api/projects/:id', (req: Request, res: Response) => {
    const project = service.get(String(req.params.id));
    if (!project) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
      return;
    }
    res.json(project);
  });

  // PATCH /api/projects/:id — update a project
  app.patch('/api/projects/:id', (req: Request, res: Response) => {
    if (typeof req.body !== 'object' || req.body === null) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' },
      });
      return;
    }
    const { name } = req.body as { name?: unknown };
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'name must be a non-empty string' },
      });
      return;
    }
    const updated = service.update(String(req.params.id), { name: name as string });
    if (!updated) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
      return;
    }
    res.json(updated);
  });

  // DELETE /api/projects/:id — delete a project
  app.delete('/api/projects/:id', (req: Request, res: Response) => {
    const deleted = service.delete(String(req.params.id));
    if (!deleted) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
      return;
    }
    res.json({ ok: true });
  });

  // GET /api/projects/:id/files — list project files
  app.get('/api/projects/:id/files', (req: Request, res: Response) => {
    const project = service.get(String(req.params.id));
    if (!project) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
      return;
    }
    const files = typeof service.listFiles === 'function'
      ? service.listFiles(String(req.params.id))
      : [];
    res.json({ projectId: project.id, files });
  });
}

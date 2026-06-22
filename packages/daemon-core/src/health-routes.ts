/**
 * Standard health/version/ready routes.
 * Extracted from apps/daemon/src/server.ts.
 */

import type { Express } from 'express';

export interface HealthOptions {
  version?: string;
}

export function registerHealthRoutes(app: Express, options: HealthOptions = {}): void {
  const version = options.version ?? '0.0.0';

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version });
  });

  app.get('/api/version', (_req, res) => {
    res.json({ version });
  });

  app.get('/api/ready', (_req, res) => {
    res.json({ ok: true, ready: true, version });
  });
}

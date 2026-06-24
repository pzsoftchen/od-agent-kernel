/**
 * Express application factory.
 * Extracted from apps/daemon/src/server.ts:4417-4510.
 */

import express, { type Express } from 'express';

export interface CreateAppOptions {
  /** Maximum JSON body size (default '4mb'). */
  jsonLimit?: string;
  /** Optional Bearer token for API authentication. */
  authToken?: string;
  /** Enable CORS headers for /api/* routes (default true). */
  cors?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const jsonLimit = options.jsonLimit ?? '4mb';
  const authToken = options.authToken;
  const cors = options.cors ?? true;

  // JSON body parser
  app.use(express.json({ limit: jsonLimit }));

  // Optional Bearer token authentication
  if (authToken) {
    app.use((req, res, next) => {
      // Allow health endpoints without auth
      const openPaths = ['/health', '/api/health', '/ready', '/api/ready', '/version', '/api/version'];
      if (openPaths.includes(req.path)) return next();

      // CORS preflight requests don't include Authorization —
      // let them pass through so the CORS middleware adds the required headers.
      if (req.method === 'OPTIONS') return next();

      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${authToken}`) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API token' } });
        return;
      }
      next();
    });
  }

  // CORS for /api/* (configurable)
  if (cors) {
    app.use('/api/*', (_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  // CSP header
  app.use((_req, res, next) => {
    res.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'");
    next();
  });

  return app;
}

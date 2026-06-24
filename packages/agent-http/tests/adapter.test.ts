import { describe, it, expect } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import {
  defineJsonRoute,
  mountJsonRoute,
  type AdapterContext,
} from '../src/adapter.js';
import { ok, err } from '../src/types.js';
import { createApiError } from '@od-kernel/types';

function createTestApp(): { app: Express; adapter: AdapterContext } {
  const app = express();
  app.use(express.json());
  const adapter: AdapterContext = {
    resolvedPortRef: { current: 0 }, // port 0 disables origin checks
  };
  return { app, adapter };
}

describe('mountJsonRoute', () => {
  it('mounts a simple GET route and returns success', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'get',
      path: '/api/hello',
      parse: (raw) => ok({ name: String(raw.query.name || 'world') }),
      handle: async (input) => ok({ greeting: `Hello, ${input.name}` }),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app).get('/api/hello?name=Test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ greeting: 'Hello, Test' });
  });

  it('mounts a POST route with JSON body', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'post',
      path: '/api/echo',
      parse: (raw) => {
        const body = raw.body as { message?: string };
        if (!body.message) return err(createApiError('BAD_REQUEST', 'Missing message'));
        return ok(body);
      },
      handle: async (input) => ok({ echoed: input.message }),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app)
      .post('/api/echo')
      .send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ echoed: 'hello' });
  });

  it('returns 400 when parse fails', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'post',
      path: '/api/strict',
      parse: () => err(createApiError('BAD_REQUEST', 'Invalid input')),
      handle: async () => ok(null),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app).post('/api/strict').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns 500 when handle throws', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'get',
      path: '/api/boom',
      parse: () => ok(null),
      handle: async () => {
        throw new Error('Unexpected failure');
      },
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Internal server error');
  });

  it('returns custom success status from route spec', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'post',
      path: '/api/create',
      successStatus: 201,
      parse: () => ok({}),
      handle: async () => ok({ id: 'new-1' }),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app).post('/api/create').send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'new-1' });
  });

  it('passes dependencies to handle', async () => {
    const { app, adapter } = createTestApp();

    interface MyDeps {
      prefix: string;
    }
    const deps: MyDeps = { prefix: 'Mr.' };

    const route = defineJsonRoute({
      method: 'get',
      path: '/api/greet-deps',
      parse: (raw) => ok({ name: String(raw.query.name || 'Anonymous') }),
      handle: async (input, deps: MyDeps) =>
        ok({ greeting: `${deps.prefix} ${input.name}` }),
    });
    mountJsonRoute(app, route, deps, adapter);

    const res = await request(app).get('/api/greet-deps?name=Smith');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ greeting: 'Mr. Smith' });
  });

  it('rejects cross-origin when requireSameOrigin is set', async () => {
    const { app, adapter } = createTestApp();
    adapter.resolvedPortRef.current = 3000;

    const route = defineJsonRoute({
      method: 'post',
      path: '/api/protected',
      requireSameOrigin: true,
      parse: () => ok({}),
      handle: async () => ok({ secret: 'data' }),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app)
      .post('/api/protected')
      .set('Origin', 'https://evil.com')
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns error from handle Result failure', async () => {
    const { app, adapter } = createTestApp();

    const route = defineJsonRoute({
      method: 'get',
      path: '/api/maybe',
      parse: () => ok({}),
      handle: async () =>
        err(createApiError('NOT_FOUND', 'Resource not available')),
    });
    mountJsonRoute(app, route, undefined, adapter);

    const res = await request(app).get('/api/maybe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('defineJsonRoute', () => {
  it('returns the spec unchanged (identity function)', () => {
    const spec = {
      method: 'get' as const,
      path: '/test',
      parse: () => ok({}),
      handle: async () => ok({}),
    };
    const result = defineJsonRoute(spec);
    expect(result).toBe(spec);
  });
});

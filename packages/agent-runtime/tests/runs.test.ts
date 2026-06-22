import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRunService, type CreateSseResponseFn } from '../src/runs.js';

function createMockSse(): CreateSseResponseFn {
  return (_res: unknown) => ({
    send: vi.fn(),
    end: vi.fn(),
    cleanup: vi.fn(),
  });
}

describe('createRunService', () => {
  let service: ReturnType<typeof createRunService>;

  beforeEach(() => {
    service = createRunService({
      createSseResponse: createMockSse(),
      ttlMs: 60_000,
    });
  });

  afterEach(() => {
    service.shutdownActive();
  });

  it('creates a run with queued status', () => {
    const run = service.create('claude', '/tmp/test');
    expect(run.id).toBeDefined();
    expect(run.agentId).toBe('claude');
    expect(run.status).toBe('queued');
    expect(run.cwd).toBe('/tmp/test');
    expect(run.listenerCount).toBe(0);
  });

  it('starts a run and transitions to running', () => {
    const run = service.create('claude', '/tmp');
    const started = service.start(run.id);
    expect(started?.status).toBe('running');
    expect(started?.startedAt).toBeDefined();
  });

  it('returns null when starting non-existent run', () => {
    expect(service.start('nonexistent')).toBeNull();
  });

  it('finishes a run with succeeded status', () => {
    const run = service.create('claude', '/tmp');
    service.start(run.id);
    service.finish(run.id, 'succeeded');

    const finished = service.get(run.id);
    expect(finished?.status).toBe('succeeded');
    expect(finished?.finishedAt).toBeDefined();
  });

  it('finishes a run with failed status and error', () => {
    const run = service.create('claude', '/tmp');
    service.start(run.id);
    service.finish(run.id, 'failed', 'Agent crashed');

    const finished = service.get(run.id);
    expect(finished?.status).toBe('failed');
    expect(finished?.error).toBe('Agent crashed');
  });

  it('cancels a running run', () => {
    const run = service.create('claude', '/tmp');
    service.start(run.id);
    const cancelled = service.cancel(run.id);

    expect(cancelled).toBe(true);
    expect(service.get(run.id)?.status).toBe('cancelled');
  });

  it('refuses to cancel an already finished run', () => {
    const run = service.create('claude', '/tmp');
    service.start(run.id);
    service.finish(run.id, 'succeeded');
    expect(service.cancel(run.id)).toBe(false);
  });

  it('lists all runs', () => {
    const r1 = service.create('claude', '/tmp/a');
    const r2 = service.create('copilot', '/tmp/b');
    const list = service.list();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.agentId).sort()).toEqual(['claude', 'copilot']);
  });

  it('shuts down all active runs', () => {
    const r1 = service.create('claude', '/tmp');
    const r2 = service.create('copilot', '/tmp');
    service.start(r1.id);
    service.start(r2.id);
    service.shutdownActive();

    expect(service.get(r1.id)?.status).toBe('cancelled');
    expect(service.get(r2.id)?.status).toBe('cancelled');
  });

  it('creates unique IDs for each run', () => {
    const r1 = service.create('a', '/tmp');
    const r2 = service.create('a', '/tmp');
    expect(r1.id).not.toBe(r2.id);
  });

  it('signalChild returns false for non-existent child', () => {
    expect(service.signalChild('nonexistent', 'SIGTERM')).toBe(false);
  });
});

/**
 * Run lifecycle management — parameterized version of apps/daemon/src/runtimes/runs.ts.
 *
 * Design-specific dependencies (media/policy, run-tool-bundle, workspace-contract)
 * are injected through RuntimeModuleDeps rather than imported directly.
 */

import { randomUUID } from 'node:crypto';
import type { RuntimeModuleDeps } from './deps.js';
import { resolveDeps } from './deps.js';

// ---- Types ----

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RunRecord {
  id: string;
  agentId: string;
  status: RunStatus;
  cwd: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Number of SSE event listeners currently connected. */
  listenerCount: number;
}

export interface SseSendFn {
  (event: string, data: unknown, id?: string): void;
}

export interface SseEndFn {
  (): void;
}

export interface SseCleanupFn {
  (): void;
}

export interface CreateSseResponseFn {
  (res: unknown): {
    send: SseSendFn;
    end: SseEndFn;
    cleanup: SseCleanupFn;
  };
}

// ---- Run Service ----

export interface RunService {
  create(agentId: string, cwd: string): RunRecord;
  start(id: string): RunRecord | null;
  get(id: string): RunRecord | undefined;
  list(): RunRecord[];
  stream(id: string, createSse: CreateSseResponseFn, res: unknown): void;
  cancel(id: string): boolean;
  finish(id: string, status: 'succeeded' | 'failed' | 'cancelled', error?: string): void;
  /** Signal a child process (SIGTERM) for a run. */
  signalChild(id: string, signal: NodeJS.Signals): boolean;
  shutdownActive(): void;
}

interface RunServiceState {
  runs: Map<string, RunRecord>;
  listeners: Map<string, Set<{ send: SseSendFn; end: SseEndFn; cleanup: SseCleanupFn }>>;
  children: Map<string, { pid: number }>;
  ttlMs: number;
  timer: ReturnType<typeof setInterval> | null;
}

export interface CreateRunServiceOptions {
  createSseResponse: CreateSseResponseFn;
  ttlMs?: number;
  deps?: RuntimeModuleDeps;
}

export function createRunService(options: CreateRunServiceOptions): RunService {
  const deps = resolveDeps(options.deps);
  const ttlMs = options.ttlMs ?? 30 * 60 * 1000; // 30 min default
  const state: RunServiceState = {
    runs: new Map(),
    listeners: new Map(),
    children: new Map(),
    ttlMs,
    timer: null,
  };

  // Start TTL cleanup
  state.timer = setInterval(() => {
    const now = Date.now();
    for (const [id, run] of state.runs) {
      if (
        run.finishedAt &&
        now - run.finishedAt > ttlMs
      ) {
        state.runs.delete(id);
        state.listeners.delete(id);
        state.children.delete(id);
      }
    }
  }, 60_000);
  if (state.timer && 'unref' in state.timer) {
    state.timer.unref();
  }

  const service: RunService = {
    create(agentId, cwd) {
      const id = randomUUID();
      const run: RunRecord = {
        id,
        agentId,
        status: 'queued',
        cwd,
        createdAt: Date.now(),
        listenerCount: 0,
      };
      state.runs.set(id, run);
      return run;
    },

    start(id) {
      const run = state.runs.get(id);
      if (!run) return null;
      run.status = 'running';
      run.startedAt = Date.now();
      return run;
    },

    get(id) {
      return state.runs.get(id);
    },

    list() {
      return Array.from(state.runs.values());
    },

    stream(id, createSse, res) {
      const run = state.runs.get(id);
      if (!run) return;

      const sse = createSse(res);
      let listeners = state.listeners.get(id);
      if (!listeners) {
        listeners = new Set();
        state.listeners.set(id, listeners);
      }
      listeners.add(sse);
      run.listenerCount = listeners.size;

      // Auto-cleanup on response close
      const cleanup = () => {
        listeners?.delete(sse);
        run.listenerCount = listeners?.size ?? 0;
        sse.cleanup();
      };
      if (res && typeof (res as Record<string, unknown>).on === 'function') {
        (res as { on: (e: string, fn: () => void) => void }).on('close', cleanup);
      }
    },

    cancel(id) {
      const run = state.runs.get(id);
      if (!run || run.status === 'succeeded' || run.status === 'cancelled') {
        return false;
      }
      service.finish(id, 'cancelled', 'Run cancelled by user');
      return true;
    },

    finish(id, status, error) {
      const run = state.runs.get(id);
      if (!run) return;
      run.status = status;
      run.finishedAt = Date.now();
      if (error) run.error = error;

      // Notify listeners
      const listeners = state.listeners.get(id);
      if (listeners) {
        for (const sse of listeners) {
          if (error) {
            sse.send('error', { message: error });
          }
          sse.send('end', {
            code: status === 'succeeded' ? 0 : 1,
            status,
          });
          sse.end();
        }
        state.listeners.delete(id);
      }

      // Cleanup child ref
      state.children.delete(id);

      // Apply media policy normalization on finish (design-specific, injected)
      // The normalizeMediaExecutionPolicyForRun call is removed —
      // downstream consumers apply their own policy via deps.mediaPolicy
    },

    signalChild(id, signal) {
      const child = state.children.get(id);
      if (!child) return false;
      try {
        process.kill(child.pid, signal);
        return true;
      } catch {
        return false;
      }
    },

    shutdownActive() {
      for (const [id, run] of state.runs) {
        if (run.status === 'running') {
          service.cancel(id);
        }
      }
      if (state.timer) clearInterval(state.timer);
    },
  };

  return service;
}

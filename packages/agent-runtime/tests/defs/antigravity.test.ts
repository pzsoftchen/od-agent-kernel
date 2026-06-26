import { describe, it, expect, beforeEach } from 'vitest';
import {
  acquireAntigravityModelLock,
  _resetAntigravityModelLockForTests,
} from '../../src/defs/antigravity.js';

describe('acquireAntigravityModelLock — safety auto-release', () => {
  beforeEach(() => {
    _resetAntigravityModelLockForTests();
  });

  // Regression: a release that never fires (daemon crash between acquire and
  // wiring the child-exit release, or a caller bug that skips release) used
  // to leave the chain's Promise unresolved forever — so every subsequent
  // antigravity spawn awaited `previous` eternally, permanently poisoning
  // that agent. The fix adds a worst-case deadline that auto-releases.
  it('auto-releases after the deadline if release() is never called', async () => {
    // Acquire and "forget" to release — simulate a stuck holder.
    await acquireAntigravityModelLock(50);
    // Do NOT call the returned release fn.

    // A second acquire must complete within the deadline, not hang forever.
    const acquired = await Promise.race([
      acquireAntigravityModelLock(50).then((release) => {
        release();
        return 'acquired';
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 2_000)),
    ]);
    expect(acquired).toBe('acquired');
  });

  it('immediately resolves the next acquire when the holder releases promptly', async () => {
    const release1 = await acquireAntigravityModelLock(5_000);
    release1();
    // Second acquire should not wait on the deadline.
    const acquired = await Promise.race([
      acquireAntigravityModelLock(5_000).then((release) => {
        release();
        return 'acquired';
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 500)),
    ]);
    expect(acquired).toBe('acquired');
  });

  it('serializes concurrent acquires (second waits for first release)', async () => {
    const order: string[] = [];
    const release1 = await acquireAntigravityModelLock(5_000);
    const second = acquireAntigravityModelLock(5_000).then((release) => {
      order.push('second-acquired');
      release();
    });
    // Give the second acquire a moment to prove it's blocked, not running.
    await new Promise((r) => setTimeout(r, 30));
    expect(order).toEqual([]);
    release1();
    await second;
    expect(order).toEqual(['second-acquired']);
  });
});

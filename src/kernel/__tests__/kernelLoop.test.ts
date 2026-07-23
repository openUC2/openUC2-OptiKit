/**
 * EMB-D loop invariants (spec 18.4 normative points + exit criteria):
 * - a burst of drags coalesces through the 300 ms debounce (≤ 5 requests for
 *   10 edits; here: exactly 1),
 * - a stale response is never rendered (request ids are monotonic and only
 *   the newest issued renders),
 * - a 422 is reported, never retried; network failures retry with backoff.
 */

import { describe, expect, it, vi } from 'vitest';
import { CoreServiceError, type Scene3Response } from '../../api/coreClient';
import { KernelLoop, type KernelPassResult } from '../kernelLoop';

const BUILD = { yaml: 'design', mapped: ['laser-1'], unmapped: [] };

function response(tag: number): Scene3Response {
  return { scene: { tag }, manifest: null, warnings: [], findings: [] };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks/timers run so in-flight passes reach their fetch. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

function harness(overrides: Partial<ConstructorParameters<typeof KernelLoop>[0]> = {}) {
  const results: KernelPassResult[] = [];
  const errors: unknown[] = [];
  const loop = new KernelLoop({
    build: () => BUILD,
    scene3: () => Promise.resolve(response(0)),
    loadScene: () => Promise.resolve('{}'),
    traceWorld: () => Promise.resolve(new Float32Array(11)),
    onResult: r => results.push(r),
    onError: e => errors.push(e),
    now: () => 0,
    ...overrides,
  });
  return { loop, results, errors };
}

describe('KernelLoop', () => {
  it('coalesces a 10-edit burst into one request (debounce)', async () => {
    vi.useFakeTimers();
    try {
      const { loop, results } = harness();
      for (let i = 0; i < 10; i++) {
        loop.trigger();
        await vi.advanceTimersByTimeAsync(50); // drag events 50 ms apart
      }
      await vi.advanceTimersByTimeAsync(400); // let the trailing debounce fire
      expect(loop.requestsIssued).toBe(1);
      expect(results).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never renders a stale response (newest issued wins)', async () => {
    const calls: Array<ReturnType<typeof deferred<Scene3Response>>> = [];
    const { loop, results, errors } = harness({
      scene3: () => {
        const d = deferred<Scene3Response>();
        calls.push(d);
        return d.promise;
      },
    });

    const first = loop.flush(); // request 1 in flight
    await tick(); // ... and past its build stage, so its fetch is issued
    const second = loop.flush(); // request 2 supersedes it
    await tick();
    expect(calls).toHaveLength(2);

    calls[1].resolve(response(2)); // newest completes first
    await second;
    calls[0].resolve(response(1)); // stale response arrives late
    await first;

    expect(results).toHaveLength(1);
    expect(results[0].requestId).toBe(2);
    expect(errors).toHaveLength(0);
  });

  it('drops a slow response even when it lands after the newer render', async () => {
    // Same as above but the stale request also survives loadScene: the worker
    // section re-checks the id, so the old scene neither loads nor renders.
    const loads: string[] = [];
    const calls: Array<ReturnType<typeof deferred<Scene3Response>>> = [];
    const { loop, results } = harness({
      scene3: () => {
        const d = deferred<Scene3Response>();
        calls.push(d);
        return d.promise;
      },
      loadScene: (json: string) => {
        loads.push(json);
        return Promise.resolve('{}');
      },
    });

    const first = loop.flush();
    await tick();
    const second = loop.flush();
    await tick();
    calls[1].resolve(response(2));
    await second;
    calls[0].resolve(response(1));
    await first;

    expect(loads).toHaveLength(1); // the stale scene never touched the worker
    expect(JSON.parse(loads[0])).toEqual({ tag: 2 });
    expect(results.map(r => r.requestId)).toEqual([2]);
  });

  it('reports a 422 without retrying (same input, same answer)', async () => {
    const { loop, results, errors } = harness({
      scene3: () => Promise.reject(new CoreServiceError('E_NO_TARGET: no chain', 422, 'E_NO_TARGET')),
    });
    await loop.flush();
    expect(loop.requestsIssued).toBe(1);
    expect(errors).toHaveLength(1);
    expect(results).toHaveLength(0);
  });

  it('retries network failures with backoff', async () => {
    let attempt = 0;
    const { loop, results, errors } = harness({
      scene3: () => {
        attempt++;
        return attempt === 1
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve(response(7));
      },
      sleep: () => Promise.resolve(),
    });
    await loop.flush();
    expect(loop.requestsIssued).toBe(2);
    expect(errors).toHaveLength(0);
    expect(results).toHaveLength(1);
  });

  it('clears the trace when nothing is placed', async () => {
    const { loop, results } = harness({ build: () => null });
    await loop.flush();
    expect(loop.requestsIssued).toBe(0);
    expect(results).toHaveLength(1);
    expect(results[0].segments).toHaveLength(0);
  });
});

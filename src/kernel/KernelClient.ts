/**
 * Main-thread client for the oc-wasm kernel worker: a promise per request,
 * matched by id. One client owns one worker owning one loaded scene.
 */

import type { DetectorReadoutWire } from './detector';
import type { KernelRequest, KernelResponse } from './messages';

export interface WorldTrace {
  /** World-frame segments, 11 floats each (spec 18.7). */
  segments: Float32Array;
  /** First-detector readout; only f64 traces carry one (rule 5). */
  detector: DetectorReadoutWire | null;
}

type Settle = { resolve: (value: KernelResponse) => void; reject: (reason: Error) => void };

// Omit that distributes over the request union (plain Omit collapses it to the
// common properties, losing the per-variant payload fields).
type RequestBody<T> = T extends { id: number } ? Omit<T, 'id'> : never;

export class KernelClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Settle>();
  /** Resolves once the worker's wasm module is initialized. */
  readonly ready: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
    let readyResolve!: () => void;
    let readyReject!: (reason: Error) => void;
    this.ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    this.worker.onmessage = (event: MessageEvent<KernelResponse>) => {
      const res = event.data;
      if (res.id === 0) {
        if (res.type === 'ready') readyResolve();
        else if (res.type === 'error') readyReject(new Error(res.message));
        return;
      }
      const settle = this.pending.get(res.id);
      if (!settle) return;
      this.pending.delete(res.id);
      if (res.type === 'error') settle.reject(new Error(res.message));
      else settle.resolve(res);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'kernel worker error');
      readyReject(error);
      for (const settle of this.pending.values()) settle.reject(error);
      this.pending.clear();
    };
  }

  private request(req: RequestBody<KernelRequest>): Promise<KernelResponse> {
    const id = this.nextId++;
    return new Promise<KernelResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  /** Load a Scene3 (`.ocanvas` v2) JSON document; resolves to the load report JSON. */
  async loadScene(sceneJson: string): Promise<string> {
    const res = await this.request({ type: 'loadScene', sceneJson });
    return res.type === 'sceneLoaded' ? res.report : '';
  }

  /** Settled f64 world-frame trace: segments plus the detector readout. */
  async traceWorld(): Promise<WorldTrace> {
    const res = await this.request({ type: 'traceWorld' });
    if (res.type !== 'segments') return { segments: new Float32Array(0), detector: null };
    return { segments: res.buffer, detector: res.detector ?? null };
  }

  /** f32 preview trace, same layout. The picture, not the numbers. */
  async traceWorldFast(): Promise<Float32Array> {
    const res = await this.request({ type: 'traceWorldFast' });
    return res.type === 'segments' ? res.buffer : new Float32Array(0);
  }

  dispose(): void {
    this.worker.terminate();
    const error = new Error('kernel client disposed');
    for (const settle of this.pending.values()) settle.reject(error);
    this.pending.clear();
  }
}

let singleton: KernelClient | null = null;

export function getKernelClient(): KernelClient {
  if (!singleton) singleton = new KernelClient();
  return singleton;
}

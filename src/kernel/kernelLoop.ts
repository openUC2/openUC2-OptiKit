/**
 * The tier-1 live loop (integration spec 18.4, EMB-D), dependency-injected so
 * its invariants are unit-testable without a network, a worker, or React:
 *
 *   trigger -> debounce 300 ms -> build design YAML -> POST /v1/scene3
 *           -> loadScene3JSON + traceWorld3D in the kernel worker -> onResult
 *
 * Invariants:
 * - Monotonic request ids; a response renders only if its id is the newest
 *   issued (stale responses are dropped, never rendered).
 * - The worker section (loadScene + trace) is serialized: one Canvas holds one
 *   scene, so an older scene must never load after a newer one.
 * - Network failures retry with backoff; a 422 never retries (same input,
 *   same answer) — it reports as a diagnostic.
 */

import type { Scene3Response } from '../api/coreClient';
import { CoreServiceError } from '../api/coreClient';
import type { UnmappedPlacement } from '../document/designBuilder';
import type { DetectorReadoutWire } from './detector';

export interface KernelBuildOutput {
  yaml: string;
  mapped: string[];
  unmapped: UnmappedPlacement[];
}

export interface WorldTraceResult {
  segments: Float32Array;
  detector: DetectorReadoutWire | null;
}

export interface KernelPassResult {
  requestId: number;
  /** World-frame segment buffer, 11 floats per segment (spec 18.7). */
  segments: Float32Array;
  /** First-detector readout of the settled f64 trace (EMB-E), or null. */
  detector: DetectorReadoutWire | null;
  findings: Scene3Response['findings'];
  warnings: string[];
  mapped: string[];
  unmapped: UnmappedPlacement[];
  manifest: unknown;
  /** Wall time of designBuilder + /v1/scene3 (network included), ms. */
  materializeMs: number;
  /** Wall time of loadScene3JSON + traceWorld3D in the worker, ms. */
  traceMs: number;
}

export interface KernelLoopDeps {
  /** Current placements as design YAML; null when nothing is placed. */
  build: () => KernelBuildOutput | null | Promise<KernelBuildOutput | null>;
  scene3: (designYaml: string) => Promise<Scene3Response>;
  loadScene: (sceneJson: string) => Promise<string>;
  traceWorld: () => Promise<WorldTraceResult>;
  onResult: (result: KernelPassResult) => void;
  onError: (error: unknown, requestId: number) => void;
  onBusy?: (busy: boolean) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_RETRY_DELAYS_MS = [500, 1500];

export class KernelLoop {
  private readonly deps: KernelLoopDeps;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private issued = 0;
  private rendered = 0;
  private workerChain: Promise<void> = Promise.resolve();
  private disposed = false;
  /** Service requests actually sent — the burst test asserts on this. */
  requestsIssued = 0;

  constructor(deps: KernelLoopDeps) {
    this.deps = deps;
  }

  /** Latest issued request id (diagnostics/tests). */
  get latestRequestId(): number {
    return this.issued;
  }

  /** Debounced entry point: every edit calls this. */
  trigger(): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pass();
    }, this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  /** Immediate pass, skipping the debounce (tests, explicit "run now"). */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.pass();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async pass(): Promise<void> {
    const id = ++this.issued;
    this.deps.onBusy?.(true);
    try {
      const build = await this.deps.build();
      if (id !== this.issued || this.disposed) return;

      if (!build || build.mapped.length === 0) {
        // Nothing to materialize: clear the trace, keep the unmapped list.
        this.render(id, {
          requestId: id,
          segments: new Float32Array(0),
          detector: null,
          findings: [],
          warnings: [],
          mapped: [],
          unmapped: build?.unmapped ?? [],
          manifest: null,
          materializeMs: 0,
          traceMs: 0,
        });
        return;
      }

      const now = this.deps.now ?? (() => performance.now());
      const t0 = now();
      const response = await this.scene3WithRetry(build.yaml, id);
      const materializeMs = now() - t0;
      if (response === null || id !== this.issued || this.disposed) return;

      // Serialize the worker section: the single kernel Canvas must never see
      // an older scene after a newer one.
      const section = this.workerChain.then(async () => {
        if (id !== this.issued || this.disposed) return;
        const t1 = now();
        await this.deps.loadScene(JSON.stringify(response.scene));
        const { segments, detector } = await this.deps.traceWorld();
        const traceMs = now() - t1;
        if (id !== this.issued || this.disposed) return;
        this.render(id, {
          requestId: id,
          segments,
          detector,
          findings: response.findings,
          warnings: response.warnings,
          mapped: build.mapped,
          unmapped: build.unmapped,
          manifest: response.manifest,
          materializeMs,
          traceMs,
        });
      });
      this.workerChain = section.catch(() => undefined);
      await section;
    } catch (error) {
      if (id === this.issued && !this.disposed) this.deps.onError(error, id);
    } finally {
      if (id === this.issued && !this.disposed) this.deps.onBusy?.(false);
    }
  }

  /** Retry network failures with backoff; 4xx (incl. 422) never retries.
   * Returns null when the pass went stale while waiting. */
  private async scene3WithRetry(yaml: string, id: number): Promise<Scene3Response | null> {
    const delays = this.deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    for (let attempt = 0; ; attempt++) {
      try {
        this.requestsIssued++;
        return await this.deps.scene3(yaml);
      } catch (error) {
        const retriable =
          !(error instanceof CoreServiceError) || error.status >= 500;
        if (!retriable || attempt >= delays.length) throw error;
        await sleep(delays[attempt]);
        if (id !== this.issued || this.disposed) return null;
      }
    }
  }

  private render(id: number, result: KernelPassResult): void {
    if (id <= this.rendered) return;
    this.rendered = id;
    this.deps.onResult(result);
  }
}

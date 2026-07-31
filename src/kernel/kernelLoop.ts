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
import type { UnmappedPlacement, WorldPose } from '../document/designBuilder';
import { poseDelta, samePose } from '../document/designBuilder';
import type { DetectorReadoutWire } from './detector';
import type { TransformBatch } from './messages';

export interface KernelBuildOutput {
  yaml: string;
  mapped: string[];
  unmapped: UnmappedPlacement[];
  /** World pose per mapped component id at build time — the tier-2 baseline
   * the pose fast path measures drags against (EMB-F). */
  poses?: Map<string, WorldPose>;
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
  /** Detector3 objects the materialized scene declares. The kernel's readout
   * is null BOTH without a detector and without hits; this count lets the
   * panel say "0 hits" instead of silently vanishing. */
  detectorCount: number;
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
  /** Tier-2 (EMB-F): apply pose deltas to the loaded scene + f32 retrace.
   * Absent = no fast path; every edit takes tier 1. */
  transformTrace?: (batches: TransformBatch[]) => Promise<Float32Array>;
  onResult: (result: KernelPassResult) => void;
  /** Tier-2 f32 preview frames — the picture only; numbers stay settled. */
  onPreview?: (segments: Float32Array) => void;
  onError: (error: unknown, requestId: number) => void;
  onBusy?: (busy: boolean) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_RETRY_DELAYS_MS = [500, 1500];

/** What the tier-2 fast path needs about the scene the worker holds: the
 * manifest's object ids per component, and each component's pose as currently
 * applied to those objects. */
interface SettledScene {
  objects: Map<string, number[]>;
  applied: Map<string, WorldPose>;
}

export class KernelLoop {
  private readonly deps: KernelLoopDeps;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private issued = 0;
  private rendered = 0;
  private workerChain: Promise<void> = Promise.resolve();
  private disposed = false;
  private settled: SettledScene | null = null;
  /** Latest-wins coalescing for pose previews: a drag posts poses faster than
   * the worker traces; only the newest matters. */
  private pendingPoses: Map<string, WorldPose> | null = null;
  private previewScheduled = false;
  /** Service requests actually sent — the burst test asserts on this. */
  requestsIssued = 0;
  /** transformTrace round trips actually sent (tests/diagnostics). */
  previewsIssued = 0;

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

  /** Tier-2 entry point (EMB-F): the current world poses of every mapped
   * component after a pose-only edit. Applies the delta against the loaded
   * scene and f32-retraces immediately — the settled tier-1 pass still runs
   * via the caller's `trigger()`. Falls back to tier 1 (silently — trigger is
   * already scheduled) when there is no settled scene, no fast path, or the
   * scene refuses a batch. */
  posePreview(poses: Map<string, WorldPose>): void {
    if (this.disposed || !this.deps.transformTrace) return;
    this.pendingPoses = poses;
    if (this.previewScheduled) return;
    this.previewScheduled = true;
    const section = this.workerChain.then(async () => {
      this.previewScheduled = false;
      const current = this.pendingPoses;
      this.pendingPoses = null;
      const settled = this.settled;
      if (!current || !settled || this.disposed) return;

      const batches: TransformBatch[] = [];
      for (const [comp, pose] of current) {
        const applied = settled.applied.get(comp);
        if (!applied || samePose(applied, pose)) continue;
        const ids = settled.objects.get(comp);
        if (!ids || ids.length === 0) return; // moved component unknown to the scene: tier 1 handles it
        batches.push({ ids, delta: poseDelta(applied, pose) });
        settled.applied.set(comp, pose);
      }
      if (batches.length === 0) return;
      try {
        this.previewsIssued++;
        const segments = await this.deps.transformTrace!(batches);
        if (!this.disposed && this.settled === settled) this.deps.onPreview?.(segments);
      } catch {
        // Scene and UI disagree (stale manifest mid-reload): drop the preview;
        // the debounced tier-1 pass reconciles.
        this.settled = null;
      }
    });
    this.workerChain = section.catch(() => undefined);
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
        this.settled = null;
        this.render(id, {
          requestId: id,
          segments: new Float32Array(0),
          detector: null,
          detectorCount: 0,
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
        // The worker now holds THIS scene: rebase the tier-2 fast path on its
        // manifest object ids and the build-time poses.
        this.settled = settledFrom(response.manifest, build.poses);
        const declared = (response.scene as { detectors?: unknown[] } | null)?.detectors;
        this.render(id, {
          requestId: id,
          segments,
          detector,
          detectorCount: Array.isArray(declared) ? declared.length : 0,
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

/** Object ids per component from the materializer's manifest, paired with the
 * build-time poses; null (no fast path) when either half is missing. */
function settledFrom(
  manifest: unknown,
  poses: Map<string, WorldPose> | undefined,
): SettledScene | null {
  if (!poses) return null;
  const components = (manifest as { components?: Record<string, unknown> } | null)?.components;
  if (!components || typeof components !== 'object') return null;
  const objects = new Map<string, number[]>();
  for (const [comp, entry] of Object.entries(components)) {
    const e = entry as Partial<Record<'bodies' | 'surfaces' | 'apertures' | 'sources' | 'detectors', unknown>>;
    const ids: number[] = [];
    for (const key of ['bodies', 'surfaces', 'apertures', 'sources', 'detectors'] as const) {
      const list = e[key];
      if (Array.isArray(list)) ids.push(...list.filter((v): v is number => typeof v === 'number'));
    }
    objects.set(comp, ids);
  }
  return { objects, applied: new Map(poses) };
}

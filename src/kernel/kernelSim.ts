/**
 * Wires the tier-1 kernel loop (kernelLoop.ts) to the dsn-model editor: the
 * document facade is the design source (hard rule: never appStore), the
 * service's /v1/scene3 materializes it, the kernel worker traces it, and
 * results land in kernelStore (EMB-G1/G2, integration spec §19).
 *
 * Started once from main.tsx. The worker and the first service request happen
 * lazily on the first pass with parts placed, so an empty document loads no
 * wasm and asks the service nothing.
 */

import { materializeScene3 } from '../api/coreClient';
import type { DsnPart } from '../document';
import { getDocRevision, getSnapshot, listDsnParts, subscribe, useFibersStore } from '../document';
import { DESIGN_DECL_FILE, serializeDesign } from '../model/dsn/io';
import { buildServiceDesign } from '../model/dsn/serviceExport';
import { getKernelClient } from './KernelClient';
import { registerKernelTrigger } from './kernelBridge';
import { KernelLoop } from './kernelLoop';
import { useKernelStore } from './kernelStore';
import type { DofAxisBinding, WorldPose } from './pose';
import { poseWithDofTranslations } from './pose';

let running: { loop: KernelLoop; dispose: () => void } | null = null;

/** Fields whose change the tier-2 fast path can preview: rigid moves, and DOF
 * values (an insert drag composes as a translation along the record axis). */
const PREVIEW_KEYS: ReadonlySet<string> = new Set(
  ['cell', 'offsetMm', 'rot24', 'offsetDeg', 'dofValues'],
);

/**
 * A previewable edit keeps the part set (same ids, one-to-one) and changes
 * nothing but where parts sit — pose fields or DOF values. Compared on the
 * RAW stored parts by field reference: an edit that replaces any other field
 * (params, ref, …) forces tier 1 — the safe direction, since only rigid
 * motion may skip the re-materialization.
 */
function isPreviewableEdit(prev: readonly DsnPart[], next: readonly DsnPart[]): boolean {
  if (prev === next || prev.length !== next.length) return false;
  const before = new Map(prev.map(p => [p.id, p]));
  for (const part of next) {
    const b = before.get(part.id);
    if (!b) return false;
    if (b === part) continue;
    const keys = new Set([...Object.keys(b), ...Object.keys(part)]);
    for (const key of keys) {
      if (PREVIEW_KEYS.has(key)) continue;
      const prevValue = (b as unknown as Record<string, unknown>)[key];
      const nextValue = (part as unknown as Record<string, unknown>)[key];
      if (prevValue !== nextValue) return false;
    }
  }
  return true;
}

/** `comp.dof` entries of the exported design → axis bindings (the same
 * declarations the backend's `apply_dof_values` reads). */
function bindingsFrom(dof: unknown): DofAxisBinding[] {
  if (!Array.isArray(dof)) return [];
  const out: DofAxisBinding[] = [];
  for (const entry of dof) {
    const name = (entry as { name?: unknown }).name;
    const axis = (entry as { axis?: unknown }).axis;
    const kind = (entry as { kind?: unknown }).kind ?? 'translation';
    if (typeof name === 'string' && (axis === 'x' || axis === 'y' || axis === 'z')) {
      out.push({ name, axis, kind: typeof kind === 'string' ? kind : 'translation' });
    }
  }
  return out;
}

export function startKernelSimulation(): () => void {
  if (running) return running.dispose;

  /** partId → design component key of the LAST build. Previewable edits
   * cannot change keys (identity fields force tier 1), so drags between
   * settles reuse it without re-running the exporter. */
  let keyByPartIdAtBuild: Record<string, string> = {};
  /** partId → DOF axis bindings of the LAST build — the drag fast path
   * composes dof values along these axes (same declarations the backend
   * applies at settle). */
  let dofBindingsAtBuild = new Map<string, DofAxisBinding[]>();

  const loop = new KernelLoop({
    build: () => {
      const snap = getSnapshot();
      if (snap.parts.length === 0) return null;
      const { design, keyByPartId } = buildServiceDesign(snap);
      keyByPartIdAtBuild = keyByPartId;
      const bindings = new Map<string, DofAxisBinding[]>();
      const poses = new Map<string, WorldPose>();
      for (const part of snap.parts) {
        const key = keyByPartId[part.id];
        bindings.set(part.id, bindingsFrom(design.components?.[key]?.dof));
        // The tier-2 baseline must match what the scene applied server-side:
        // document pose ∘ dof translations, both sides from the same design.
        poses.set(key, poseWithDofTranslations(part.worldPose, part.dofs, bindings.get(part.id)));
      }
      dofBindingsAtBuild = bindings;
      return {
        yaml: serializeDesign(design),
        mapped: snap.parts.map(p => keyByPartId[p.id]),
        unmapped: [],
        poses,
      };
    },
    // The sampling config drives the materializer's rendering policy (§9.5):
    // rays across the emitting aperture, directions per origin, and the
    // sampling sequence. setConfig() already re-triggers a pass on change.
    scene3: yaml => {
      const { maxRays, angularSamples, sequence } = useKernelStore.getState().config;
      return materializeScene3(
        { [DESIGN_DECL_FILE]: yaml },
        { traceQuality: {
            spatial_samples: maxRays,
            angular_samples: angularSamples,
            sequence,
          } },
      );
    },
    loadScene: json => getKernelClient().loadScene(json),
    traceWorld: readout => getKernelClient().traceWorld(readout),
    // The detector readout costs ~2/3 of a settled trace (donor src/bench);
    // pay it only while the readout panel is showing.
    readout: () => useKernelStore.getState().panelOpen,
    transformTrace: batches => getKernelClient().transformTrace(batches),
    onResult: result => useKernelStore.getState().setKernelResult(result),
    onPreview: segments => useKernelStore.getState().setKernelPreview(segments),
    onError: (error, requestId) => useKernelStore.getState().setKernelError(error, requestId),
    onBusy: busy => useKernelStore.getState().setKernelBusy(busy),
  });

  registerKernelTrigger(() => loop.trigger());

  /** World pose per design key — pose fields + dof translations, cheap per
   * drag event (no exporter run; bindings come from the last build). */
  const currentPoses = (): Map<string, WorldPose> => {
    const poses = new Map<string, WorldPose>();
    for (const part of getSnapshot().parts) {
      const key = keyByPartIdAtBuild[part.id];
      if (key) {
        poses.set(
          key,
          poseWithDofTranslations(part.worldPose, part.dofs, dofBindingsAtBuild.get(part.id)),
        );
      }
    }
    return poses;
  };

  // Edits (place/move/rotate/delete, either view) re-enter the loop; the
  // 300 ms debounce inside KernelLoop coalesces a drag into one settled
  // request. Pose and DOF edits ALSO take the tier-2 fast path (EMB-F): the
  // loaded scene transforms and f32-retraces immediately, and the debounced
  // tier-1 pass reconciles with f64 + validation on settle. The revision
  // gate keeps selection/undo-stack churn from triggering traces.
  let lastRevision = getDocRevision();
  let lastParts: readonly DsnPart[] = listDsnParts();
  const unsubscribeDoc = subscribe(() => {
    const revision = getDocRevision();
    if (revision === lastRevision) return;
    lastRevision = revision;
    const parts = listDsnParts();
    const prevParts = lastParts;
    lastParts = parts;
    const { config } = useKernelStore.getState();
    if (!config.enabled || !config.autoRun) return;
    if (isPreviewableEdit(prevParts, parts)) loop.posePreview(currentPoses());
    loop.trigger();
  });
  // Patch cords are design state too (chain inference reads them) but bump no
  // revision — watch the fibers store directly; always tier 1.
  const unsubscribeFibers = useFibersStore.subscribe((state, prevState) => {
    if (state.fibers === prevState.fibers) return;
    const { config } = useKernelStore.getState();
    if (!config.enabled || !config.autoRun) return;
    loop.trigger();
  });

  // Opening the readout panel when the settled trace skipped its readout
  // (panel was closed): one fresh pass fetches the numbers.
  const unsubscribePanel = useKernelStore.subscribe((state, prevState) => {
    if (
      state.panelOpen &&
      !prevState.panelOpen &&
      state.kernel.requestId > 0 &&
      state.kernel.detector === null &&
      state.kernel.detectorCount > 0
    ) {
      void loop.flush();
    }
  });

  const dispose = () => {
    unsubscribeDoc();
    unsubscribeFibers();
    unsubscribePanel();
    registerKernelTrigger(null);
    loop.dispose();
    running = null;
  };
  running = { loop, dispose };
  return dispose;
}

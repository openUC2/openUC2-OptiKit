/**
 * Wires the tier-1 kernel loop (kernelLoop.ts) to the real app: placements
 * from the app store, records + /v1/scene3 through coreClient, the trace
 * through the kernel worker, results into the simulation store (EMB-D).
 *
 * Started once from main.tsx. The worker and the first service request happen
 * lazily on the first pass, so users who never enable simulation load no wasm.
 */

import { CoreClient } from '../api/coreClient';
import type { WorldPose } from '../document/designBuilder';
import { buildDesign, worldPose } from '../document/designBuilder';
import type { PlacedModule } from '../types';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { getKernelClient } from './KernelClient';
import { registerKernelTrigger } from './kernelBridge';
import { KernelLoop } from './kernelLoop';

export function coreServiceBaseUrl(): string {
  return (import.meta.env?.VITE_OPTIKIT_CORE_URL as string | undefined) ?? 'http://127.0.0.1:8000';
}

let running: { loop: KernelLoop; dispose: () => void } | null = null;

export function startKernelSimulation(): () => void {
  if (running) return running.dispose;

  const client = new CoreClient({ baseUrl: coreServiceBaseUrl() });

  const loop = new KernelLoop({
    build: async () => {
      const { placedModules, modules } = useAppStore.getState();
      if (placedModules.length === 0) return null;
      const optikitRefFor = (moduleId: string) => {
        const def = modules.find(m => m.id === moduleId);
        if (!def?.optikitId) return undefined;
        return { id: def.optikitId, mount: def.optikitMount };
      };
      const ids = placedModules
        .map(p => optikitRefFor(p.moduleId)?.id)
        .filter((id): id is string => Boolean(id));
      const records = ids.length ? await client.componentRecords(ids) : new Map();
      return buildDesign(placedModules, optikitRefFor, records);
    },
    // The "Max Rays per Source" slider drives the materializer's sampling
    // policy: its value becomes spatial_samples (rays across the emitting
    // aperture). setConfig() already re-triggers a pass on change.
    scene3: yaml =>
      client.scene3(yaml, {
        spatial_samples: useSimulationStore.getState().config.maxRays,
      }),
    loadScene: json => getKernelClient().loadScene(json),
    traceWorld: readout => getKernelClient().traceWorld(readout),
    // The detector readout costs ~2/3 of a settled trace (src/bench); pay it
    // only while the simulation right-tab (the panel's home) is showing.
    readout: () => useAppStore.getState().activeRightTab === 'simulation',
    transformTrace: batches => getKernelClient().transformTrace(batches),
    onResult: result => useSimulationStore.getState().setKernelResult(result),
    onPreview: segments => useSimulationStore.getState().setKernelPreview(segments),
    onError: (error, requestId) => useSimulationStore.getState().setKernelError(error, requestId),
    onBusy: busy => useSimulationStore.getState().setKernelBusy(busy),
  });

  registerKernelTrigger(() => loop.trigger());

  /** World pose per mapped component id — placement + mount only, no records
   * needed, so it is cheap enough to run per drag event. */
  const currentPoses = (placements: readonly PlacedModule[]): Map<string, WorldPose> => {
    const { modules } = useAppStore.getState();
    const poses = new Map<string, WorldPose>();
    for (const p of placements) {
      const def = modules.find(m => m.id === p.moduleId);
      if (!def?.optikitId) continue;
      poses.set(`${p.moduleId}-${p.id}`, worldPose(p, def.optikitMount));
    }
    return poses;
  };

  /** A pose-only edit keeps the same placement set (ids, modules, order-free)
   * and changes only position/rotation/layer — the tier-2 fast path's domain.
   * Anything structural (add/remove/module swap) is tier 1 alone. */
  const isPoseOnly = (
    prev: readonly PlacedModule[],
    next: readonly PlacedModule[],
  ): boolean => {
    if (prev.length !== next.length) return false;
    const before = new Map(prev.map(p => [p.id, p]));
    for (const p of next) {
      const b = before.get(p.id);
      if (!b || b.moduleId !== p.moduleId) return false;
    }
    return true;
  };

  // Edits (place/move/rotate/delete, either view) re-enter the loop; the
  // 300 ms debounce inside KernelLoop coalesces a drag into one settled
  // request. Pose-only edits ALSO take the tier-2 fast path (EMB-F): the
  // loaded scene transforms and f32-retraces immediately, and the debounced
  // tier-1 pass reconciles with f64 + validation on settle.
  const unsubscribe = useAppStore.subscribe((state, prevState) => {
    const sim = useSimulationStore.getState();
    if (sim.engine !== 'kernel' || !sim.config.enabled || !sim.config.autoRun) return;
    // Opening the simulation tab when the settled trace skipped its readout
    // (panel was closed): one fresh pass fetches the numbers.
    if (
      state.activeRightTab === 'simulation' &&
      prevState.activeRightTab !== 'simulation' &&
      sim.kernel.requestId > 0 &&
      sim.kernel.detector === null &&
      sim.kernel.detectorCount > 0
    ) {
      void loop.flush();
    }
    if (state.placedModules === prevState.placedModules) return;
    if (isPoseOnly(prevState.placedModules, state.placedModules)) {
      loop.posePreview(currentPoses(state.placedModules));
    }
    loop.trigger();
  });

  const dispose = () => {
    unsubscribe();
    registerKernelTrigger(null);
    loop.dispose();
    running = null;
  };
  running = { loop, dispose };
  return dispose;
}

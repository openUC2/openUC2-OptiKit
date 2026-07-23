/**
 * Wires the tier-1 kernel loop (kernelLoop.ts) to the real app: placements
 * from the app store, records + /v1/scene3 through coreClient, the trace
 * through the kernel worker, results into the simulation store (EMB-D).
 *
 * Started once from main.tsx. The worker and the first service request happen
 * lazily on the first pass, so users who never enable simulation load no wasm.
 */

import { CoreClient } from '../api/coreClient';
import { buildDesign } from '../document/designBuilder';
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
      const optikitIdFor = (moduleId: string) =>
        modules.find(m => m.id === moduleId)?.optikitId;
      const ids = placedModules
        .map(p => optikitIdFor(p.moduleId))
        .filter((id): id is string => Boolean(id));
      const records = ids.length ? await client.componentRecords(ids) : new Map();
      return buildDesign(placedModules, optikitIdFor, records);
    },
    scene3: yaml => client.scene3(yaml),
    loadScene: json => getKernelClient().loadScene(json),
    traceWorld: () => getKernelClient().traceWorld(),
    onResult: result => useSimulationStore.getState().setKernelResult(result),
    onError: (error, requestId) => useSimulationStore.getState().setKernelError(error, requestId),
    onBusy: busy => useSimulationStore.getState().setKernelBusy(busy),
  });

  registerKernelTrigger(() => loop.trigger());

  // Edits (place/move/rotate/delete, either view) re-enter the loop; the
  // 300 ms debounce inside KernelLoop coalesces a drag into one request.
  const unsubscribe = useAppStore.subscribe((state, prevState) => {
    const sim = useSimulationStore.getState();
    if (sim.engine !== 'kernel' || !sim.config.enabled || !sim.config.autoRun) return;
    if (state.placedModules !== prevState.placedModules) loop.trigger();
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

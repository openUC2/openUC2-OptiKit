/**
 * Simulation Store - Zustand store for ray tracing simulation state
 * 
 * Manages simulation configuration, results, and UI state.
 * Separating simulation state from the main app store for cleaner architecture.
 */

import { create } from 'zustand';
import type {
  SimulationConfig,
  SimulationState,
  SimulationWarning,
  SimulationError,
  OpticalElement,
  SimulationResult,
  RayPath
} from '../types';
import { getDefaultSimulationConfig, buildScene } from '../utils/sceneBuilder';
import { getSimulationManager } from '../simulation';
import { useAppStore } from './appStore';
import { triggerKernelPass } from '../kernel/kernelBridge';
import type { DetectorResult } from '../kernel/detector';
import { parseDetectorResult } from '../kernel/detector';
import type { KernelPassResult } from '../kernel/kernelLoop';
import type { Scene3Finding } from '../api/coreClient';
import { CoreServiceError } from '../api/coreClient';
import type { UnmappedPlacement } from '../document/designBuilder';

/**
 * Which physics engine renders rays (integration spec, EMB-D/ADR-9):
 * - 'kernel': the oc-wasm kernel worker (src/kernel/) — the only user-facing
 *   engine (decision E5); every visible ray comes from it.
 * - 'legacy': the old TS SimulationEngine, a developer-only debug/migration
 *   flag, default off. Opt in with localStorage['oc-debug-engine'] = 'legacy'.
 */
export type SimulationEngineKind = 'legacy' | 'kernel';

function initialEngine(): SimulationEngineKind {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('oc-debug-engine') === 'legacy') {
      return 'legacy';
    }
  } catch {
    // storage unavailable (privacy mode): kernel
  }
  return 'kernel';
}

/** First-detector readout of the latest settled trace (EMB-E). */
export interface KernelDetectorState {
  /** Parsed f64 result — the only source of displayed numbers (rule 5). */
  result: DetectorResult;
  /** Spot-diagram hit records, render-only f32 (`decodeHits` layout). */
  hits: Float32Array;
}

/** Kernel-loop state (EMB-D): the latest settled f64 trace and diagnostics. */
export interface KernelSimState {
  /** World-frame segment buffer, 11 floats/segment — render-only (rule 5). */
  segments: Float32Array | null;
  /** Detector readout of the settled trace; null when no detector/hits. */
  detector: KernelDetectorState | null;
  /** Request id of the rendered trace (monotonic; stale responses dropped). */
  requestId: number;
  findings: Scene3Finding[];
  warnings: string[];
  mapped: string[];
  unmapped: UnmappedPlacement[];
  manifest: unknown;
  materializeMs: number;
  traceMs: number;
  /** Set when the service rejected or was unreachable; the last trace stays. */
  serviceError: string | null;
  /** A newer request is in flight; views may restyle the trace as stale. */
  busy: boolean;
}

const defaultKernelState: KernelSimState = {
  segments: null,
  detector: null,
  requestId: 0,
  findings: [],
  warnings: [],
  mapped: [],
  unmapped: [],
  manifest: null,
  materializeMs: 0,
  traceMs: 0,
  serviceError: null,
  busy: false,
};

interface SimulationStore extends SimulationState {
  /** Selected physics engine; 'kernel' unless the debug flag opts into legacy. */
  engine: SimulationEngineKind;
  setEngine: (engine: SimulationEngineKind) => void;

  kernel: KernelSimState;
  setKernelResult: (result: KernelPassResult) => void;
  setKernelError: (error: unknown, requestId: number) => void;
  setKernelBusy: (busy: boolean) => void;

  // Actions
  setConfig: (config: Partial<SimulationConfig>) => void;
  toggleSimulation: () => void;
  runSimulation: () => void;
  stopSimulation: () => void;
  clearResults: () => void;
  
  // Internal state updates
  setRunning: (running: boolean) => void;
  setResults: (result: SimulationResult) => void;
  setElements: (elements: OpticalElement[]) => void;
  addWarning: (warning: SimulationWarning) => void;
  addError: (error: SimulationError) => void;
  
  // Debounced auto-run
  scheduleAutoRun: () => void;
}

// Default state. On the kernel engine the simulation is on by default: the
// first-success scenario (spec 18.1) has rays appear on placement with no
// further action. The legacy debug engine keeps its old off-by-default.
const defaultState: SimulationState = {
  config: {
    ...getDefaultSimulationConfig(),
    ...(initialEngine() === 'kernel' ? { enabled: true, autoRun: true } : {}),
  },
  isRunning: false,
  lastRunTime: 0,
  elements: [],
  rays: [],
  raysByLayer: {},
  elementsByLayer: {},
  detectorReadings: [],
  warnings: [],
  errors: []
};

// Auto-run debounce timer
let autoRunTimer: ReturnType<typeof setTimeout> | null = null;

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...defaultState,
  engine: initialEngine(),
  kernel: defaultKernelState,

  setEngine: (engine) => {
    set({ engine });
  },

  setKernelResult: (result) => {
    const parsed = parseDetectorResult(result.detector?.resultJson);
    set(state => ({
      kernel: {
        ...state.kernel,
        segments: result.segments,
        detector:
          parsed && result.detector ? { result: parsed, hits: result.detector.hits } : null,
        requestId: result.requestId,
        findings: result.findings,
        warnings: result.warnings,
        mapped: result.mapped,
        unmapped: result.unmapped,
        manifest: result.manifest,
        materializeMs: result.materializeMs,
        traceMs: result.traceMs,
        serviceError: null,
      },
    }));
  },

  setKernelError: (error, requestId) => {
    // A 422 is a design diagnostic with a stable code; anything else is the
    // service being unreachable. Either way the last trace stays on screen
    // (decision 6.14: diagnostics arrive beside the picture, not instead).
    const message =
      error instanceof CoreServiceError
        ? error.message
        : `simulation service unreachable: ${error instanceof Error ? error.message : String(error)}`;
    set(state => ({
      kernel: { ...state.kernel, requestId, serviceError: message },
    }));
  },

  setKernelBusy: (busy) => {
    set(state => (state.kernel.busy === busy ? state : { kernel: { ...state.kernel, busy } }));
  },

  setConfig: (config) => {
    set(state => ({
      config: { ...state.config, ...config }
    }));
    
    // If auto-run is enabled, schedule a new simulation
    const newConfig = { ...get().config, ...config };
    if (newConfig.enabled && newConfig.autoRun) {
      get().scheduleAutoRun();
    }
  },

  toggleSimulation: () => {
    const currentState = get();
    const newEnabled = !currentState.config.enabled;
    
    set(state => ({
      config: { ...state.config, enabled: newEnabled }
    }));
    
    if (newEnabled) {
      // Run simulation when enabled
      get().runSimulation();
    } else {
      // Clear results when disabled
      get().clearResults();
    }
  },

  runSimulation: () => {
    const state = get();

    // E5: on the kernel engine every user action routes to the kernel loop —
    // no legacy-engine code runs on any user path (ADR-9).
    if (state.engine === 'kernel') {
      triggerKernelPass();
      return;
    }

    if (state.isRunning) {
      console.warn('Simulation already running');
      return;
    }
    
    // Get placed modules and module definitions from app store
    const appState = useAppStore.getState();
    const { placedModules, modules } = appState;

    // Compute unique layers
    const layers = [...new Set(placedModules.map(m => m.layer))].sort((a, b) => a - b);
    if (layers.length === 0) layers.push(0);

    // Build per-layer scenes
    const allElements: OpticalElement[] = [];
    const elementsByLayer: Record<number, OpticalElement[]> = {};
    let hasSources = false;

    for (const layer of layers) {
      const scene = buildScene(placedModules, modules, state.config, { layerFilter: layer });
      elementsByLayer[layer] = scene.elements;
      allElements.push(...scene.elements);
      if (scene.sources.length > 0) hasSources = true;

      for (const warning of scene.warnings) {
        get().addWarning({ code: 'SCENE_BUILD', message: warning });
      }
    }

    // Store merged elements list (backward compat for 2D overlay)
    set({ elements: allElements, elementsByLayer });

    if (!hasSources) {
      set({
        isRunning: false,
        rays: [],
        raysByLayer: {},
        detectorReadings: [],
        warnings: [...get().warnings, { code: 'NO_SOURCES', message: 'No light sources found. Add a laser or LED module.' }]
      });
      return;
    }
    
    // Set running state
    set({ isRunning: true, warnings: [], errors: [] });

    // Run simulation per layer, collect results, then merge
    const manager = getSimulationManager();
    const raysByLayer: Record<number, RayPath[]> = {};
    let pendingLayers = layers.length;

    for (const layer of layers) {
      const layerElements = elementsByLayer[layer];
      if (layerElements.length === 0) {
        raysByLayer[layer] = [];
        pendingLayers--;
        if (pendingLayers === 0) finalizeResults();
        continue;
      }

      manager.run(layerElements, state.config, {
        onResult: (result) => {
          raysByLayer[layer] = result.rays;
          pendingLayers--;
          if (pendingLayers === 0) {
            // Merge all per-layer results into a single flat array for backward compat
            const allRays = Object.values(raysByLayer).flat();
            const allDetector = result.detectorReadings; // last layer's readings (TODO: merge)
            set({
              isRunning: false,
              rays: allRays,
              raysByLayer,
              detectorReadings: allDetector,
              warnings: result.warnings,
              errors: result.errors,
              lastRunTime: result.executionTimeMs,
            });
          }
        },
        onProgress: (progress, rayCount) => {
          console.log(`Layer ${layer} simulation progress: ${progress}%, rays: ${rayCount}`);
        },
        onError: (error) => {
          pendingLayers--;
          set({
            isRunning: pendingLayers > 0,
            errors: [...get().errors, { code: 'RUNTIME_ERROR', message: `Layer ${layer}: ${error}` }]
          });
        }
      });
    }

    function finalizeResults() {
      const allRays = Object.values(raysByLayer).flat();
      set({
        isRunning: false,
        rays: allRays,
        raysByLayer,
        detectorReadings: [],
        lastRunTime: 0,
      });
    }
  },

  stopSimulation: () => {
    const manager = getSimulationManager();
    manager.stop();
    set({ isRunning: false });
  },

  clearResults: () => {
    set(state => ({
      rays: [],
      raysByLayer: {},
      elementsByLayer: {},
      detectorReadings: [],
      warnings: [],
      errors: [],
      lastRunTime: 0,
      kernel: { ...defaultKernelState, requestId: state.kernel.requestId },
    }));
  },

  setRunning: (running) => {
    set({ isRunning: running });
  },

  setResults: (result) => {
    set({
      isRunning: false,
      rays: result.rays,
      raysByLayer: {},
      detectorReadings: result.detectorReadings,
      warnings: result.warnings,
      errors: result.errors,
      lastRunTime: result.executionTimeMs
    });
  },

  setElements: (elements) => {
    set({ elements });
  },

  addWarning: (warning) => {
    set(state => ({
      warnings: [...state.warnings, warning]
    }));
  },

  addError: (error) => {
    set(state => ({
      errors: [...state.errors, error]
    }));
  },

  scheduleAutoRun: () => {
    // Cancel existing timer
    if (autoRunTimer) {
      clearTimeout(autoRunTimer);
    }
    
    // Schedule new run with debounce
    autoRunTimer = setTimeout(() => {
      const state = get();
      if (state.config.enabled && state.config.autoRun && !state.isRunning) {
        get().runSimulation();
      }
    }, 300); // 300ms debounce
  }
}));

// Subscribe to app store changes to trigger auto-run (legacy engine only —
// the kernel loop owns its own subscription in kernelSim.ts)
useAppStore.subscribe((state, prevState) => {
  const simState = useSimulationStore.getState();
  if (simState.engine !== 'legacy') return;

  // Check if simulation is enabled and auto-run is on
  if (!simState.config.enabled || !simState.config.autoRun) return;
  
  // Check if relevant state changed (placed modules or their params)
  if (
    state.placedModules !== prevState.placedModules
  ) {
    simState.scheduleAutoRun();
  }
});

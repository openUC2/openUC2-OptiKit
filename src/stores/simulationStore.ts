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

interface SimulationStore extends SimulationState {
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

// Default state
const defaultState: SimulationState = {
  config: getDefaultSimulationConfig(),
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
    set({
      rays: [],
      raysByLayer: {},
      elementsByLayer: {},
      detectorReadings: [],
      warnings: [],
      errors: [],
      lastRunTime: 0
    });
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

// Subscribe to app store changes to trigger auto-run
useAppStore.subscribe((state, prevState) => {
  const simState = useSimulationStore.getState();
  
  // Check if simulation is enabled and auto-run is on
  if (!simState.config.enabled || !simState.config.autoRun) return;
  
  // Check if relevant state changed (placed modules or their params)
  if (
    state.placedModules !== prevState.placedModules
  ) {
    simState.scheduleAutoRun();
  }
});

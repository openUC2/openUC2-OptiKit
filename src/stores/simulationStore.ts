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
  SimulationResult
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
    
    // Build scene from placed modules
    const scene = buildScene(placedModules, modules, state.config);
    
    // Store elements
    set({ elements: scene.elements });
    
    // Add any build warnings
    for (const warning of scene.warnings) {
      get().addWarning({ code: 'SCENE_BUILD', message: warning });
    }
    
    // Check if we have anything to simulate
    if (scene.sources.length === 0) {
      set({
        isRunning: false,
        rays: [],
        detectorReadings: [],
        warnings: [...get().warnings, { code: 'NO_SOURCES', message: 'No light sources found. Add a laser or LED module.' }]
      });
      return;
    }
    
    // Set running state
    set({ isRunning: true, warnings: [], errors: [] });
    
    // Get simulation manager and run
    const manager = getSimulationManager();
    
    manager.run(scene.elements, state.config, {
      onResult: (result) => {
        get().setResults(result);
      },
      onProgress: (progress, rayCount) => {
        // Could update progress UI here
        console.log(`Simulation progress: ${progress}%, rays: ${rayCount}`);
      },
      onError: (error) => {
        set({ 
          isRunning: false,
          errors: [...get().errors, { code: 'RUNTIME_ERROR', message: error }]
        });
      }
    });
  },

  stopSimulation: () => {
    const manager = getSimulationManager();
    manager.stop();
    set({ isRunning: false });
  },

  clearResults: () => {
    set({
      rays: [],
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

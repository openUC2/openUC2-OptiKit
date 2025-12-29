/**
 * SimulationManager - Manages the simulation worker lifecycle
 * 
 * Provides a clean API for running simulations in a Web Worker
 * and receiving results back on the main thread.
 */

import type {
  OpticalElement,
  SimulationConfig,
  SimulationResult,
  SimulationWorkerMessage
} from '../types';
import { runSimulation } from './SimulationEngine';

type SimulationCallback = (result: SimulationResult) => void;
type ProgressCallback = (progress: number, rayCount: number) => void;
type ErrorCallback = (error: string) => void;

/**
 * Simulation Manager class
 * Handles communication with the simulation worker
 */
export class SimulationManager {
  private worker: Worker | null = null;
  private onResult: SimulationCallback | null = null;
  private onProgress: ProgressCallback | null = null;
  private onError: ErrorCallback | null = null;
  private isRunning = false;
  private useWorker: boolean;

  constructor(useWorker: boolean = true) {
    this.useWorker = useWorker && typeof Worker !== 'undefined';
    
    if (this.useWorker) {
      this.initWorker();
    }
  }

  /**
   * Initialize the Web Worker
   */
  private initWorker() {
    try {
      // Create worker using Vite's worker syntax
      this.worker = new Worker(
        new URL('./simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error('Simulation worker error:', error);
        this.onError?.('Worker error: ' + error.message);
        this.isRunning = false;
      };
    } catch (error) {
      console.warn('Failed to create simulation worker, falling back to main thread:', error);
      this.useWorker = false;
      this.worker = null;
    }
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: SimulationWorkerMessage) {
    switch (message.type) {
      case 'result':
        this.isRunning = false;
        this.onResult?.(message.result);
        break;
      case 'progress':
        this.onProgress?.(message.progress, message.rayCount);
        break;
      case 'error':
        this.isRunning = false;
        this.onError?.(message.error);
        break;
    }
  }

  /**
   * Run simulation with given elements and config
   */
  run(
    elements: OpticalElement[],
    config: SimulationConfig,
    callbacks: {
      onResult?: SimulationCallback;
      onProgress?: ProgressCallback;
      onError?: ErrorCallback;
    } = {}
  ): void {
    if (this.isRunning) {
      callbacks.onError?.('Simulation already running');
      return;
    }

    this.onResult = callbacks.onResult || null;
    this.onProgress = callbacks.onProgress || null;
    this.onError = callbacks.onError || null;
    this.isRunning = true;

    if (this.useWorker && this.worker) {
      // Run in worker
      const message: SimulationWorkerMessage = {
        type: 'run',
        elements,
        config
      };
      this.worker.postMessage(message);
    } else {
      // Run on main thread (fallback)
      this.runOnMainThread(elements, config);
    }
  }

  /**
   * Fallback: run simulation on main thread
   */
  private runOnMainThread(elements: OpticalElement[], config: SimulationConfig) {
    // Use setTimeout to not block the UI completely
    setTimeout(() => {
      try {
        this.onProgress?.(0, 0);
        const result = runSimulation(elements, config);
        this.isRunning = false;
        this.onResult?.(result);
      } catch (error) {
        this.isRunning = false;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.onError?.(errorMessage);
      }
    }, 0);
  }

  /**
   * Run simulation synchronously (for immediate results)
   */
  runSync(
    elements: OpticalElement[],
    config: SimulationConfig
  ): SimulationResult {
    return runSimulation(elements, config);
  }

  /**
   * Stop running simulation
   */
  stop(): void {
    if (!this.isRunning) return;

    if (this.useWorker && this.worker) {
      const message: SimulationWorkerMessage = { type: 'stop' };
      this.worker.postMessage(message);
    }
    
    this.isRunning = false;
  }

  /**
   * Check if simulation is currently running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
let managerInstance: SimulationManager | null = null;

/**
 * Get the singleton simulation manager instance
 */
export function getSimulationManager(): SimulationManager {
  if (!managerInstance) {
    managerInstance = new SimulationManager();
  }
  return managerInstance;
}

/**
 * Dispose the singleton instance
 */
export function disposeSimulationManager(): void {
  if (managerInstance) {
    managerInstance.dispose();
    managerInstance = null;
  }
}

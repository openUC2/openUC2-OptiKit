/**
 * Simulation Web Worker
 * 
 * Runs ray tracing simulation off the main thread to prevent UI blocking.
 * Communicates via postMessage with the main thread.
 */

import { runSimulation } from './SimulationEngine';
import type { 
  OpticalElement, 
  SimulationConfig, 
  SimulationWorkerMessage,
  SimulationResult 
} from '../types';

// Worker state
let isRunning = false;
let shouldStop = false;

/**
 * Handle incoming messages from main thread
 */
self.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
  const message = event.data;
  
  switch (message.type) {
    case 'run':
      handleRun(message.elements, message.config);
      break;
    case 'stop':
      handleStop();
      break;
  }
};

/**
 * Run simulation with provided elements and config
 */
function handleRun(elements: OpticalElement[], config: SimulationConfig) {
  if (isRunning) {
    postMessage({ 
      type: 'error', 
      error: 'Simulation already running' 
    } as SimulationWorkerMessage);
    return;
  }
  
  isRunning = true;
  shouldStop = false;
  
  try {
    // Send progress update
    postMessage({ 
      type: 'progress', 
      progress: 0, 
      rayCount: 0 
    } as SimulationWorkerMessage);
    
    // Run the simulation
    const result: SimulationResult = runSimulation(elements, config);
    
    if (shouldStop) {
      // Simulation was cancelled
      isRunning = false;
      return;
    }
    
    // Send result back to main thread
    postMessage({ 
      type: 'result', 
      result 
    } as SimulationWorkerMessage);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    postMessage({ 
      type: 'error', 
      error: errorMessage 
    } as SimulationWorkerMessage);
  }
  
  isRunning = false;
}

/**
 * Stop running simulation
 */
function handleStop() {
  shouldStop = true;
  isRunning = false;
}

// Export empty object to make this a module
export {};

/**
 * Simulation module exports
 * 
 * The simulation uses a custom lightweight engine for 2D ray tracing.
 * Future: Integration with the ray-optics library (/ray-optics-src/) for advanced features.
 */

// Custom simulation engine
export { runSimulation, createTestScene } from './SimulationEngine';

// Simulation manager (handles worker threading)
export { SimulationManager, getSimulationManager, disposeSimulationManager } from './SimulationManager';

// Note: RayOpticsAdapter is disabled pending proper build configuration for the ray-optics library
// The ray-optics library requires additional build setup to work with Vite
// export { RayOpticsAdapter, getRayOpticsAdapter } from './RayOpticsAdapter';

/**
 * RayOpticsAdapter - Adapter for the ray-optics simulation library
 * 
 * This module bridges the OptiKit configurator with the ray-optics-src library,
 * converting OptiKit modules to ray-optics scene objects and running simulations.
 * 
 * The ray-optics library (Apache 2.0 license) is a sophisticated 2D ray tracing
 * simulator supporting:
 * - Multiple light source types (point, beam, single ray)
 * - Various optical elements (mirrors, lenses, glass, beam splitters)
 * - Color/wavelength simulation
 * - Detection and measurement
 */

// Import the ray-optics core library
// @ts-ignore - JavaScript library without type definitions
import { Scene, Simulator, sceneObjs, geometry } from '../../ray-optics-src/core/index.js';

import type {
  OpticalElement,
  SimPoint,
  RayPath,
  DetectorReading,
  SimulationConfig,
  SimulationResult,
  SimulationWarning
} from '../types';

/**
 * Mapping from OptiKit element types to ray-optics sceneObj types
 * Used for reference/documentation
 */
// const ELEMENT_TYPE_MAP: Record<string, string> = {
//   'laser': 'SingleRay',
//   'led': 'PointSource',
//   'lens': 'IdealLens',
//   'mirror': 'Mirror',
//   'beamsplitter': 'BeamSplitter',
//   'dichroic': 'BeamSplitter',  // with filter enabled
//   'aperture': 'Blocker',
//   'filter': 'Blocker',  // with wavelength filter
//   'detector': 'Detector',
//   'grating': 'ConcaveDiffractionGrating'
// };

/**
 * Convert OptiKit simulation coordinates (mm) to ray-optics coordinates
 * ray-optics uses a coordinate system where 1 unit = 1 pixel typically
 * We'll use 1mm = 1 unit for simplicity
 */
function toRayOpticsCoord(point: SimPoint): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

/**
 * Create a ray-optics scene object from an OptiKit OpticalElement
 */
function createRayOpticsObject(element: OpticalElement, scene: typeof Scene): unknown {
  const pos = toRayOpticsCoord(element.position);
  const rotationRad = (element.rotation * Math.PI) / 180;
  
  switch (element.type) {
    case 'laser': {
      // SingleRay - a single ray from p1 pointing towards p2
      const rayLength = 100;
      const p1 = { x: pos.x, y: pos.y };
      const p2 = {
        x: pos.x + Math.cos(rotationRad) * rayLength,
        y: pos.y + Math.sin(rotationRad) * rayLength
      };
      
      const obj = new sceneObjs.SingleRay(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      obj.brightness = (element.params.power || 1) / 100;
      if (element.params.wavelength) {
        obj.wavelength = element.params.wavelength;
      }
      return obj;
    }
    
    case 'led': {
      // PointSource - 360 degree point source
      const obj = new sceneObjs.PointSource(scene);
      obj.x = pos.x;
      obj.y = pos.y;
      obj.brightness = (element.params.power || 1) / 100;
      if (element.params.wavelength) {
        obj.wavelength = element.params.wavelength;
      }
      return obj;
    }
    
    case 'lens': {
      // IdealLens - defined by two endpoints and focal length
      const aperture = element.params.aperture || 25;
      const halfAperture = aperture / 2;
      const perpRad = rotationRad + Math.PI / 2;
      
      const p1 = {
        x: pos.x + Math.cos(perpRad) * halfAperture,
        y: pos.y + Math.sin(perpRad) * halfAperture
      };
      const p2 = {
        x: pos.x - Math.cos(perpRad) * halfAperture,
        y: pos.y - Math.sin(perpRad) * halfAperture
      };
      
      const obj = new sceneObjs.IdealLens(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      obj.focalLength = element.params.focalLength || 100;
      return obj;
    }
    
    case 'mirror': {
      // Mirror - simple line mirror
      const aperture = element.params.aperture || 25;
      const halfAperture = aperture / 2;
      const perpRad = rotationRad + Math.PI / 2;
      
      const p1 = {
        x: pos.x + Math.cos(perpRad) * halfAperture,
        y: pos.y + Math.sin(perpRad) * halfAperture
      };
      const p2 = {
        x: pos.x - Math.cos(perpRad) * halfAperture,
        y: pos.y - Math.sin(perpRad) * halfAperture
      };
      
      const obj = new sceneObjs.Mirror(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      return obj;
    }
    
    case 'beamsplitter':
    case 'dichroic': {
      // BeamSplitter
      const aperture = element.params.aperture || 25;
      const halfAperture = aperture / 2;
      const perpRad = rotationRad + Math.PI / 2;
      
      const p1 = {
        x: pos.x + Math.cos(perpRad) * halfAperture,
        y: pos.y + Math.sin(perpRad) * halfAperture
      };
      const p2 = {
        x: pos.x - Math.cos(perpRad) * halfAperture,
        y: pos.y - Math.sin(perpRad) * halfAperture
      };
      
      const obj = new sceneObjs.BeamSplitter(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      obj.transRatio = element.params.splitRatio || 0.5;
      
      // Enable dichroic filter if this is a dichroic element
      if (element.type === 'dichroic' && element.params.cutoffWavelength) {
        obj.filter = true;
        obj.wavelength = element.params.cutoffWavelength;
        obj.bandwidth = 50; // Default bandwidth
        obj.invert = element.params.transmitAbove || false;
      }
      return obj;
    }
    
    case 'aperture': {
      // Blocker - a line segment that blocks light
      const aperture = element.params.aperture || 25;
      const halfAperture = aperture / 2;
      const perpRad = rotationRad + Math.PI / 2;
      
      const p1 = {
        x: pos.x + Math.cos(perpRad) * halfAperture,
        y: pos.y + Math.sin(perpRad) * halfAperture
      };
      const p2 = {
        x: pos.x - Math.cos(perpRad) * halfAperture,
        y: pos.y - Math.sin(perpRad) * halfAperture
      };
      
      const obj = new sceneObjs.Blocker(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      return obj;
    }
    
    case 'detector': {
      // Detector (Power Detector in ray-optics)
      const width = element.params.width || 12;
      const halfWidth = width / 2;
      const perpRad = rotationRad + Math.PI / 2;
      
      const p1 = {
        x: pos.x + Math.cos(perpRad) * halfWidth,
        y: pos.y + Math.sin(perpRad) * halfWidth
      };
      const p2 = {
        x: pos.x - Math.cos(perpRad) * halfWidth,
        y: pos.y - Math.sin(perpRad) * halfWidth
      };
      
      const obj = new sceneObjs.Detector(scene);
      obj.p1 = geometry.point(p1.x, p1.y);
      obj.p2 = geometry.point(p2.x, p2.y);
      return obj;
    }
    
    default:
      console.warn(`Unknown element type: ${element.type}`);
      return null;
  }
}

/**
 * RayOpticsAdapter - Main adapter class for running simulations
 */
export class RayOpticsAdapter {
  private scene: typeof Scene;
  private simulator: typeof Simulator | null = null;
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private elementIdMap: Map<unknown, string> = new Map();
  
  constructor() {
    // Create an offscreen canvas for rendering (required by ray-optics)
    if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(1000, 1000);
      this.ctx = this.canvas.getContext('2d');
    }
  }
  
  /**
   * Build a ray-optics Scene from OptiKit elements
   */
  buildScene(elements: OpticalElement[], config: SimulationConfig): typeof Scene {
    this.scene = new Scene();
    this.elementIdMap.clear();
    
    // Configure scene settings
    this.scene.mode = 'rays';
    this.scene.rayModeDensity = Math.min(1, (config.maxRays || 100) / 100);
    this.scene.simulateColors = true;
    this.scene.showGrid = false;
    
    // Add elements to scene
    for (const element of elements) {
      const rayOpticsObj = createRayOpticsObject(element, this.scene);
      if (rayOpticsObj) {
        this.scene.objs.push(rayOpticsObj);
        this.elementIdMap.set(rayOpticsObj, element.id);
      }
    }
    
    return this.scene;
  }
  
  /**
   * Run the simulation and extract ray paths
   */
  runSimulation(elements: OpticalElement[], config: SimulationConfig): SimulationResult {
    const startTime = performance.now();
    const warnings: SimulationWarning[] = [];
    
    try {
      // Build the scene
      this.buildScene(elements, config);
      
      // Create simulator with the context
      if (this.ctx) {
        this.simulator = new Simulator(
          this.scene,
          this.ctx,
          null, // ctxBelowLight
          null, // ctxAboveLight
          null, // ctxGrid
          null, // ctxVirtual
          false, // enableTimer
          config.maxRays || 1000 // rayCountLimit
        );
        
        // Run the simulation (synchronously)
        this.simulator.updateSimulation(false, false);
      }
      
      // Extract ray paths from the rendered scene
      const rays = this.extractRayPaths();
      
      // Extract detector readings
      const detectorReadings = this.extractDetectorReadings(elements);
      
      const computeTime = performance.now() - startTime;
      
      return {
        success: true,
        rays,
        detectorReadings,
        warnings,
        errors: [],
        executionTimeMs: computeTime,
        rayCount: rays.length,
        segmentCount: rays.reduce((sum, r) => sum + r.segments.length, 0)
      };
    } catch (error) {
      console.error('Simulation error:', error);
      return {
        success: false,
        rays: [],
        detectorReadings: [],
        warnings,
        errors: [{
          code: 'SIMULATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown simulation error'
        }],
        executionTimeMs: performance.now() - startTime,
        rayCount: 0,
        segmentCount: 0
      };
    }
  }
  
  /**
   * Extract ray paths from the simulator's internal state
   * Note: This is a simplified extraction - the full ray-optics library
   * renders rays directly to canvas. For OptiKit we need the ray data.
   */
  private extractRayPaths(): RayPath[] {
    const rays: RayPath[] = [];
    
    if (!this.simulator || !this.scene) {
      return rays;
    }
    
    // The ray-optics library stores rays during simulation
    // We need to hook into the rendering process to extract them
    // For now, we'll generate simplified ray paths based on scene geometry
    
    // Find all sources
    const sources = this.scene.objs.filter((obj: unknown) => {
      const type = (obj as { constructor: { type: string } }).constructor.type;
      return type === 'SingleRay' || type === 'PointSource' || type === 'Beam';
    });
    
    for (const source of sources) {
      const sourceId = this.elementIdMap.get(source) || 'unknown';
      const sourceType = (source as { constructor: { type: string } }).constructor.type;
      
      if (sourceType === 'SingleRay') {
        const singleRay = source as {
          p1: { x: number; y: number };
          p2: { x: number; y: number };
          wavelength?: number;
          brightness?: number;
        };
        
        const wavelength = singleRay.wavelength || 550;
        
        // Create a ray path from the single ray
        const rayPath: RayPath = {
          id: `ray-${sourceId}-0`,
          sourceId,
          wavelength,
          segments: [{
            start: { x: singleRay.p1.x, y: singleRay.p1.y },
            end: { x: singleRay.p2.x, y: singleRay.p2.y },
            wavelength,
            intensity: singleRay.brightness || 1,
            rayId: `ray-${sourceId}-0`
          }],
          terminated: false,
          terminationReason: 'boundary'
        };
        
        rays.push(rayPath);
      } else if (sourceType === 'PointSource') {
        const pointSource = source as {
          x: number;
          y: number;
          wavelength?: number;
          brightness?: number;
        };
        
        const wavelength = pointSource.wavelength || 550;
        
        // Generate rays in all directions
        const numRays = 8;
        for (let i = 0; i < numRays; i++) {
          const angle = (i / numRays) * 2 * Math.PI;
          const rayLength = 500;
          const rayId = `ray-${sourceId}-${i}`;
          
          const rayPath: RayPath = {
            id: rayId,
            sourceId,
            wavelength,
            segments: [{
              start: { x: pointSource.x, y: pointSource.y },
              end: {
                x: pointSource.x + Math.cos(angle) * rayLength,
                y: pointSource.y + Math.sin(angle) * rayLength
              },
              wavelength,
              intensity: (pointSource.brightness || 1) / numRays,
              rayId
            }],
            terminated: false,
            terminationReason: 'boundary'
          };
          
          rays.push(rayPath);
        }
      }
    }
    
    return rays;
  }
  
  /**
   * Extract detector readings from the simulation
   */
  private extractDetectorReadings(elements: OpticalElement[]): DetectorReading[] {
    const readings: DetectorReading[] = [];
    
    // Find detector elements
    const detectors = elements.filter(e => e.type === 'detector');
    
    for (const detector of detectors) {
      // For now, create placeholder readings
      // Full integration would extract from ray-optics Detector objects
      readings.push({
        detectorId: detector.id,
        moduleInstanceId: detector.moduleInstanceId || detector.id,
        totalPower: 0,
        rayCount: 0,
        centroid: detector.position,
        spread: { x: 0, y: 0 },
        rayImpacts: []  // Will be populated when ray tracing is fully integrated
      });
    }
    
    return readings;
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.simulator = null;
    this.scene = null as unknown as typeof Scene;
    this.elementIdMap.clear();
  }
}

/**
 * Singleton instance
 */
let adapterInstance: RayOpticsAdapter | null = null;

export function getRayOpticsAdapter(): RayOpticsAdapter {
  if (!adapterInstance) {
    adapterInstance = new RayOpticsAdapter();
  }
  return adapterInstance;
}

/**
 * SceneBuilder - Transforms OptiKit grid modules to ray-optics scene objects
 * 
 * This utility handles the coordinate transformation between the discrete 50mm grid
 * system used in OptiKit and the continuous millimeter coordinate space used by
 * the ray tracing simulation.
 */

import type {
  PlacedModule,
  ModuleDefinition,
  OpticalElement,
  OpticalElementParams,
  SimPoint,
  SimulationConfig,
  OpticalPort,
  ModuleSimulationModel
} from '../types';
import { MODULE_SIMULATION_MODELS } from '../types';

// Grid cell size in mm
const GRID_CELL_SIZE_MM = 50;

/**
 * Convert grid coordinates to simulation coordinates (mm)
 * Grid coordinates are integers (cell indices), simulation coordinates are continuous mm
 */
export function gridToSimCoords(gridPos: { x: number; y: number }, cellSizeMm: number = GRID_CELL_SIZE_MM): SimPoint {
  return {
    x: (gridPos.x + 0.5) * cellSizeMm, // Center of the grid cell
    y: (gridPos.y + 0.5) * cellSizeMm
  };
}

/**
 * Convert simulation coordinates (mm) back to grid coordinates
 */
export function simToGridCoords(simPos: SimPoint, cellSizeMm: number = GRID_CELL_SIZE_MM): { x: number; y: number } {
  return {
    x: Math.floor(simPos.x / cellSizeMm),
    y: Math.floor(simPos.y / cellSizeMm)
  };
}

/**
 * Calculate the center position of a placed module in simulation coordinates
 * Takes into account module footprint and rotation
 */
export function getModuleCenterSimCoords(
  module: PlacedModule,
  definition: ModuleDefinition,
  cellSizeMm: number = GRID_CELL_SIZE_MM
): SimPoint {
  const { width, height } = definition.footprint;
  
  // Check if rotated 90 or 270 degrees (swap width and height)
  const isRotated = module.rotation === 90 || module.rotation === 270;
  const effectiveWidth = isRotated ? height : width;
  const effectiveHeight = isRotated ? width : height;
  
  // Calculate center of the module footprint
  return {
    x: (module.position.x + effectiveWidth / 2) * cellSizeMm,
    y: (module.position.y + effectiveHeight / 2) * cellSizeMm
  };
}

/**
 * Get the simulation model for a module, or create a default one
 */
export function getSimulationModel(moduleId: string): ModuleSimulationModel | null {
  return MODULE_SIMULATION_MODELS[moduleId] || null;
}

/**
 * Check if a module has a simulation model (is optical)
 */
export function hasSimulationModel(moduleId: string): boolean {
  return moduleId in MODULE_SIMULATION_MODELS;
}

/**
 * Transform optical ports based on module rotation
 */
export function transformPorts(
  ports: OpticalPort[] | undefined,
  rotation: number,
  moduleCenter: SimPoint
): OpticalPort[] | undefined {
  if (!ports) return undefined;
  
  const rotRad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  
  return ports.map(port => ({
    ...port,
    position: {
      x: moduleCenter.x + (port.position.x * cos - port.position.y * sin),
      y: moduleCenter.y + (port.position.x * sin + port.position.y * cos)
    },
    direction: (port.direction + rotation) % 360
  }));
}

/**
 * Build optical element parameters from module params and simulation model
 */
function buildElementParams(
  module: PlacedModule,
  simModel: ModuleSimulationModel
): OpticalElementParams {
  // Start with default params from simulation model
  const params: OpticalElementParams = { ...simModel.defaultParams };
  
  // Apply parameter mappings from module params
  if (simModel.parameterMappings && module.params) {
    for (const [moduleParam, simParam] of Object.entries(simModel.parameterMappings)) {
      if (module.params[moduleParam] !== undefined) {
        (params as Record<string, unknown>)[simParam] = module.params[moduleParam];
      }
    }
  }
  
  // Also apply all module params directly if they exist in the params object
  // This ensures any parameter set in the UI is passed through to the simulation
  if (module.params) {
    const directParams = [
      'focalLength', 'wavelength', 'power', 'divergence', 'beamDiameter', 
      'rayCount', 'aperture', 'reflectivity', 'curvature', 'splitRatio',
      'cutoffWavelength', 'transmitAbove', 'transmission', 'width', 'height',
      'angle', 'bandpassCenter', 'bandpassWidth'
    ];
    
    for (const paramName of directParams) {
      if (module.params[paramName] !== undefined) {
        (params as Record<string, unknown>)[paramName] = module.params[paramName];
      }
    }
  }
  
  return params;
}

/**
 * Build a complete optical element from a placed module
 */
export function buildOpticalElement(
  module: PlacedModule,
  definition: ModuleDefinition,
  config: SimulationConfig
): OpticalElement | null {
  const simModel = getSimulationModel(module.moduleId);
  if (!simModel) return null;
  
  // Skip compound elements - they are handled separately
  if (simModel.elementType === 'compound') return null;
  
  const center = getModuleCenterSimCoords(module, definition, config.gridToSimScale);
  
  // Apply rotation offset from simulation model (fixes LED, beamsplitter, objective orientation)
  let effectiveRotation = module.rotation;
  if (simModel.rotationOffset) {
    effectiveRotation = (module.rotation + simModel.rotationOffset) % 360;
  }
  // NOTE: Mirror surface angle (params.angle) is now consumed directly inside
  // rayMirrorIntersection in SimulationEngine.ts for a cleaner separation of concerns.
  
  const element: OpticalElement = {
    id: `sim-${module.id}`,
    moduleInstanceId: module.id,
    type: simModel.elementType,
    position: center,
    rotation: effectiveRotation,
    params: buildElementParams(module, simModel)
  };
  
  return element;
}

/**
 * Build compound elements (modules with multiple optical elements like fiber combiner)
 */
export function buildCompoundElements(
  module: PlacedModule,
  definition: ModuleDefinition,
  config: SimulationConfig
): OpticalElement[] {
  const simModel = getSimulationModel(module.moduleId);
  if (!simModel || simModel.elementType !== 'compound' || !simModel.compoundElements) {
    return [];
  }
  
  const elements: OpticalElement[] = [];
  const center = getModuleCenterSimCoords(module, definition, config.gridToSimScale);
  const rotRad = ((module.rotation + (simModel.rotationOffset || 0)) * Math.PI) / 180;
  
  simModel.compoundElements.forEach((compEl, idx) => {
    // Rotate offset by module rotation
    const rotatedOffsetX = compEl.offsetX * Math.cos(rotRad) - compEl.offsetY * Math.sin(rotRad);
    const rotatedOffsetY = compEl.offsetX * Math.sin(rotRad) + compEl.offsetY * Math.cos(rotRad);
    
    // Merge default params with component-specific params
    const mergedParams = { ...simModel.defaultParams, ...compEl.params };
    
    // Apply module params overrides
    if (module.params) {
      for (const [key, value] of Object.entries(module.params)) {
        if (value !== undefined) {
          (mergedParams as Record<string, unknown>)[key] = value;
        }
      }
    }
    
    const element: OpticalElement = {
      id: `sim-${module.id}-${idx}`,
      moduleInstanceId: module.id,
      type: compEl.type,
      position: {
        x: center.x + rotatedOffsetX,
        y: center.y + rotatedOffsetY
      },
      rotation: (module.rotation + (simModel.rotationOffset || 0)) % 360,
      params: mergedParams as OpticalElementParams
    };
    
    elements.push(element);
  });
  
  return elements;
}

/**
 * Build the complete simulation scene from placed modules
 */
export function buildScene(
  placedModules: PlacedModule[],
  moduleDefinitions: ModuleDefinition[],
  config: SimulationConfig,
  options?: { layerFilter?: number }
): {
  elements: OpticalElement[];
  sources: OpticalElement[];
  detectors: OpticalElement[];
  warnings: string[];
} {
  const elements: OpticalElement[] = [];
  const sources: OpticalElement[] = [];
  const detectors: OpticalElement[] = [];
  const warnings: string[] = [];

  // Optionally restrict to a single layer
  const modulesToProcess = options?.layerFilter !== undefined
    ? placedModules.filter(m => m.layer === options.layerFilter)
    : placedModules;
  
  // Create a lookup map for module definitions
  const defMap = new Map<string, ModuleDefinition>();
  for (const def of moduleDefinitions) {
    defMap.set(def.id, def);
  }
  
  // Process each placed module
  for (const module of modulesToProcess) {
    const definition = defMap.get(module.moduleId);
    if (!definition) {
      warnings.push(`Module definition not found: ${module.moduleId}`);
      continue;
    }
    
    // Check if module has a simulation model
    if (!hasSimulationModel(module.moduleId)) {
      // Not an optical element - skip silently (structural elements like cubes)
      continue;
    }
    
    const simModel = getSimulationModel(module.moduleId);
    
    // Handle compound elements (e.g., fiber combiner)
    if (simModel?.elementType === 'compound') {
      const compoundEls = buildCompoundElements(module, definition, config);
      for (const el of compoundEls) {
        elements.push(el);
        if (el.type === 'laser' || el.type === 'led') {
          sources.push(el);
        } else if (el.type === 'detector') {
          detectors.push(el);
        }
      }
      continue;
    }
    
    const element = buildOpticalElement(module, definition, config);
    if (!element) {
      // Could be a compound element already handled, skip silently
      continue;
    }
    
    elements.push(element);
    
    // Categorize by type
    if (element.type === 'laser' || element.type === 'led') {
      sources.push(element);
    } else if (element.type === 'detector') {
      detectors.push(element);
    }
  }
  
  // Add warnings for common issues
  if (sources.length === 0) {
    warnings.push('No light sources found in the scene. Add a laser or LED module.');
  }
  if (detectors.length === 0) {
    warnings.push('No detectors found in the scene. Add a camera or detector module to measure rays.');
  }
  
  return { elements, sources, detectors, warnings };
}

/**
 * Get optical element type display name
 */
export function getElementTypeName(type: string): string {
  const names: Record<string, string> = {
    laser: 'Laser Source',
    led: 'LED Source',
    lens: 'Lens',
    mirror: 'Mirror',
    beamsplitter: 'Beam Splitter',
    dichroic: 'Dichroic Mirror',
    detector: 'Detector',
    aperture: 'Aperture',
    filter: 'Filter',
    fluorescent: 'Fluorescent Sample',
    aquarium: 'Aquarium',
    grating: 'Grating'
  };
  return names[type] || type;
}

/**
 * Check if a module type is a light source
 */
export function isSourceElement(moduleId: string): boolean {
  const model = getSimulationModel(moduleId);
  return model?.elementType === 'laser' || model?.elementType === 'led';
}

/**
 * Check if a module type is a detector
 */
export function isDetectorElement(moduleId: string): boolean {
  const model = getSimulationModel(moduleId);
  return model?.elementType === 'detector';
}

/**
 * Get default simulation configuration
 */
export function getDefaultSimulationConfig(): SimulationConfig {
  return {
    enabled: false,
    autoRun: false,
    maxRays: 100,
    maxBounces: 20,
    wavelength: 532,
    showRays: true,
    showDetectorReadings: true,
    showPhysicalIcons: false, // Off by default – toggle in simulation panel
    rayBrightness: 1.5,
    rayColorMode: 'wavelength',
    gridToSimScale: GRID_CELL_SIZE_MM
  };
}

/**
 * Wavelength to RGB color conversion for ray visualization
 */
export function wavelengthToColor(wavelength: number): string {
  // Approximate visible spectrum mapping
  let r = 0, g = 0, b = 0;
  
  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength >= 645 && wavelength <= 780) {
    r = 1;
    g = 0;
    b = 0;
  }
  
  // Intensity adjustment at the edges of visible spectrum
  let factor = 1;
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength >= 700 && wavelength <= 780) {
    factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  }
  
  r = Math.round(255 * Math.pow(r * factor, 0.8));
  g = Math.round(255 * Math.pow(g * factor, 0.8));
  b = Math.round(255 * Math.pow(b * factor, 0.8));
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get ray color based on configuration
 */
export function getRayColor(
  wavelength: number,
  intensity: number,
  sourceIndex: number,
  colorMode: 'wavelength' | 'intensity' | 'source'
): string {
  switch (colorMode) {
    case 'wavelength':
      return wavelengthToColor(wavelength);
    case 'intensity': {
      const i = Math.round(255 * intensity);
      return `rgb(${i}, ${i}, ${i})`;
    }
    case 'source': {
      // Predefined colors for different sources
      const colors = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
        '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
      ];
      return colors[sourceIndex % colors.length];
    }
    default:
      return wavelengthToColor(wavelength);
  }
}

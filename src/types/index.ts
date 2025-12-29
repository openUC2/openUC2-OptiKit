// Core types for the 2D Grid Builder application

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  group: string;
  color: string;
  footprint: Size; // in grid cells
  thumbnail?: string;
  cadUrl?: string;
  description?: string;
  defaultParams?: Record<string, unknown>;
  isWildCard?: boolean;
  autodeskInventor?: string;
  price?: number;
  notification?: string;
  linkUrl?: string;
  imSwitchConfig?: string; // Raw ImSwitch configuration string from CSV
}

export interface PlacedModule {
  id: string;
  moduleId: string;
  position: Point; // in grid coordinates
  rotation: number; // in degrees (0, 90, 180, 270)
  layer: number;
  params?: Record<string, unknown>;
  customText?: string; // For wild card modules
}

export interface Annotation {
  id: string;
  type: 'line' | 'arrow' | 'text' | 'optical-axis';
  layer: number;
  points?: Point[];
  text?: string;
  style?: {
    color?: string;
    fontSize?: number;
    fontFamily?: string;
    strokeWidth?: number;
    strokeStyle?: 'solid' | 'dashed';
  };
}

export interface Layer {
  id: string;
  name: string;
  index: number;
  visible: boolean;
}

export interface GridConfig {
  cellSize: number; // 50mm in pixels
  gridVisible: boolean;
  snapEnabled: boolean;
}

export interface ViewportConfig {
  zoom: number;
  pan: Point;
}

// Simplified state snapshot for undo/redo
export interface StateSnapshot {
  placedModules: PlacedModule[];
  annotations: Annotation[];
  layers: Layer[];
  activeLayerId: string;
  selectedItems: SelectedItem[];
  selectedItemId: string | null;
  selectedItemType: 'module' | 'annotation' | null;
}

// Setup metadata interface
export interface SetupMetadata {
  name: string;
  author: string;
  githubAccount: string;
  description: string;
  category: 'General' | 'Microscopy' | 'Astronomy' | 'Spectroscopy' | 'Imaging' | 'Laser';
  screenshot: string;
  // New required fields for collections support
  uc2_verified?: boolean;
  version?: string;
  createdAt?: string;
  collection?: string | string[]; // Support both single and multiple collections
  notification?: string; // For safety warnings, module requirements, etc.
}

export interface FeedbackData {
  type: 'bug' | 'feature' | 'improvement' | 'other';
  title: string;
  description: string;
  email?: string;
  trigger: 'download' | 'github' | 'manual';
  timestamp: string;
  userAgent: string;
  url: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  duration?: number; // in milliseconds, 0 for persistent
  timestamp: number;
}

export interface SelectedItem {
  id: string;
  type: 'module' | 'annotation';
}

export interface AppState {
  modules: ModuleDefinition[];
  placedModules: PlacedModule[];
  annotations: Annotation[];
  layers: Layer[];
  activeLayerId: string;
  selectedItemId: string | null;
  selectedItemType: 'module' | 'annotation' | null;
  selectedItems: SelectedItem[]; // For multiple selection
  selectionMode: 'single' | 'multiple';
  grid: GridConfig;
  viewport: ViewportConfig;
  history: StateSnapshot[]; // Command history for undo/redo
  historyIndex: number;
  annotationMode: 'none' | 'line' | 'arrow' | 'text' | 'optical-axis';
  setupMetadata: SetupMetadata;
  // UI state
  activeRightTab: 'layers' | 'properties' | 'simulation' | 'bom' | 'annotations' | 'chat';
  notifications: Notification[];
  // Tutorial state
  tutorialCompleted: boolean;
  startupDialogClosed: boolean;
  // Chat state
  chat: ChatState;
}

export interface Command {
  type: string;
  execute: () => void;
  undo: () => void;
  description: string;
}

export interface UC2Component {
  name: string;
  file: string;
  grid_pos: [number, number, number];
  rotation: [number, number, number];
  moduleId: string;
  originalName: string;
  description?: string;
  params?: Record<string, unknown>;
  customText?: string;
}

export interface CompactModule {
  i: string; // moduleId
  p: [number, number, number]; // position [x, y, layer]
  r: number; // rotation
  t?: string; // customText
}

export interface CompactAnnotation {
  t: 'line' | 'arrow' | 'text' | 'optical-axis'; // type
  p: Point[]; // points
  x?: string; // text
}

export interface CompactExport {
  m: CompactModule[];
  a?: CompactAnnotation[];
}

// Chat-related interfaces
export interface ChatMessage {
  id: string;
  chatPartner: 'user' | 'bot';
  message: string;
  attachment?: string; // JSON string for configuration data
  timestamp: string;
  sessionId: string;
}

export interface ChatSession {
  sessionId: string;
  messages: ChatMessage[];
  lastPolled: string;
}

export interface ChatState {
  currentSession: ChatSession | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
}

// ImSwitch Configuration types
export interface ImSwitchManagerProperties {
  [key: string]: unknown;
}

export interface ImSwitchLaser {
  managerName: string;
  managerProperties: ImSwitchManagerProperties;
  valueRangeMin: number;
  valueRangeMax: number;
  wavelength: number;
  valueRangeStep: number;
  analogChannel?: null;
  digitalLine?: null;
  freqRangeMin?: number;
  freqRangeMax?: number;
  freqRangeInit?: number;
}

export interface ImSwitchDetector {
  managerName: string;
  managerProperties: ImSwitchManagerProperties;
  forAcquisition: boolean;
  forFocusLock: boolean;
  analogChannel?: null;
  digitalLine?: null;
}

export interface ImSwitchPositioner {
  managerName: string;
  managerProperties: ImSwitchManagerProperties;
  axes: string[];
  isPositiveDirection: boolean;
  forPositioning: boolean;
  forScanning: boolean;
  resetOnClose: boolean;
  stageOffsets: Record<string, number>;
  analogChannel?: null;
  digitalLine?: null;
}

export interface ImSwitchRs232Device {
  managerName: string;
  managerProperties: ImSwitchManagerProperties;
}

export interface ImSwitchFocusLock {
  camera: string;
  positioner: string;
  updateFreq: number;
  cropCenter: [number, number];
  cropSize: number;
  piKp: number;
  piKi: number;
  focusLockMetric: string;
  laserName: string;
  laserValue: number;
  fovWidth: number;
  fovCenter: [null, null];
}

export interface ImSwitchConfiguration {
  detectors?: Record<string, ImSwitchDetector>;
  lasers?: Record<string, ImSwitchLaser>;
  LEDs?: Record<string, unknown>;
  LEDMatrixs?: Record<string, unknown>;
  positioners?: Record<string, ImSwitchPositioner>;
  rs232devices?: Record<string, ImSwitchRs232Device>;
  slm?: null;
  sim?: null;
  dpc?: null;
  objective?: Record<string, unknown>;
  mct?: Record<string, unknown>;
  nidaq?: Record<string, unknown>;
  roiscan?: null;
  lightsheet?: null;
  webrtc?: null;
  hypha?: null;
  mockxx?: null;
  jetsonnano?: null;
  Stresstest?: null;
  HistoScan?: Record<string, unknown>;
  Workflow?: null;
  FlowStop?: null;
  Lepmon?: null;
  Flatfield?: null;
  PixelCalibration?: Record<string, unknown>;
  experiment?: null;
  uc2Config?: null;
  ism?: null;
  focusLock?: ImSwitchFocusLock;
  arkitekt?: null;
  fovLock?: null;
  autofocus?: Record<string, unknown>;
  scan?: null;
  etSTED?: null;
  rotators?: null;
  microscopeStand?: null;
  pulseStreamer?: Record<string, unknown>;
  pyroServerInfo?: Record<string, unknown>;
  rois?: Record<string, unknown>;
  ledPresets?: Record<string, unknown>;
  defaultLEDPresetForScan?: null;
  laserPresets?: Record<string, unknown>;
  stageOffsets?: Record<string, unknown>;
  defaultLaserPresetForScan?: null;
  availableWidgets?: string[];
  nonAvailableWidgets?: string[];
}

export interface AvailableController {
  id: string;
  name: string;
  description: string;
  category: 'widget' | 'hardware';
  dependencies?: string[];
  configTemplate?: Record<string, unknown>;
}

// =====================================================
// Ray Optics Simulation Types
// =====================================================

/**
 * Types of optical elements supported in the simulation
 */
export type OpticalElementType = 
  | 'laser'           // Collimated light source
  | 'led'             // Divergent light source  
  | 'lens'            // Positive or negative lens
  | 'mirror'          // Flat or curved mirror
  | 'beamsplitter'    // 50/50 or custom ratio beam splitter
  | 'dichroic'        // Wavelength-selective beam splitter
  | 'detector'        // Camera/detector surface
  | 'aperture'        // Iris or pinhole
  | 'filter'          // Absorbing/bandpass filter
  | 'grating';        // Diffraction grating

/**
 * 2D point in simulation coordinate space (mm)
 */
export interface SimPoint {
  x: number; // mm
  y: number; // mm
}

/**
 * A single ray segment for visualization
 */
export interface RaySegment {
  start: SimPoint;
  end: SimPoint;
  wavelength: number;    // nm
  intensity: number;     // 0-1 normalized
  rayId: string;         // Unique identifier for the ray chain
}

/**
 * Complete ray path from source to termination
 */
export interface RayPath {
  id: string;
  sourceId: string;      // ID of the source module
  segments: RaySegment[];
  wavelength: number;    // nm
  terminated: boolean;   // True if ray was absorbed or exited scene
  terminationReason?: 'absorbed' | 'detector' | 'boundary' | 'max_bounces';
}

/**
 * Optical element definition for simulation
 */
export interface OpticalElement {
  id: string;
  moduleInstanceId: string;  // Links to PlacedModule.id
  type: OpticalElementType;
  position: SimPoint;        // Center position in mm
  rotation: number;          // Degrees
  params: OpticalElementParams;
}

/**
 * Parameters specific to each optical element type
 */
export interface OpticalElementParams {
  // Common
  aperture?: number;         // Clear aperture in mm
  
  // Lens parameters
  focalLength?: number;      // mm (positive = converging, negative = diverging)
  
  // Mirror parameters
  curvature?: number;        // 1/radius, 0 = flat
  reflectivity?: number;     // 0-1
  
  // Beam splitter parameters
  splitRatio?: number;       // Transmitted fraction (0-1)
  
  // Dichroic parameters
  cutoffWavelength?: number; // nm
  transmitAbove?: boolean;   // True if long-pass
  
  // Source parameters (laser/led)
  wavelength?: number;       // nm
  divergence?: number;       // Half-angle in degrees (0 = collimated)
  power?: number;            // mW
  rayCount?: number;         // Number of rays to emit
  beamDiameter?: number;     // mm
  
  // Detector parameters
  width?: number;            // Detector width in mm
  height?: number;           // Detector height in mm
  
  // Filter parameters
  transmission?: number;     // 0-1
  bandpassCenter?: number;   // nm
  bandpassWidth?: number;    // nm (FWHM)
  
  // Grating parameters
  linesPerMm?: number;       // Lines per mm
  order?: number;            // Diffraction order
}

/**
 * Reading from a detector element
 */
export interface DetectorReading {
  detectorId: string;
  moduleInstanceId: string;
  totalPower: number;        // Sum of ray intensities hitting detector
  rayCount: number;          // Number of rays hitting detector
  centroid: SimPoint;        // Center of mass of ray impacts
  spread: {                  // RMS spread of ray impacts
    x: number;
    y: number;
  };
  irradianceProfile?: {      // 1D profile if enabled
    positions: number[];     // mm from detector center
    intensities: number[];   // Normalized intensity
  };
  rayImpacts: SimPoint[];    // Individual ray impact positions
}

/**
 * Optical port definition for module connections
 */
export interface OpticalPort {
  id: string;
  name: string;
  type: 'input' | 'output' | 'bidirectional';
  position: SimPoint;        // Relative to module center
  direction: number;         // Angle in degrees (0 = +x, 90 = +y)
}

/**
 * Simulation model attached to a module definition
 */
export interface ModuleSimulationModel {
  elementType: OpticalElementType;
  defaultParams: Partial<OpticalElementParams>;
  ports?: OpticalPort[];
  parameterMappings?: {
    // Maps module defaultParams to simulation params
    // e.g., { 'focalLength': 'focalLength' }
    [moduleParam: string]: keyof OpticalElementParams;
  };
}

/**
 * Global simulation configuration
 */
export interface SimulationConfig {
  enabled: boolean;
  autoRun: boolean;          // Re-run simulation on changes
  maxRays: number;           // Max rays per source (performance limit)
  maxBounces: number;        // Max reflections/refractions per ray
  wavelength: number;        // Default wavelength in nm
  showRays: boolean;         // Render ray paths
  showDetectorReadings: boolean;
  rayBrightness: number;     // 0-1, visual brightness of ray overlay
  rayColorMode: 'wavelength' | 'intensity' | 'source';
  gridToSimScale: number;    // mm per grid cell (default 50)
}

/**
 * Complete simulation state
 */
export interface SimulationState {
  config: SimulationConfig;
  isRunning: boolean;
  lastRunTime: number;       // ms
  elements: OpticalElement[];
  rays: RayPath[];
  detectorReadings: DetectorReading[];
  warnings: SimulationWarning[];
  errors: SimulationError[];
}

/**
 * Simulation warning (non-fatal issues)
 */
export interface SimulationWarning {
  code: string;
  message: string;
  elementId?: string;
}

/**
 * Simulation error (fatal issues)
 */
export interface SimulationError {
  code: string;
  message: string;
  elementId?: string;
}

/**
 * Result from a simulation run
 */
export interface SimulationResult {
  success: boolean;
  rays: RayPath[];
  detectorReadings: DetectorReading[];
  warnings: SimulationWarning[];
  errors: SimulationError[];
  executionTimeMs: number;
  rayCount: number;
  segmentCount: number;
}

/**
 * Message types for WebWorker communication
 */
export type SimulationWorkerMessage = 
  | { type: 'run'; elements: OpticalElement[]; config: SimulationConfig }
  | { type: 'stop' }
  | { type: 'result'; result: SimulationResult }
  | { type: 'progress'; progress: number; rayCount: number }
  | { type: 'error'; error: string };

/**
 * Default simulation model mappings for standard OptiKit modules
 */
export const MODULE_SIMULATION_MODELS: Record<string, ModuleSimulationModel> = {
  'lens-pos-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 100, aperture: 25 },
    parameterMappings: { 'focalLength': 'focalLength' },
    ports: [
      { id: 'in', name: 'Input', type: 'input', position: { x: -25, y: 0 }, direction: 180 },
      { id: 'out', name: 'Output', type: 'output', position: { x: 25, y: 0 }, direction: 0 }
    ]
  },
  'lens-neg-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: -100, aperture: 25 },
    parameterMappings: { 'focalLength': 'focalLength' },
    ports: [
      { id: 'in', name: 'Input', type: 'input', position: { x: -25, y: 0 }, direction: 180 },
      { id: 'out', name: 'Output', type: 'output', position: { x: 25, y: 0 }, direction: 0 }
    ]
  },
  'lens-asp-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 100, aperture: 25 },
    parameterMappings: { 'focalLength': 'focalLength' }
  },
  'mirror-1x1': {
    elementType: 'mirror',
    defaultParams: { curvature: 0, reflectivity: 0.99, aperture: 25 }
  },
  'kinematicmirror-1x1': {
    elementType: 'mirror',
    defaultParams: { curvature: 0, reflectivity: 0.99, aperture: 25 }
  },
  'kinematicmirror-90-1x1': {
    elementType: 'mirror',
    defaultParams: { curvature: 0, reflectivity: 0.99, aperture: 25 }
  },
  'beamsplitter-1x1': {
    elementType: 'beamsplitter',
    defaultParams: { splitRatio: 0.5, aperture: 25, angle: 45 },
    parameterMappings: { 
      'splitRatio': 'splitRatio',
      'angle': 'angle'
    },
    ports: [
      { id: 'in', name: 'Input', type: 'input', position: { x: -25, y: 0 }, direction: 180 },
      { id: 'trans', name: 'Transmitted', type: 'output', position: { x: 25, y: 0 }, direction: 0 },
      { id: 'refl', name: 'Reflected', type: 'output', position: { x: 0, y: -25 }, direction: 270 }
    ]
  },
  'filter-dichroic': {
    elementType: 'dichroic',
    defaultParams: { cutoffWavelength: 510, transmitAbove: true, aperture: 25 },
    parameterMappings: { 'cutoff': 'cutoffWavelength' }
  },
  'laser-405nm': {
    elementType: 'laser',
    defaultParams: { wavelength: 405, power: 5, divergence: 0, beamDiameter: 2, rayCount: 5 },
    parameterMappings: { 
      'power': 'power', 
      'wavelength': 'wavelength', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'divergence': 'divergence'
    }
  },
  'laser-488nm': {
    elementType: 'laser',
    defaultParams: { wavelength: 488, power: 5, divergence: 0, beamDiameter: 2, rayCount: 5 },
    parameterMappings: { 
      'power': 'power', 
      'wavelength': 'wavelength', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'divergence': 'divergence'
    }
  },
  'laser-532nm': {
    elementType: 'laser',
    defaultParams: { wavelength: 532, power: 10, divergence: 0, beamDiameter: 2, rayCount: 5 },
    parameterMappings: { 
      'power': 'power', 
      'wavelength': 'wavelength', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'divergence': 'divergence'
    }
  },
  'laser-635nm': {
    elementType: 'laser',
    defaultParams: { wavelength: 635, power: 10, divergence: 0, beamDiameter: 2, rayCount: 5 },
    parameterMappings: { 
      'power': 'power', 
      'wavelength': 'wavelength', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'divergence': 'divergence'
    }
  },
  'led-470nm': {
    elementType: 'led',
    defaultParams: { wavelength: 470, divergence: 30, beamDiameter: 5, rayCount: 7, power: 1 },
    parameterMappings: { 
      'wavelength': 'wavelength', 
      'divergence': 'divergence', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'power': 'power'
    }
  },
  'led-530nm': {
    elementType: 'led',
    defaultParams: { wavelength: 530, divergence: 30, beamDiameter: 5, rayCount: 7, power: 1 },
    parameterMappings: { 
      'wavelength': 'wavelength', 
      'divergence': 'divergence', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'power': 'power'
    }
  },
  'led-625nm': {
    elementType: 'led',
    defaultParams: { wavelength: 625, divergence: 30, beamDiameter: 5, rayCount: 7, power: 1 },
    parameterMappings: { 
      'wavelength': 'wavelength', 
      'divergence': 'divergence', 
      'beamDiameter': 'beamDiameter', 
      'rayCount': 'rayCount',
      'power': 'power'
    }
  },
  'camera-usb': {
    elementType: 'detector',
    defaultParams: { width: 12, height: 8, aperture: 25 }
  },
  'camera-usb-daheng': {
    elementType: 'detector',
    defaultParams: { width: 12, height: 8, aperture: 25 }
  },
  'cube-raspicam-2x1': {
    elementType: 'detector',
    defaultParams: { width: 6.3, height: 4.7, aperture: 25 }
  },
  'photodiode': {
    elementType: 'detector',
    defaultParams: { width: 10, height: 10, aperture: 10 }
  },
  'pinhole-1x1': {
    elementType: 'aperture',
    defaultParams: { aperture: 0.05 },
    parameterMappings: { 'diameter': 'aperture' }
  },
  'iris-1x1': {
    elementType: 'aperture',
    defaultParams: { aperture: 5 }
  },
  'filter-bandpass': {
    elementType: 'filter',
    defaultParams: { bandpassCenter: 525, bandpassWidth: 50, transmission: 0.9 },
    parameterMappings: { 'wavelength': 'bandpassCenter' }
  },
  'polfilter-1x1': {
    elementType: 'filter',
    defaultParams: { transmission: 0.5 }
  },
  'tube-lens-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 200, aperture: 25 },
    parameterMappings: { 'focalLength_mm': 'focalLength' }
  },
  'objective-4x-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 40, aperture: 8 }
  },
  'objective-10x-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 16, aperture: 8 }
  },
  'objective-20x-1x1': {
    elementType: 'lens',
    defaultParams: { focalLength: 8, aperture: 6 }
  }
};
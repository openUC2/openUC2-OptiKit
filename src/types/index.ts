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
  activeRightTab: 'layers' | 'properties' | 'bom' | 'annotations' | 'chat';
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
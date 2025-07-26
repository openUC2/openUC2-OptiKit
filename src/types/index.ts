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
}

export interface AppState {
  modules: ModuleDefinition[];
  placedModules: PlacedModule[];
  annotations: Annotation[];
  layers: Layer[];
  activeLayerId: string;
  selectedItemId: string | null;
  selectedItemType: 'module' | 'annotation' | null;
  grid: GridConfig;
  viewport: ViewportConfig;
  history: StateSnapshot[]; // Command history for undo/redo
  historyIndex: number;
  annotationMode: 'none' | 'line' | 'arrow' | 'text' | 'optical-axis';
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
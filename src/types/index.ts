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
}

export interface PlacedModule {
  id: string;
  moduleId: string;
  position: Point; // in grid coordinates
  rotation: number; // in degrees (0, 90, 180, 270)
  layer: number;
  params?: Record<string, unknown>;
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

export interface Plate {
  id: string;
  name: string;
  position: Point; // Position relative to the main plate
  size: Size; // Size in grid cells
  visible: boolean;
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
  history: unknown[]; // Command history for undo/redo
  historyIndex: number;
  annotationMode: 'none' | 'line' | 'arrow' | 'text' | 'optical-axis';
}

export interface Command {
  type: string;
  execute: () => void;
  undo: () => void;
  description: string;
}
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { loadModulesFromCSV } from '../utils/moduleLoader';
import type { 
  AppState, 
  ModuleDefinition, 
  PlacedModule, 
  Annotation, 
  Layer, 
  Point, 
  Command 
} from '../types';

const GRID_CELL_SIZE = 50; // 50mm in pixels (assuming 1:1 scale)

// Sample module definitions (fallback)
const sampleModules: ModuleDefinition[] = [
  {
    id: 'cube-1x1',
    name: 'Basic Cube',
    group: 'cubes',
    color: '#3498db',
    footprint: { width: 1, height: 1 },
    thumbnail: '/icons/cube-1x1.svg',
    defaultParams: { height: 50 }
  },
  {
    id: 'lens-1x1',
    name: 'Lens',
    group: 'lenses',
    color: '#f39c12',
    footprint: { width: 1, height: 1 },
    thumbnail: '/icons/lens-1x1.svg',
    defaultParams: { focalLength: 100 }
  }
];

interface AppStore extends AppState {
  // Actions
  loadModules: () => Promise<void>;
  addLayer: (name: string) => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  placeModule: (moduleId: string, position: Point, layer: number) => void;
  moveModule: (moduleId: string, position: Point) => void;
  rotateModule: (moduleId: string, rotation: number) => void;
  removeModule: (moduleId: string) => void;
  addAnnotation: (annotation: Omit<Annotation, 'id'>) => void;
  removeAnnotation: (annotationId: string) => void;
  selectItem: (itemId: string | null, itemType: 'module' | 'annotation' | null) => void;
  setGridConfig: (config: Partial<AppState['grid']>) => void;
  setViewport: (config: Partial<AppState['viewport']>) => void;
  setAnnotationMode: (mode: AppState['annotationMode']) => void;
  checkCollision: (position: Point, footprint: { width: number; height: number }, layer: number, excludeId?: string) => boolean;
  exportData: () => string;
  importData: (data: string) => void;
  undo: () => void;
  redo: () => void;
  executeCommand: (command: Command) => void;
  centerView: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  modules: sampleModules,
  placedModules: [],
  annotations: [],
  layers: [
    { id: 'layer-0', name: 'Layer 0', index: 0, visible: true }
  ],
  activeLayerId: 'layer-0',
  selectedItemId: null,
  selectedItemType: null,
  grid: {
    cellSize: GRID_CELL_SIZE,
    gridVisible: true,
    snapEnabled: true
  },
  viewport: {
    zoom: 1,
    pan: { x: 0, y: 0 }
  },
  history: [],
  historyIndex: -1,
  annotationMode: 'none',

  // Actions
  loadModules: async () => {
    try {
      const modules = await loadModulesFromCSV();
      set({ modules });
    } catch (error) {
      console.error('Failed to load modules:', error);
      set({ modules: sampleModules });
    }
  },

  addLayer: (name: string) => {
    const newLayer: Layer = {
      id: uuidv4(),
      name,
      index: get().layers.length,
      visible: true
    };
    set(state => ({
      layers: [...state.layers, newLayer]
    }));
  },

  removeLayer: (layerId: string) => {
    const state = get();
    if (state.layers.length <= 1) return; // Don't remove the last layer
    
    set(state => ({
      layers: state.layers.filter(layer => layer.id !== layerId),
      placedModules: state.placedModules.filter(module => 
        state.layers.find(layer => layer.id === layerId)?.index !== module.layer
      ),
      annotations: state.annotations.filter(annotation => 
        state.layers.find(layer => layer.id === layerId)?.index !== annotation.layer
      ),
      activeLayerId: state.activeLayerId === layerId ? state.layers[0].id : state.activeLayerId
    }));
  },

  setActiveLayer: (layerId: string) => {
    set({ activeLayerId: layerId });
  },

  placeModule: (moduleId: string, position: Point, layer: number) => {
    const state = get();
    const moduleDefinition = state.modules.find(m => m.id === moduleId);
    if (!moduleDefinition) return;

    // Check for collision
    if (state.checkCollision(position, moduleDefinition.footprint, layer)) {
      return; // Cannot place due to collision
    }

    const newModule: PlacedModule = {
      id: uuidv4(),
      moduleId,
      position,
      rotation: 0,
      layer,
      params: { ...moduleDefinition.defaultParams }
    };

    set(state => ({
      placedModules: [...state.placedModules, newModule]
    }));
  },

  moveModule: (moduleId: string, position: Point) => {
    const state = get();
    const module = state.placedModules.find(m => m.id === moduleId);
    if (!module) return;

    const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
    if (!moduleDefinition) return;

    // Check for collision (excluding the module being moved)
    if (state.checkCollision(position, moduleDefinition.footprint, module.layer, moduleId)) {
      return;
    }

    set(state => ({
      placedModules: state.placedModules.map(m => 
        m.id === moduleId ? { ...m, position } : m
      )
    }));
  },

  rotateModule: (moduleId: string, rotation: number) => {
    set(state => ({
      placedModules: state.placedModules.map(m => 
        m.id === moduleId ? { ...m, rotation } : m
      )
    }));
  },

  removeModule: (moduleId: string) => {
    set(state => ({
      placedModules: state.placedModules.filter(m => m.id !== moduleId),
      selectedItemId: state.selectedItemId === moduleId ? null : state.selectedItemId
    }));
  },

  addAnnotation: (annotation: Omit<Annotation, 'id'>) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: uuidv4()
    };
    set(state => ({
      annotations: [...state.annotations, newAnnotation]
    }));
  },

  removeAnnotation: (annotationId: string) => {
    set(state => ({
      annotations: state.annotations.filter(a => a.id !== annotationId),
      selectedItemId: state.selectedItemId === annotationId ? null : state.selectedItemId
    }));
  },

  selectItem: (itemId: string | null, itemType: 'module' | 'annotation' | null) => {
    set({ selectedItemId: itemId, selectedItemType: itemType });
  },

  setGridConfig: (config: Partial<AppState['grid']>) => {
    set(state => ({
      grid: { ...state.grid, ...config }
    }));
  },

  setViewport: (config: Partial<AppState['viewport']>) => {
    set(state => ({
      viewport: { ...state.viewport, ...config }
    }));
  },

  setAnnotationMode: (mode: AppState['annotationMode']) => {
    set({ annotationMode: mode });
  },

  checkCollision: (position: Point, footprint: { width: number; height: number }, layer: number, excludeId?: string) => {
    const state = get();
    
    for (const module of state.placedModules) {
      if (module.id === excludeId || module.layer !== layer) continue;
      
      const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
      if (!moduleDefinition) continue;

      // Check if rectangles overlap
      const rect1 = {
        x: position.x,
        y: position.y,
        width: footprint.width,
        height: footprint.height
      };
      
      const rect2 = {
        x: module.position.x,
        y: module.position.y,
        width: moduleDefinition.footprint.width,
        height: moduleDefinition.footprint.height
      };

      if (rect1.x < rect2.x + rect2.width &&
          rect1.x + rect1.width > rect2.x &&
          rect1.y < rect2.y + rect2.height &&
          rect1.y + rect1.height > rect2.y) {
        return true; // Collision detected
      }
    }
    
    return false;
  },

  exportData: () => {
    const state = get();
    return JSON.stringify({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers
    });
  },

  importData: (data: string) => {
    try {
      const parsed = JSON.parse(data);
      set({
        placedModules: parsed.placedModules || [],
        annotations: parsed.annotations || [],
        layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
      });
    } catch (error) {
      console.error('Failed to import data:', error);
    }
  },

  undo: () => {
    // TODO: Implement undo functionality
  },

  redo: () => {
    // TODO: Implement redo functionality
  },

  executeCommand: (command: Command) => {
    // TODO: Implement command execution with history
    command.execute();
  },

  centerView: () => {
    set(state => ({
      viewport: {
        ...state.viewport,
        pan: { x: 0, y: 0 },
        zoom: 1
      }
    }));
  }
}));
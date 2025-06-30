import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// Types for the cube modules
export interface CubeModule {
  id: string;
  name: string;
  fileName: string;
  color: string;
  parameters: Record<string, unknown>;
  category: string;
}

export interface PlacedCube {
  id: string;
  moduleId: string;
  position: [number, number, number];
  rotation: [number, number, number]; // Rotation in degrees
  parameters: Record<string, unknown>;
}

export interface SceneState {
  placedCubes: PlacedCube[];
  selectedCubeId: string | null;
  availableModules: CubeModule[];
  gridSize: [number, number, number]; // [50, 50, 55] mm
  showGrid: boolean;
}

export interface SceneActions {
  addCube: (moduleId: string, position: [number, number, number]) => void;
  removeCube: (cubeId: string) => void;
  updateCubePosition: (
    cubeId: string,
    position: [number, number, number]
  ) => void;
  updateCubeRotation: (
    cubeId: string,
    rotation: [number, number, number]
  ) => void;
  selectCube: (cubeId: string | null) => void;
  updateCubeParameters: (
    cubeId: string,
    parameters: Record<string, unknown>
  ) => void;
  exportScene: () => string;
  importScene: (data: string) => void;
  clearScene: () => void;
}

export type AppStore = SceneState & SceneActions;

// Initial cube modules based on the STL files in the CAD folder
const initialModules: CubeModule[] = [
  {
    id: 'inskin-low',
    name: 'Inskin Low',
    fileName:
      'ASS - 2032 - CUBKINSPL+FIL - V04_PRT - 2033 - INSKINSPLLOW_1.stl',
    color: '#4f46e5',
    parameters: {},
    category: 'Kinematic',
  },
  {
    id: 'inskin-upper',
    name: 'Inskin Upper',
    fileName:
      'ASS - 2032 - CUBKINSPL+FIL - V04_PRT - 2034 - INSKINSPLUPP_2.stl',
    color: '#059669',
    parameters: {},
    category: 'Kinematic',
  },
  {
    id: 'holder-low',
    name: 'Holder Low',
    fileName:
      'ASS - 2032 - CUBKINSPL+FIL - V04_PRT - 2035 - HOLKINSPLLOW_3.stl',
    color: '#dc2626',
    parameters: {},
    category: 'Holder',
  },
  {
    id: 'holder-upper',
    name: 'Holder Upper',
    fileName:
      'ASS - 2032 - CUBKINSPL+FIL - V04_PRT - 2036 - HOLKINSPLUPP_4.stl',
    color: '#ea580c',
    parameters: {},
    category: 'Holder',
  },
];

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  placedCubes: [],
  selectedCubeId: null,
  availableModules: initialModules,
  gridSize: [50, 50, 55],
  showGrid: true,

  // Actions
  addCube: (moduleId, position) => {
    const module = get().availableModules.find((m) => m.id === moduleId);
    if (!module) return;

    const newCube: PlacedCube = {
      id: uuidv4(),
      moduleId,
      position,
      rotation: [0, 0, 0],
      parameters: { ...module.parameters },
    };

    set((state) => ({
      placedCubes: [...state.placedCubes, newCube],
      selectedCubeId: newCube.id,
    }));
  },

  removeCube: (cubeId) => {
    set((state) => ({
      placedCubes: state.placedCubes.filter((cube) => cube.id !== cubeId),
      selectedCubeId:
        state.selectedCubeId === cubeId ? null : state.selectedCubeId,
    }));
  },

  updateCubePosition: (cubeId, position) => {
    set((state) => ({
      placedCubes: state.placedCubes.map((cube) =>
        cube.id === cubeId ? { ...cube, position } : cube
      ),
    }));
  },

  updateCubeRotation: (cubeId, rotation) => {
    set((state) => ({
      placedCubes: state.placedCubes.map((cube) =>
        cube.id === cubeId ? { ...cube, rotation } : cube
      ),
    }));
  },

  selectCube: (cubeId) => {
    set({ selectedCubeId: cubeId });
  },

  updateCubeParameters: (cubeId, parameters) => {
    set((state) => ({
      placedCubes: state.placedCubes.map((cube) =>
        cube.id === cubeId
          ? { ...cube, parameters: { ...cube.parameters, ...parameters } }
          : cube
      ),
    }));
  },

  exportScene: () => {
    const state = get();
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      gridSize: state.gridSize,
      cubes: state.placedCubes.map((cube) => ({
        id: cube.id,
        moduleId: cube.moduleId,
        position: cube.position,
        rotation: cube.rotation,
        parameters: cube.parameters,
      })),
    };
    return JSON.stringify(exportData, null, 2);
  },

  importScene: (data) => {
    try {
      const importData = JSON.parse(data);
      if (importData.version && importData.cubes) {
        set({
          placedCubes: importData.cubes,
          selectedCubeId: null,
        });
      }
    } catch (error) {
      console.error('Failed to import scene:', error);
    }
  },

  clearScene: () => {
    set({
      placedCubes: [],
      selectedCubeId: null,
    });
  },
}));

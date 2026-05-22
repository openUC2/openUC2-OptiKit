import { create } from 'zustand';
import type {
  FrameWizardState,
  ObjectiveOption,
  LensOption,
  CameraOption,
  FluorescenceOption,
  FrameComponentPlacement,
  NyquistResult,
} from '../types/frameWizard';

interface FrameWizardStore {
  // Wizard state
  currentStep: number;
  wizardState: FrameWizardState;

  // Library data
  objectives: ObjectiveOption[];
  lenses: LensOption[];
  cameras: CameraOption[];
  fluorescenceOptions: FluorescenceOption[];

  // Loading state
  isLoading: boolean;

  // Actions
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateWizardState: (partial: Partial<FrameWizardState>) => void;
  resetWizard: () => void;
  loadPreset: (preset: Partial<FrameWizardState>) => void;
  setObjectives: (objectives: ObjectiveOption[]) => void;
  setLenses: (lenses: LensOption[]) => void;
  setCameras: (cameras: CameraOption[]) => void;
  setFluorescenceOptions: (options: FluorescenceOption[]) => void;
  setIsLoading: (loading: boolean) => void;

  // Computed
  getSelectedComponents: () => FrameComponentPlacement[];
  getTotalPrice: () => number;
  getStepPrice: (step: number) => number;
  computeNyquist: () => NyquistResult | null;
}

// WP1: 7 steps total
export const TOTAL_STEPS = 7;

// Fixed tube lens used in all configurations (Olympus infinity correction, 180 mm).
const FIXED_TUBE_LENS_FL_MM = 180;
const FIXED_TUBE_LENS_PRICE = 80;

// Static price tables centralised for transparent quoting.
const LIGHT_SOURCE_PRICE: Record<string, number> = {
  'single-led': 60,
  'complex-setup': 280,
};
const CONDENSER_PRICE: Record<string, number> = {
  abbe: 90,
  'aspherical-25': 45,
  'aspherical-8-ph': 50,
};
const FLUO_LIGHT_PRICE: Record<string, number> = {
  'laser-single': 1200,
  'laser-dual': 2200,
  'laser-quad': 3800,
  'led-single': 220,
  'led-quad': 1400,
};
const DICHROIC_PRICE: Record<string, number> = {
  'single-cn': 350,
  'dual-cn': 600,
  'multi-ahf': 1200,
};
const SAMPLE_HOLDER_PRICE: Record<string, number> = {
  'microscope-slide': 60,
  mtp: 100,
  'petri-dish': 80,
  'custom-3d': 120,
};
const CHANGER_PRICE: Record<string, number> = {
  single: 120,
  '2-position': 1500,
};

const defaultWizardState: FrameWizardState = {
  objectiveChanger: 'single',
  primaryObjective: null,
  secondaryObjective: null,
  lightSource: 'single-led',
  condenser: 'abbe',
  brightfieldModes: ['bf-only'],
  hasFluorescence: false,
  fluoLightSource: 'none',
  dichroic: 'none',
  fluorescenceChannels: [],
  selectedCamera: null,
  sampleHolder: 'none',
  customSampleHolderNotes: '',
  fieldOfApplication: '',
  specialRequirements: '',
  customNotes: '',
};

export const useFrameWizardStore = create<FrameWizardStore>((set, get) => ({
  currentStep: 0,
  wizardState: { ...defaultWizardState },
  objectives: [],
  lenses: [],
  cameras: [],
  fluorescenceOptions: [],
  isLoading: false,

  setStep: (step) => set({ currentStep: Math.max(0, Math.min(step, TOTAL_STEPS - 1)) }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS - 1) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),

  updateWizardState: (partial) =>
    set((s) => ({ wizardState: { ...s.wizardState, ...partial } })),

  resetWizard: () => set({ currentStep: 0, wizardState: { ...defaultWizardState } }),

  // WP9: merges a partial state from a preset JSON over the defaults.
  loadPreset: (preset) =>
    set({
      currentStep: 0,
      wizardState: { ...defaultWizardState, ...preset },
    }),

  setObjectives: (objectives) => set({ objectives }),
  setLenses: (lenses) => set({ lenses }),
  setCameras: (cameras) => set({ cameras }),
  setFluorescenceOptions: (options) => set({ fluorescenceOptions: options }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  getSelectedComponents: () => {
    const { wizardState, objectives, cameras } = get();
    const components: FrameComponentPlacement[] = [];

    // Always include frame body.
    components.push({ moduleId: 'frame-body', gridPos: [0, 0, 0], rotation: [0, 0, 0] });

    // Illumination: single LED or complex (LED + RGB ring).
    if (wizardState.lightSource === 'single-led') {
      components.push({ moduleId: 'frame-single-led', gridPos: [4, 0, 0], rotation: [0, 0, 0] });
    } else {
      components.push({ moduleId: 'frame-single-led', gridPos: [4, 0, 0], rotation: [0, 0, 0] });
      components.push({ moduleId: 'led-ring-koehlerillu', gridPos: [4, 1, 0], rotation: [0, 0, 0] });
    }

    // Condenser lens (always present).
    components.push({
      moduleId: 'condenser-lens',
      gridPos: [4, 2, 0],
      rotation: [0, 0, 0],
      params: { type: wizardState.condenser },
    });

    // Objective changer.
    if (wizardState.objectiveChanger === '2-position') {
      components.push({
        moduleId: 'motorized-objective-revolver',
        gridPos: [4, 3, 0],
        rotation: [0, 0, 0],
      });
    }

    // Primary objective.
    if (wizardState.primaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
      if (obj) {
        components.push({
          moduleId: 'objective-10x-1x1',
          gridPos: [4, 4, 0],
          rotation: [0, 0, 0],
          params: { magnification: obj.magnification, na: obj.na, wd_mm: obj.workingDistance_mm },
        });
      }
    }

    // Sample holder.
    switch (wizardState.sampleHolder) {
      case 'microscope-slide':
        components.push({ moduleId: 'frame-wellplate-insert-4slides', gridPos: [4, 5, 0], rotation: [0, 0, 0] });
        break;
      case 'mtp':
        components.push({ moduleId: 'frame-wellplate-insert-wellplate', gridPos: [4, 5, 0], rotation: [0, 0, 0] });
        break;
      case 'petri-dish':
        components.push({ moduleId: 'frame-petri-dish-holder', gridPos: [4, 5, 0], rotation: [0, 0, 0] });
        break;
      case 'custom-3d':
        components.push({ moduleId: 'frame-custom-holder', gridPos: [4, 5, 0], rotation: [0, 0, 0] });
        break;
    }

    // Fluorescence (dichroic + light source).
    if (wizardState.hasFluorescence && wizardState.fluoLightSource !== 'none') {
      components.push({ moduleId: 'filter-dichroic', gridPos: [4, 6, 0], rotation: [0, 180, 0] });
      components.push({ moduleId: 'led-470nm', gridPos: [7, 6, 0], rotation: [0, 0, 0] });
    }

    // Tube lens is fixed: Olympus infinity correction 180 mm.
    components.push({
      moduleId: 'tube-lens-1x1',
      gridPos: [4, 7, 0],
      rotation: [0, 0, 0],
      params: { focalLength_mm: FIXED_TUBE_LENS_FL_MM, fixed: true },
    });

    // Camera.
    if (wizardState.selectedCamera) {
      const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
      if (cam) {
        components.push({
          moduleId: 'camera-usb',
          gridPos: [4, 8, 0],
          rotation: [0, 0, 0],
          params: { sensor: cam.sensor, resolution: cam.resolution },
        });
      }
    }

    // Always include electronics board.
    components.push({ moduleId: 'electronics-v3', gridPos: [0, 5, 0], rotation: [0, 0, 0] });

    return components;
  },

  getTotalPrice: () => {
    const { wizardState, objectives, cameras, fluorescenceOptions } = get();
    let total = 9999; // Frame body base price.

    total += CHANGER_PRICE[wizardState.objectiveChanger] || 0;

    if (wizardState.primaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
      if (obj) total += obj.price;
    }
    if (wizardState.objectiveChanger === '2-position' && wizardState.secondaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.secondaryObjective);
      if (obj) total += obj.price;
    }

    total += LIGHT_SOURCE_PRICE[wizardState.lightSource] || 0;
    total += CONDENSER_PRICE[wizardState.condenser] || 0;

    if (wizardState.hasFluorescence) {
      total += FLUO_LIGHT_PRICE[wizardState.fluoLightSource] || 0;
      total += DICHROIC_PRICE[wizardState.dichroic] || 0;
      wizardState.fluorescenceChannels.forEach((chId) => {
        const ch = fluorescenceOptions.find((f) => f.id === chId);
        if (ch) total += ch.price_filterSet;
      });
    }

    if (wizardState.selectedCamera) {
      const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
      if (cam) total += cam.price;
    }

    if (wizardState.sampleHolder !== 'none') {
      total += SAMPLE_HOLDER_PRICE[wizardState.sampleHolder] || 0;
    }

    // Fixed tube lens & electronics board.
    total += FIXED_TUBE_LENS_PRICE;
    total += 150;

    return total;
  },

  getStepPrice: (step: number) => {
    const { wizardState, objectives, cameras, fluorescenceOptions } = get();
    switch (step) {
      case 0: // Objective changer
        return CHANGER_PRICE[wizardState.objectiveChanger] || 0;
      case 1: {
        // Objectives
        let p = 0;
        if (wizardState.primaryObjective) {
          const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
          if (obj) p += obj.price;
        }
        if (wizardState.objectiveChanger === '2-position' && wizardState.secondaryObjective) {
          const obj = objectives.find((o) => o.id === wizardState.secondaryObjective);
          if (obj) p += obj.price;
        }
        return p;
      }
      case 2: // Illumination = light source + condenser
        return (
          (LIGHT_SOURCE_PRICE[wizardState.lightSource] || 0) +
          (CONDENSER_PRICE[wizardState.condenser] || 0)
        );
      case 3: {
        // Fluorescence
        if (!wizardState.hasFluorescence) return 0;
        let p =
          (FLUO_LIGHT_PRICE[wizardState.fluoLightSource] || 0) +
          (DICHROIC_PRICE[wizardState.dichroic] || 0);
        wizardState.fluorescenceChannels.forEach((chId) => {
          const ch = fluorescenceOptions.find((f) => f.id === chId);
          if (ch) p += ch.price_filterSet;
        });
        return p;
      }
      case 4: {
        // Camera
        if (!wizardState.selectedCamera) return 0;
        const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
        return cam?.price || 0;
      }
      case 5: // Sample holder
        return wizardState.sampleHolder !== 'none'
          ? SAMPLE_HOLDER_PRICE[wizardState.sampleHolder] || 0
          : 0;
      default:
        return 0;
    }
  },

  computeNyquist: () => {
    const { wizardState, objectives, cameras } = get();
    if (!wizardState.primaryObjective || !wizardState.selectedCamera) return null;

    const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
    const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
    if (!obj || !cam) return null;

    const centralWavelength_um = 0.5; // 500 nm
    const resolution_um = (0.61 * centralWavelength_um) / obj.na;
    const nyquistPixelSize_um = resolution_um / 2;

    // Fixed 180 mm tube lens; effective magnification = f_tube / f_obj.
    const effectiveMag = FIXED_TUBE_LENS_FL_MM / obj.focalLength_mm;
    const effectivePixelSize_um = cam.pixelSize_um / effectiveMag;

    const samplingRatio = nyquistPixelSize_um / effectivePixelSize_um;
    const isSampled = samplingRatio >= 1.0;

    return {
      nyquistPixelSize_um,
      effectivePixelSize_um,
      isSampled,
      samplingRatio,
      resolution_um,
    };
  },
}));

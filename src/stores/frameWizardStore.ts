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

const TOTAL_STEPS = 11;

const defaultWizardState: FrameWizardState = {
  lightSource: 'none',
  autofocus: 'none',
  primaryObjective: null,
  secondaryObjective: null,
  sampleHolder: 'none',
  hasRevolver: false,
  hasOverviewCamera: false,
  hasFluorescence: false,
  fluorescenceChannels: [],
  selectedCamera: null,
  selectedTubeLens: null,
  controlInputs: [],
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

  resetWizard: () =>
    set({ currentStep: 0, wizardState: { ...defaultWizardState } }),

  setObjectives: (objectives) => set({ objectives }),
  setLenses: (lenses) => set({ lenses }),
  setCameras: (cameras) => set({ cameras }),
  setFluorescenceOptions: (options) => set({ fluorescenceOptions: options }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  getSelectedComponents: () => {
    const { wizardState, objectives, cameras, lenses } = get();
    const components: FrameComponentPlacement[] = [];

    // Always include the frame body
    components.push({
      moduleId: 'frame-body',
      gridPos: [0, 0, 0],
      rotation: [0, 0, 0],
    });

    // Light source
    switch (wizardState.lightSource) {
      case 'single-led':
        components.push({ moduleId: 'frame-single-led', gridPos: [4, 0, 0], rotation: [0, 0, 0] });
        break;
      case 'led-matrix':
        components.push({ moduleId: 'frame-led-matrix', gridPos: [4, -1, 0], rotation: [0, 0, 0] });
        break;
      case 'led-ring':
        components.push({ moduleId: 'led-ring-koehlerillu', gridPos: [4, 0, 0], rotation: [0, 0, 0] });
        break;
    }

    // Autofocus
    switch (wizardState.autofocus) {
      case 'laser-astigmatism':
        components.push({ moduleId: 'frame-laser-af', gridPos: [5, 4, 0], rotation: [0, 0, 0] });
        break;
      case 'image-contrast':
        components.push({ moduleId: 'frame-image-af', gridPos: [5, 4, 0], rotation: [0, 0, 0] });
        break;
    }

    // Objective lenses
    if (wizardState.primaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
      if (obj) {
        components.push({
          moduleId: 'objective-10x-1x1', // generic objective module
          gridPos: [4, 3, 0],
          rotation: [0, 0, 0],
          params: { magnification: obj.magnification, na: obj.na, wd_mm: obj.workingDistance_mm },
        });
      }
    }

    // Revolver
    if (wizardState.hasRevolver) {
      components.push({ moduleId: 'motorized-objective-revolver', gridPos: [4, 3, 0], rotation: [0, 0, 0] });
    }

    // Sample holder
    switch (wizardState.sampleHolder) {
      case '4-slide-insert':
        components.push({ moduleId: 'frame-wellplate-insert-4slides', gridPos: [4, 2, 0], rotation: [0, 0, 0] });
        break;
      case 'wellplate-insert':
        components.push({ moduleId: 'frame-wellplate-insert-wellplate', gridPos: [4, 2, 0], rotation: [0, 0, 0] });
        break;
    }

    // Overview camera
    if (wizardState.hasOverviewCamera) {
      components.push({ moduleId: 'overview-camera', gridPos: [2, 6, 0], rotation: [0, 90, 0] });
    }

    // Fluorescence
    if (wizardState.hasFluorescence && wizardState.fluorescenceChannels.length > 0) {
      // Add dichroic + filter module
      components.push({ moduleId: 'filter-dichroic', gridPos: [4, 5, 0], rotation: [0, 180, 0] });
      // Add LED/laser for first channel
      components.push({ moduleId: 'led-470nm', gridPos: [7, 5, 0], rotation: [0, 0, 0] });
    }

    // Camera
    if (wizardState.selectedCamera) {
      const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
      if (cam) {
        components.push({
          moduleId: 'camera-usb',
          gridPos: [4, 7, 0],
          rotation: [0, 0, 0],
          params: { sensor: cam.sensor, resolution: cam.resolution },
        });
      }
    }

    // Tube lens
    if (wizardState.selectedTubeLens) {
      const lens = lenses.find((l) => l.id === wizardState.selectedTubeLens);
      if (lens) {
        components.push({
          moduleId: 'tube-lens-1x1',
          gridPos: [4, 6, 0],
          rotation: [0, 0, 0],
          params: { focalLength_mm: lens.focalLength_mm },
        });
      }
    }

    // Control inputs
    if (wizardState.controlInputs.includes('ps4-joystick')) {
      components.push({ moduleId: 'frame-ps4-joystick', gridPos: [0, 8, 0], rotation: [0, 0, 0] });
    }
    if (wizardState.controlInputs.includes('can-jog-dial')) {
      components.push({ moduleId: 'dial-control', gridPos: [1, 8, 0], rotation: [0, 0, 0] });
    }

    // Always include electronics
    components.push({ moduleId: 'electronics-v3', gridPos: [0, 5, 0], rotation: [0, 0, 0] });

    return components;
  },

  getTotalPrice: () => {
    const { wizardState, objectives, cameras, lenses, fluorescenceOptions } = get();
    let total = 9999; // Frame body base price

    // Light source
    const lightPrices: Record<string, number> = {
      'single-led': 30,
      'led-matrix': 150,
      'led-ring': 120,
    };
    if (wizardState.lightSource !== 'none') {
      total += lightPrices[wizardState.lightSource] || 0;
    }

    // Autofocus
    if (wizardState.autofocus === 'laser-astigmatism') total += 3000;
    // image-contrast is software-based, no hardware cost

    // Objectives
    if (wizardState.primaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
      if (obj) total += obj.price;
    }
    if (wizardState.secondaryObjective) {
      const obj = objectives.find((o) => o.id === wizardState.secondaryObjective);
      if (obj) total += obj.price;
    }

    // Revolver
    if (wizardState.hasRevolver) total += 1500;

    // Sample holder
    const samplePrices: Record<string, number> = {
      '4-slide-insert': 80,
      'wellplate-insert': 100,
    };
    if (wizardState.sampleHolder !== 'none') {
      total += samplePrices[wizardState.sampleHolder] || 0;
    }

    // Overview camera
    if (wizardState.hasOverviewCamera) total += 150;

    // Fluorescence
    if (wizardState.hasFluorescence) {
      wizardState.fluorescenceChannels.forEach((chId) => {
        const ch = fluorescenceOptions.find((f) => f.id === chId);
        if (ch) total += ch.price_filterSet;
      });
    }

    // Camera
    if (wizardState.selectedCamera) {
      const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
      if (cam) total += cam.price;
    }

    // Tube lens
    if (wizardState.selectedTubeLens) {
      const lens = lenses.find((l) => l.id === wizardState.selectedTubeLens);
      if (lens) total += lens.price;
    }

    // Controls
    if (wizardState.controlInputs.includes('ps4-joystick')) total += 40;
    if (wizardState.controlInputs.includes('can-jog-dial')) total += 80;

    // Electronics
    total += 150;

    return total;
  },

  getStepPrice: (step: number) => {
    const { wizardState, objectives, cameras, lenses, fluorescenceOptions } = get();
    switch (step) {
      case 0: {
        const prices: Record<string, number> = { 'single-led': 30, 'led-matrix': 150, 'led-ring': 120 };
        return prices[wizardState.lightSource] || 0;
      }
      case 1:
        return wizardState.autofocus === 'laser-astigmatism' ? 3000 : 0;
      case 2: {
        let p = 0;
        if (wizardState.primaryObjective) {
          const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
          if (obj) p += obj.price;
        }
        if (wizardState.secondaryObjective) {
          const obj = objectives.find((o) => o.id === wizardState.secondaryObjective);
          if (obj) p += obj.price;
        }
        return p;
      }
      case 3: {
        const prices: Record<string, number> = { '4-slide-insert': 80, 'wellplate-insert': 100 };
        return prices[wizardState.sampleHolder] || 0;
      }
      case 4:
        return wizardState.hasRevolver ? 1500 : 0;
      case 5:
        return wizardState.hasOverviewCamera ? 150 : 0;
      case 6: {
        if (!wizardState.hasFluorescence) return 0;
        return wizardState.fluorescenceChannels.reduce((sum, chId) => {
          const ch = fluorescenceOptions.find((f) => f.id === chId);
          return sum + (ch?.price_filterSet || 0);
        }, 0);
      }
      case 7: {
        if (!wizardState.selectedCamera) return 0;
        const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
        return cam?.price || 0;
      }
      case 8: {
        if (!wizardState.selectedTubeLens) return 0;
        const lens = lenses.find((l) => l.id === wizardState.selectedTubeLens);
        return lens?.price || 0;
      }
      case 9: {
        let p = 0;
        if (wizardState.controlInputs.includes('ps4-joystick')) p += 40;
        if (wizardState.controlInputs.includes('can-jog-dial')) p += 80;
        return p;
      }
      default:
        return 0;
    }
  },

  computeNyquist: () => {
    const { wizardState, objectives, cameras, lenses } = get();
    if (!wizardState.primaryObjective || !wizardState.selectedCamera) return null;

    const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
    const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
    if (!obj || !cam) return null;

    const tubeLens = wizardState.selectedTubeLens
      ? lenses.find((l) => l.id === wizardState.selectedTubeLens)
      : null;

    const centralWavelength_um = 0.5; // 500nm
    const resolution_um = (0.61 * centralWavelength_um) / obj.na;
    const nyquistPixelSize_um = resolution_um / 2;

    // Effective magnification: if tube lens is chosen, use its focal length / objective focal length
    const tubeFocalLength = tubeLens?.focalLength_mm || 200; // default 200mm
    const effectiveMag = tubeFocalLength / obj.focalLength_mm;
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

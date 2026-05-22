// Types for the FRAME microscope wizard configurator

export interface ObjectiveOption {
  id: string;
  name: string;
  manufacturer: string;
  magnification: number;
  na: number;
  workingDistance_mm: number;
  focalLength_mm: number;
  immersion: string;
  threadType: string;
  parfocalDistance_mm: number;
  fieldNumber_mm: number;
  correctionType: string;
  /** Logical grouping shown in the wizard table (Special, High Rank Soptop, Low Rank, Phase Contrast). */
  category?: string;
  price: number;
  thumbnail?: string;
  optilandJson?: string;
  docsUrl?: string;
}

export interface LensOption {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  focalLength_mm: number;
  diameter_mm: number;
  coating: string;
  wavelengthRange_nm: string;
  mountType: string;
  price: number;
  thumbnail?: string;
  optilandJson?: string;
  docsUrl?: string;
  partNumber?: string;
}

export interface CameraOption {
  id: string;
  name: string;
  manufacturer: string;
  sensor: string;
  resolution: string;
  pixelSize_um: number;
  sensorSize_mm: string;
  fps_max: number;
  interface: string;
  bitDepth: number;
  quantumEfficiency: number;
  mountType: string;
  cooled: boolean;
  price: number;
  thumbnail?: string;
  docsUrl?: string;
  /** Free-form usage recommendation shown as a chip. */
  recommendation?: string;
}

export interface FluorescenceOption {
  id: string;
  name: string;
  dyeName: string;
  excitationPeak_nm: number;
  emissionPeak_nm: number;
  lightSourceType: string;
  lightSourceWavelength_nm: string;
  excitationFilterCenter_nm: number;
  excitationFilterBandwidth_nm: number;
  dichroicEdge_nm: number;
  emissionFilterCenter_nm: number;
  emissionFilterBandwidth_nm: number;
  color: string;
  commonApplications: string;
  price_filterSet: number;
}

// --- WP2: Objective changer ---
export type ObjectiveChangerChoice = 'single' | '2-position';

// --- WP4: Illumination ---
export type LightSourceChoice = 'single-led' | 'complex-setup';
export type CondenserChoice = 'abbe' | 'aspherical-25' | 'aspherical-8-ph';
export type BrightfieldMode = 'bf-only' | 'phase-contrast' | 'darkfield' | 'polarization';

// --- WP6: Fluorescence ---
export type FluoLightSource =
  | 'none'
  | 'laser-single'
  | 'laser-dual'
  | 'laser-quad'
  | 'led-single'
  | 'led-quad';

export type DichroicChoice = 'none' | 'single-cn' | 'dual-cn' | 'multi-ahf';

// --- WP7: Sample holder ---
export type SampleHolderChoice =
  | 'none'
  | 'microscope-slide'
  | 'mtp'
  | 'petri-dish'
  | 'custom-3d';

export interface FrameWizardState {
  // Step 1: Objective changer (WP2)
  objectiveChanger: ObjectiveChangerChoice;
  // Step 2: Objective lenses
  primaryObjective: string | null;
  secondaryObjective: string | null;
  // Step 3: Illumination (WP4)
  lightSource: LightSourceChoice;
  condenser: CondenserChoice;
  brightfieldModes: BrightfieldMode[];
  // Step 4: Fluorescence (WP6)
  hasFluorescence: boolean;
  fluoLightSource: FluoLightSource;
  dichroic: DichroicChoice;
  fluorescenceChannels: string[];
  // Step 5: Camera
  selectedCamera: string | null;
  // Step 6: Sample holder (WP7)
  sampleHolder: SampleHolderChoice;
  customSampleHolderNotes: string;
  // Step 7: Summary / Quote (WP8)
  fieldOfApplication: string;
  specialRequirements: string;
  customNotes: string;
}

export interface FrameWizardStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

export interface NyquistResult {
  nyquistPixelSize_um: number;
  effectivePixelSize_um: number;
  isSampled: boolean;
  samplingRatio: number;
  resolution_um: number;
}

export interface FrameComponentPlacement {
  moduleId: string;
  gridPos: [number, number, number];
  rotation: [number, number, number];
  params?: Record<string, unknown>;
}

export interface FrameConfiguration {
  components: FrameComponentPlacement[];
  totalPrice: number;
  metadata: {
    name: string;
    description: string;
    createdAt: string;
  };
}

/** WP9: preset entry as listed in presets/index.json. */
export interface PresetIndexEntry {
  id: string;
  name: string;
  description: string;
  image?: string;
  file: string;
}

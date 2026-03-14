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

export type LightSourceChoice = 'none' | 'single-led' | 'led-matrix' | 'led-ring';

export type AutofocusChoice = 'none' | 'laser-astigmatism' | 'image-contrast';

export type SampleHolderChoice = 'none' | '4-slide-insert' | 'wellplate-insert';

export interface FrameWizardState {
  // Step 1: Light source
  lightSource: LightSourceChoice;
  // Step 2: Hardware autofocus
  autofocus: AutofocusChoice;
  // Step 3: Objective lenses
  primaryObjective: string | null; // objective id
  secondaryObjective: string | null; // objective id (if revolver)
  // Step 4: Sample holder
  sampleHolder: SampleHolderChoice;
  // Step 5: Motorized objective revolver
  hasRevolver: boolean;
  // Step 6: Overview camera
  hasOverviewCamera: boolean;
  // Step 7: Fluorescence
  hasFluorescence: boolean;
  fluorescenceChannels: string[]; // fluorescence option ids
  // Step 8: Main camera
  selectedCamera: string | null; // camera id
  // Step 9: Tube lens
  selectedTubeLens: string | null; // lens id
  // Step 10: Control inputs
  controlInputs: string[]; // 'ps4-joystick' | 'can-jog-dial'
  // Step 11: Customization
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

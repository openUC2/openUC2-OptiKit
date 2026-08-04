/**
 * Kernel simulation state (EMB-G1): the live loop's settled results and its
 * user config. Deliberately separate from the schematic's 2D sim state and
 * the service round-trip store — views read segments/detector from here;
 * kernelSim.ts is the only writer.
 */

import { create } from 'zustand';
import { CoreServiceError } from '../api/coreClient';
import type { Scene3Finding } from '../api/coreClient';
import type { DetectorResult } from './detector';
import { parseDetectorResult } from './detector';
import { triggerKernelPass } from './kernelBridge';
import type { KernelPassResult } from './kernelLoop';
import type { UnmappedPlacement } from './pose';

export interface KernelConfig {
  /** Master switch: the loop ignores document edits while off. */
  enabled: boolean;
  /** Re-trace automatically on document edits (the live loop). */
  autoRun: boolean;
  /** Rays across each source's emitting aperture (spatial_samples, §9.5). */
  maxRays: number;
  /** Render the 3D ray overlay. */
  showRays: boolean;
}

/** First-detector readout of the latest settled trace (EMB-E). */
export interface KernelDetectorState {
  /** Parsed f64 result — the only source of displayed numbers (rule 5). */
  result: DetectorResult;
  /** Spot-diagram hit records, render-only f32 (`decodeHits` layout). */
  hits: Float32Array;
}

/** Kernel-loop state (EMB-D): the latest settled f64 trace and diagnostics. */
export interface KernelSimState {
  /** World-frame segment buffer, 11 floats/segment — render-only (rule 5). */
  segments: Float32Array | null;
  /** Detector readout of the settled trace; null when no detector/hits. */
  detector: KernelDetectorState | null;
  /** Detector3 count the scene declares — distinguishes "no camera" (panel
   * hidden) from "camera present, zero hits" (panel says so). */
  detectorCount: number;
  /** Request id of the rendered trace (monotonic; stale responses dropped). */
  requestId: number;
  findings: Scene3Finding[];
  warnings: string[];
  mapped: string[];
  unmapped: UnmappedPlacement[];
  manifest: unknown;
  materializeMs: number;
  traceMs: number;
  /** Set when the service rejected or was unreachable; the last trace stays. */
  serviceError: string | null;
  /** A newer request is in flight; views may restyle the trace as stale. */
  busy: boolean;
}

const defaultKernelState: KernelSimState = {
  segments: null,
  detector: null,
  detectorCount: 0,
  requestId: 0,
  findings: [],
  warnings: [],
  mapped: [],
  unmapped: [],
  manifest: null,
  materializeMs: 0,
  traceMs: 0,
  serviceError: null,
  busy: false,
};

interface KernelStore {
  config: KernelConfig;
  /** The detector/readout panel is showing (G4): readout serialization is
   * only paid while true; kernelSim flushes a readout-less settled trace the
   * moment this flips true. */
  panelOpen: boolean;
  kernel: KernelSimState;
  setConfig: (config: Partial<KernelConfig>) => void;
  setPanelOpen: (open: boolean) => void;
  setKernelResult: (result: KernelPassResult) => void;
  /** Tier-2 f32 preview frame (EMB-F): replaces the picture only. Detector
   * readouts, findings, and every displayed number stay from the last settled
   * f64 result (rule 5). */
  setKernelPreview: (segments: Float32Array) => void;
  setKernelError: (error: unknown, requestId: number) => void;
  setKernelBusy: (busy: boolean) => void;
}

export const useKernelStore = create<KernelStore>((set, get) => ({
  // Enabled out of the box: the first-success scenario (spec 18.1) has rays
  // appear on placement with no further action. The worker and the first
  // service request still load lazily, on the first pass with parts placed.
  config: { enabled: true, autoRun: true, maxRays: 64, showRays: true },
  panelOpen: false,
  kernel: defaultKernelState,

  setConfig: config => {
    set(state => ({ config: { ...state.config, ...config } }));
    const next = get().config;
    if (next.enabled && next.autoRun) triggerKernelPass();
  },

  setPanelOpen: open => {
    set(state => (state.panelOpen === open ? state : { panelOpen: open }));
  },

  setKernelResult: result => {
    const parsed = parseDetectorResult(result.detector?.resultJson);
    set(state => ({
      kernel: {
        ...state.kernel,
        segments: result.segments,
        detector:
          parsed && result.detector ? { result: parsed, hits: result.detector.hits } : null,
        detectorCount: result.detectorCount,
        requestId: result.requestId,
        findings: result.findings,
        warnings: result.warnings,
        mapped: result.mapped,
        unmapped: result.unmapped,
        manifest: result.manifest,
        materializeMs: result.materializeMs,
        traceMs: result.traceMs,
        serviceError: null,
      },
    }));
  },

  setKernelPreview: segments => {
    set(state => ({ kernel: { ...state.kernel, segments } }));
  },

  setKernelError: (error, requestId) => {
    // A 422 is a design diagnostic with a stable code; anything else is the
    // service being unreachable. Either way the last trace stays on screen
    // (decision 6.14: diagnostics arrive beside the picture, not instead).
    const message =
      error instanceof CoreServiceError
        ? error.message
        : `simulation service unreachable: ${error instanceof Error ? error.message : String(error)}`;
    set(state => ({
      kernel: { ...state.kernel, requestId, serviceError: message },
    }));
  },

  setKernelBusy: busy => {
    set(state => (state.kernel.busy === busy ? state : { kernel: { ...state.kernel, busy } }));
  },
}));

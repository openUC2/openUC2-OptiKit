/**
 * Message protocol between the main thread and the oc-wasm kernel worker.
 *
 * The worker holds one kernel `Canvas` with one loaded Scene3. Requests carry a
 * client-assigned id; every request gets exactly one response with the same id.
 * The unsolicited `ready` response (id 0) is posted once, after wasm init.
 */

import type { DetectorReadoutWire } from './detector';

/** One moved component: the manifest object ids of everything it owns, and
 * the rigid delta `[px, py, pz, qx, qy, qz, qw]` to compose onto them. */
export interface TransformBatch {
  ids: number[];
  delta: number[];
}

export type KernelRequest =
  | { id: number; type: 'loadScene'; sceneJson: string }
  /** Settled f64 trace. `readout: false` skips the detector readout
   * (`firstDetectorResultJSON` + hits serialization — about two thirds of the
   * settled-trace cost, measured in src/bench): the loop sends it only while
   * the detector panel is open. Omitted = true. */
  | { id: number; type: 'traceWorld'; readout?: boolean }
  | { id: number; type: 'traceWorldFast' }
  /** Tier-2 pose fast path (EMB-F): apply the batches to the loaded scene and
   * f32-retrace in one round trip. An unknown id or malformed delta answers
   * `error` — the caller's tier-1 reload is the recovery. */
  | { id: number; type: 'transformTrace'; batches: TransformBatch[] };

export type KernelResponse =
  | { id: 0; type: 'ready' }
  | { id: number; type: 'sceneLoaded'; report: string }
  | {
      id: number;
      type: 'segments';
      buffer: Float32Array;
      /** First-detector readout (EMB-E). Present ONLY on settled f64
       * `traceWorld` responses — never on the f32 fast path (rule 5: displayed
       * numbers come from f64 traces only). `null` when the scene has no
       * detector or no hits. */
      detector?: DetectorReadoutWire | null;
    }
  | { id: number; type: 'error'; message: string };

/** Floats per segment in a `segments` buffer (integration spec 18.7):
 * `[ax, ay, az, bx, by, bz, r, g, b, flux, flags]`, world mm. Flags bit1 =
 * TIR; bit2 (ghost) is never set here — the openUC2 kernel traces with ghosts
 * off (pinned in KernelCore's constructor, 2026-08-04). */
export const SEGMENT_FLOATS = 11;

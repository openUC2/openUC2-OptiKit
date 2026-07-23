/**
 * Message protocol between the main thread and the oc-wasm kernel worker.
 *
 * The worker holds one kernel `Canvas` with one loaded Scene3. Requests carry a
 * client-assigned id; every request gets exactly one response with the same id.
 * The unsolicited `ready` response (id 0) is posted once, after wasm init.
 */

export type KernelRequest =
  | { id: number; type: 'loadScene'; sceneJson: string }
  | { id: number; type: 'traceWorld' }
  | { id: number; type: 'traceWorldFast' };

export type KernelResponse =
  | { id: 0; type: 'ready' }
  | { id: number; type: 'sceneLoaded'; report: string }
  | { id: number; type: 'segments'; buffer: Float32Array }
  | { id: number; type: 'error'; message: string };

/** Floats per segment in a `segments` buffer (integration spec 18.7):
 * `[ax, ay, az, bx, by, bz, r, g, b, flux, flags]`, world mm. */
export const SEGMENT_FLOATS = 11;

/**
 * The kernel worker's request handler, separated from the worker shell so the
 * scene-load/trace round-trip is unit-testable in Node (where `Worker` and the
 * browser wasm loader do not exist). The shell owns wasm init and postMessage;
 * this owns everything after init.
 *
 * The `Canvas` here is the oc-wasm kernel handle. Its Float32Array segment
 * buffers are render-only pictures; displayed numbers must come from the f64
 * readout APIs (integration spec 18.7), which later PRs expose as they wire the
 * readout panel.
 */

import type { Canvas } from 'oc-wasm';
import type { KernelRequest, KernelResponse } from './messages';

export class KernelCore {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  handle(req: KernelRequest): KernelResponse {
    try {
      switch (req.type) {
        case 'loadScene': {
          const report = this.canvas.loadScene3JSON(req.sceneJson);
          return { id: req.id, type: 'sceneLoaded', report };
        }
        case 'traceWorld': {
          // Settled f64 trace: the picture plus the first-detector readout
          // (EMB-E). The f64 result JSON is the only displayed-number source.
          const buffer = this.canvas.traceWorld3D();
          const resultJson = this.canvas.firstDetectorResultJSON();
          const detector =
            resultJson && resultJson !== 'null'
              ? { resultJson, hits: this.canvas.firstDetectorHitsF32() }
              : null;
          return { id: req.id, type: 'segments', buffer, detector };
        }
        case 'traceWorldFast':
          // f32 preview: the picture only, no readout (rule 5).
          return { id: req.id, type: 'segments', buffer: this.canvas.traceWorld3DFast() };
      }
    } catch (e) {
      return { id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }
}

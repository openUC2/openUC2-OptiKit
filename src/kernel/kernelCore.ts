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
    // Ghost tracing is removed from the openUC2 embedding (product decision
    // 2026-08-04): stray-light analysis is not this editor's job, and ghost
    // branches only multiply preview work. The vendored Canvas already
    // defaults ghosts off; this call pins the contract against a future
    // default change. The segment-flags ghost bit therefore never sets.
    this.canvas.setGhosts(false);
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
          // The readout serialization is ~2/3 of the settled cost (src/bench),
          // so the loop requests it only while the detector panel is open.
          const buffer = this.canvas.traceWorld3D();
          if (req.readout === false) return { id: req.id, type: 'segments', buffer };
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
        case 'transformTrace': {
          // Tier-2 (EMB-F): batch pose edits on the loaded scene, then one f32
          // retrace. transformObjects3 is atomic per batch; a refusal means the
          // scene and the UI disagree (stale manifest) — report it so the
          // caller falls back to a tier-1 reload.
          for (const batch of req.batches) {
            const ok = this.canvas.transformObjects3(
              Float64Array.from(batch.ids),
              Float64Array.from(batch.delta),
            );
            if (!ok) {
              return { id: req.id, type: 'error', message: 'transformObjects3 refused a batch' };
            }
          }
          return { id: req.id, type: 'segments', buffer: this.canvas.traceWorld3DFast() };
        }
      }
    } catch (e) {
      return { id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }
}

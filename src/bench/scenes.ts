/**
 * Shared scene definitions for the tracer benchmark (legacy JS engine vs
 * oc-wasm kernel). One placement list per scene drives BOTH engines:
 *  - legacy: placements -> sceneBuilder.buildScene -> runSimulation
 *  - kernel: placements -> designBuilder.buildDesign -> /v1/scene3 -> Canvas
 *
 * `legacyAliases` swaps moduleIds that have no MODULE_SIMULATION_MODELS entry
 * for their closest legacy-modeled sibling, so the legacy engine simulates the
 * full chain with its native models instead of silently skipping elements.
 */

import type { PlacedModule } from '../types';
import { placed } from '../document/__tests__/helpers';

export interface BenchScene {
  name: string;
  placements: PlacedModule[];
  /** moduleId -> legacy-modeled moduleId, applied only in the legacy lane. */
  legacyAliases?: Record<string, string>;
}

const p = (
  moduleId: string,
  id: string,
  x: number,
  y: number,
  extra: Partial<PlacedModule> = {},
): PlacedModule => placed(moduleId, id, x, y, { params: {}, ...extra });

/** First-success row: laser -> lens -> camera along grid east. Camera at
 * rotation 270 accepts the eastbound beam (post art-vs-physics convention). */
export function row3(): BenchScene {
  return {
    name: 'row3',
    placements: [
      p('laser-488nm', 'a1', 0, 0),
      p('lens-pos-1x1', 'b2', 1, 0),
      p('camera-usb-daheng', 'c3', 2, 0, { rotation: 270 }),
    ],
  };
}

/** Mirror fold: east beam folds south onto the camera (the live-verified
 * emb-mirror-mount scenario). */
export function fold(): BenchScene {
  return {
    name: 'fold',
    placements: [
      p('laser-488nm', 'a1', 0, 0),
      p('mirror-1x1', 'm1', 2, 0),
      p('camera-usb-daheng', 'c1', 2, 2),
    ],
  };
}

/** Full epi-fluorescence chain (the 2026-07-30 live acceptance layout):
 * laser -> bandpass -> dichroic -> objective -> sample, emission back through
 * the dichroic -> tube lens -> camera. */
export function epi(): BenchScene {
  return {
    name: 'epi',
    placements: [
      p('laser-488nm', 'l1', 0, 2),
      p('filter-bandpass', 'f1', 1, 2),
      p('filter-dichroic', 'd1', 2, 2),
      p('objective-20x-Nikon-0.75NA-1x1', 'o1', 2, 3, { rotation: 270 }),
      p('sampleholder-1x1', 's1', 2, 4, { rotation: 270 }),
      p('lens-pos-1x1', 't1', 2, 1, { rotation: 270 }),
      p('camera-usb-daheng', 'c1', 2, 0, { rotation: 270 }),
    ],
    legacyAliases: {
      'objective-20x-Nikon-0.75NA-1x1': 'objective-20x-1x1',
      'sampleholder-1x1': 'fluorescent-sample-1x1',
    },
  };
}

/** Component-count scaling: laser -> N lenses -> camera in a row. The camera
 * deliberately faces away (rotation 0): every AC254 record authors `is_stop`,
 * so a CONNECTED N>1 lens chain 422s with E_STOP_MULTIPLE. Unconnected, chain
 * inference fails diagnostically (E_NO_TARGET, decision 6.14) and the full
 * physical scene still materializes - which is the workload both interactive
 * engines trace. */
export function scaleRow(nLenses: number): BenchScene {
  const placements = [p('laser-488nm', 'a0', 0, 0)];
  for (let i = 0; i < nLenses; i++) {
    placements.push(p('lens-pos-1x1', `b${String(i).padStart(2, '0')}`, i + 1, 0));
  }
  placements.push(p('camera-usb-daheng', 'c9', nLenses + 1, 0));
  return { name: `scale${String(nLenses).padStart(2, '0')}`, placements };
}

/** Launched-ray sweep applied to every source in both engines. */
export const RAY_SWEEP = [16, 64, 256, 1024, 4096];

/** Lens counts for the component-scaling sweep (at SCALE_RAYS rays). */
export const SCALE_NS = [1, 2, 4, 8, 16];
export const SCALE_RAYS = 256;

export function allScenes(): BenchScene[] {
  return [row3(), fold(), epi(), ...SCALE_NS.map(scaleRow)];
}

/** Scenes that get the full ray sweep (scaleRow scenes run at SCALE_RAYS). */
export const SWEEP_SCENES = ['row3', 'fold', 'epi'];

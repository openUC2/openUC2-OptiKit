/**
 * Tracer shootout: legacy JS 2D engine (SimulationEngine.runSimulation, the
 * engine dsn-model keeps as its interactive preview) vs the oc-wasm Rust
 * kernel (full 3D non-sequential f64/f32, PR #30).
 *
 * Lanes per scene x launched-ray count:
 *   legacy      runSimulation(elements, config)      in-process JS
 *   kernel-f64  traceWorld3D + detector readout       settled trace (prod cost)
 *   kernel-f32  traceWorld3DFast                      preview trace
 *   kernel-drag transformObjects3 + f32 retrace       tier-2 pose drag hot path
 *   kernel-load loadScene3JSON                        structural reload (client)
 *
 * Prereqs: emit-designs.test.ts then gen_scenes.py (Scene3 fixtures).
 * Run:  BENCH=1 npx vitest run src/bench/tracer-bench.test.ts
 * (gated behind the BENCH env var: ~1 min of tracing has no place in CI).
 * Node's V8 is the same JS/WASM engine as Chrome's, so relative numbers carry.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import init, { Canvas } from 'oc-wasm';

import type { ModuleDefinition, PlacedModule } from '../types';
import { runSimulation } from '../simulation/SimulationEngine';
import { buildScene, getDefaultSimulationConfig } from '../utils/sceneBuilder';
import { KernelCore } from '../kernel/kernelCore';
import { SEGMENT_FLOATS } from '../kernel/messages';
import { allScenes, RAY_SWEEP, SCALE_RAYS, SWEEP_SCENES } from './scenes';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = join(HERE, 'fixtures', 'scenes');
const RESULTS_DIR = join(HERE, 'results');
const WASM = join(HERE, '..', '..', 'node_modules', 'oc-wasm', 'oc_wasm_bg.wasm');

/** Every moduleId the legacy lane places (post-alias). buildScene reads only
 * footprint (+ placementOffset); everything optical comes from the hard-coded
 * MODULE_SIMULATION_MODELS table. Camera is the 1x2 tile. */
const STUB_DEFS: ModuleDefinition[] = [
  ['laser-488nm', 1, 1],
  ['lens-pos-1x1', 1, 1],
  ['mirror-1x1', 1, 1],
  ['filter-bandpass', 1, 1],
  ['filter-dichroic', 1, 1],
  ['objective-20x-1x1', 1, 1],
  ['fluorescent-sample-1x1', 1, 1],
  ['camera-usb-daheng', 1, 2],
].map(([id, w, h]) => ({
  id: id as string,
  name: String(id),
  group: 'bench',
  color: '#000000',
  footprint: { width: w as number, height: h as number },
}) as unknown as ModuleDefinition);

interface Row {
  scene: string;
  lane: string;
  rays: number;
  medianMs: number;
  p90Ms: number;
  meanMs: number;
  iters: number;
  segments?: number;
  note?: string;
}

/** Adaptive timer: warm up, then run until ~350 ms elapsed or 400 iters,
 * minimum 3 timed calls; slow calls (>2.5 s) stop after 2. */
function bench(fn: () => void): { medianMs: number; p90Ms: number; meanMs: number; iters: number } {
  for (let i = 0; i < 3; i++) fn();
  const durations: number[] = [];
  const t0 = performance.now();
  while (durations.length < 400) {
    const s = performance.now();
    fn();
    durations.push(performance.now() - s);
    const elapsed = performance.now() - t0;
    if (durations.length >= 2 && durations[0] > 2500) break;
    if (elapsed > 350 && durations.length >= 3) break;
  }
  durations.sort((a, b) => a - b);
  const q = (p: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
  return {
    medianMs: round(q(0.5)),
    p90Ms: round(q(0.9)),
    meanMs: round(durations.reduce((a, b) => a + b, 0) / durations.length),
    iters: durations.length,
  };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

describe.runIf(Boolean(process.env.BENCH))('tracer shootout', () => {
  it('legacy JS vs oc-wasm kernel', async () => {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const rows: Row[] = [];

    const initStart = performance.now();
    await init({ module_or_path: readFileSync(WASM) });
    const wasmInitMs = round(performance.now() - initStart);
    const core = new KernelCore(new Canvas());
    // Second handle for the f64-raw lane: trace WITHOUT the detector readout,
    // to attribute how much of the settled lane is readout serialization.
    const rawCanvas = new Canvas();

    for (const scene of allScenes()) {
      const sweep = SWEEP_SCENES.includes(scene.name) ? RAY_SWEEP : [SCALE_RAYS];
      const sceneJsonText = readFileSync(join(SCENES_DIR, `${scene.name}.json`), 'utf8');

      // --- legacy: placements (aliased) -> elements once per ray count ----
      const aliased: PlacedModule[] = scene.placements.map((pl) => ({
        ...pl,
        moduleId: scene.legacyAliases?.[pl.moduleId] ?? pl.moduleId,
      }));
      const config = getDefaultSimulationConfig();

      let legacySkip = false;
      for (const rays of sweep) {
        if (legacySkip) {
          rows.push({ scene: scene.name, lane: 'legacy', rays, medianMs: NaN, p90Ms: NaN, meanMs: NaN, iters: 0, note: 'skipped: previous count > 5 s' });
          continue;
        }
        const built = buildScene(aliased, STUB_DEFS, config);
        expect(built.warnings, `${scene.name}: legacy buildScene warnings`).toEqual([]);
        for (const el of built.elements) {
          if (el.type === 'laser') el.params = { ...el.params, rayCount: rays };
        }
        const result = runSimulation(built.elements, config);
        expect(result.success, `${scene.name}: legacy run failed: ${result.errors.join('; ')}`).toBe(true);
        const stats = bench(() => runSimulation(built.elements, config));
        rows.push({ scene: scene.name, lane: 'legacy', rays, ...stats, segments: result.segmentCount });
        log(rows.at(-1)!);
        if (stats.medianMs > 5000) legacySkip = true;
      }

      // Legacy epi kills the 488 beam at the emission filter (1 segment/ray),
      // so also run it WITHOUT the bandpass: legacy's honest full-chain load.
      if (scene.name === 'epi') {
        const noBp = aliased.filter((pl) => pl.id !== 'f1');
        for (const rays of sweep) {
          const built = buildScene(noBp, STUB_DEFS, config);
          for (const el of built.elements) {
            if (el.type === 'laser') el.params = { ...el.params, rayCount: rays };
          }
          const result = runSimulation(built.elements, config);
          expect(result.success).toBe(true);
          const stats = bench(() => runSimulation(built.elements, config));
          rows.push({ scene: scene.name, lane: 'legacy-nobp', rays, ...stats, segments: result.segmentCount });
          log(rows.at(-1)!);
        }
      }

      // --- kernel: patch spatial_samples, then time each lane -------------
      for (const rays of sweep) {
        const patched = JSON.parse(sceneJsonText) as {
          sources: { samples: { spatial_samples: number } }[];
          bodies: { common: { id: number } }[];
          surfaces: { common: { id: number } }[];
        };
        for (const s of patched.sources) s.samples.spatial_samples = rays;
        const json = JSON.stringify(patched);

        const loadRes = core.handle({ id: 1, type: 'loadScene', sceneJson: json });
        expect(loadRes.type, `${scene.name}: kernel load failed`).toBe('sceneLoaded');
        const loadStats = bench(() => core.handle({ id: 2, type: 'loadScene', sceneJson: json }));
        rows.push({ scene: scene.name, lane: 'kernel-load', rays, ...loadStats });

        const f64Res = core.handle({ id: 3, type: 'traceWorld' });
        if (f64Res.type !== 'segments') throw new Error(`${scene.name}: f64 trace failed`);
        const f64Stats = bench(() => core.handle({ id: 4, type: 'traceWorld' }));
        rows.push({ scene: scene.name, lane: 'kernel-f64', rays, ...f64Stats, segments: f64Res.buffer.length / SEGMENT_FLOATS });
        log(rows.at(-1)!);

        rawCanvas.loadScene3JSON(json);
        const rawBuf = rawCanvas.traceWorld3D();
        const rawStats = bench(() => rawCanvas.traceWorld3D());
        rows.push({ scene: scene.name, lane: 'kernel-f64-raw', rays, ...rawStats, segments: rawBuf.length / SEGMENT_FLOATS });
        log(rows.at(-1)!);

        const f32Res = core.handle({ id: 5, type: 'traceWorldFast' });
        if (f32Res.type !== 'segments') throw new Error(`${scene.name}: f32 trace failed`);
        const f32Stats = bench(() => core.handle({ id: 6, type: 'traceWorldFast' }));
        rows.push({ scene: scene.name, lane: 'kernel-f32', rays, ...f32Stats, segments: f32Res.buffer.length / SEGMENT_FLOATS });
        log(rows.at(-1)!);

        // Drag hot path: wiggle the first body (fold scene: first surface)
        // +-0.1 mm along x, one f32 retrace per call.
        const dragId = patched.bodies[0]?.common.id ?? patched.surfaces[0]?.common.id;
        if (dragId !== undefined) {
          let sign = 1;
          const dragStats = bench(() => {
            sign = -sign;
            const res = core.handle({
              id: 7,
              type: 'transformTrace',
              batches: [{ ids: [dragId], delta: [0.1 * sign, 0, 0, 0, 0, 0, 1] }],
            });
            if (res.type !== 'segments') throw new Error('drag refused');
          });
          rows.push({ scene: scene.name, lane: 'kernel-drag', rays, ...dragStats });
          log(rows.at(-1)!);
        }
      }
    }

    const out = {
      node: process.version,
      wasmInitMs,
      rows,
    };
    writeFileSync(join(RESULTS_DIR, 'frontend.json'), JSON.stringify(out, null, 2), 'utf8');
    console.log(`wasm init: ${wasmInitMs} ms; wrote results/frontend.json (${rows.length} rows)`);
  }, 900_000);
});

function log(r: Row) {
  console.log(
    `${r.scene.padEnd(8)} ${r.lane.padEnd(12)} rays=${String(r.rays).padStart(4)} ` +
    `median=${String(r.medianMs).padStart(9)} ms  p90=${String(r.p90Ms).padStart(9)} ` +
    `iters=${String(r.iters).padStart(3)} segs=${r.segments ?? '-'}`,
  );
}

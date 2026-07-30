/**
 * EMB-B round-trip: the vendored oc-wasm kernel loads a materialized Scene3
 * fixture and traces it in world frame (integration spec, EMB-B exit criteria).
 *
 * The fixture is the KIT-05 achromat probe (collimated 488 nm disc, r = 1 mm,
 * 16 rays -> openuc2.lens.achromat_25mm_f50 at the origin -> detector at
 * +100 mm), materialized by optikit-core `canvas.materialize`. Regenerate with
 * `tests/cross_engine/kit05.probe_design` + `materialize` if the materializer's
 * output format changes. The kernel's physics is verified cross-engine in
 * optikit-core (KIT-05/06); this test guards the vendor plumbing: package
 * resolution, wasm init, Scene3 parse, and the traceWorld3D buffer contract.
 */

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import init, { Canvas } from 'oc-wasm';
import { decodeHits, parseDetectorResult } from '../detector';
import { KernelCore } from '../kernelCore';
import { SEGMENT_FLOATS } from '../messages';

const FIXTURE = new URL('./fixtures/achromat_probe.ocanvas.json', import.meta.url);
const WASM = new URL('../../../node_modules/oc-wasm/oc_wasm_bg.wasm', import.meta.url);

// 16 rays x 3 legs (source->front surface, through the glass, back->detector).
const EXPECTED_SEGMENTS = 48;

let core: KernelCore;

beforeAll(async () => {
  await init({ module_or_path: readFileSync(WASM) });
  core = new KernelCore(new Canvas());
});

describe('kernel round-trip (EMB-B)', () => {
  it('loads the materialized Scene3 fixture', () => {
    const res = core.handle({ id: 1, type: 'loadScene', sceneJson: readFileSync(FIXTURE, 'utf8') });
    expect(res.type).toBe('sceneLoaded');
    if (res.type !== 'sceneLoaded') return;
    const report = JSON.parse(res.report);
    expect(report.dimension).toBe(3);
    expect(report.previewMode).toBe('full_3d');
    expect(report.migratedFromV1).toBe(false);
  });

  it('traces the expected world-frame segments (f64)', () => {
    const res = core.handle({ id: 2, type: 'traceWorld' });
    expect(res.type).toBe('segments');
    if (res.type !== 'segments') return;
    expect(res.buffer.length % SEGMENT_FLOATS).toBe(0);
    expect(res.buffer.length / SEGMENT_FLOATS).toBe(EXPECTED_SEGMENTS);
    // First leg launches from the source plane 100 mm upstream, aimed +x.
    const [ax, , , bx] = res.buffer;
    expect(ax).toBeCloseTo(-100, 6);
    expect(bx).toBeGreaterThan(ax);
  });

  it('fast f32 preview returns the same segment count', () => {
    const res = core.handle({ id: 3, type: 'traceWorldFast' });
    expect(res.type).toBe('segments');
    if (res.type !== 'segments') return;
    expect(res.buffer.length / SEGMENT_FLOATS).toBe(EXPECTED_SEGMENTS);
  });

  it('reports errors without throwing', () => {
    const res = core.handle({ id: 4, type: 'loadScene', sceneJson: 'not json' });
    expect(res.type).toBe('error');
  });

  // --- EMB-E: the detector readout rides the settled f64 trace ---------------

  it('settled trace carries the f64 detector readout', () => {
    const res = core.handle({ id: 5, type: 'traceWorld' });
    expect(res.type).toBe('segments');
    if (res.type !== 'segments') return;
    const detector = res.detector;
    expect(detector).toBeTruthy();
    const result = parseDetectorResult(detector!.resultJson)!;
    // All 16 probe rays land on the detector.
    expect(result.hits).toBe(16);
    expect(result.totalSignal).toBeGreaterThan(0);
    expect(result.bins[0] * result.bins[1]).toBe(result.incident.length);
    // The probe is axially symmetric, so the f64 centroid sits on axis — the
    // EMB-E embedding criterion (same kernel, same scene, honest numbers).
    expect(Math.abs(result.centroid[0])).toBeLessThan(1e-9);
    expect(Math.abs(result.centroid[1])).toBeLessThan(1e-9);
    // Hit records: [halfW, halfH, n, 6 floats per record].
    const hits = decodeHits(detector!.hits)!;
    expect(hits.count).toBe(16);
    expect(detector!.hits.length).toBe(3 + 16 * 6);
    expect(hits.halfW).toBeGreaterThan(0);
    // Binned flux sums to the f64 total signal (both from the same readout).
    const binned = result.incident.reduce((a, b) => a + b, 0);
    expect(binned).toBeCloseTo(result.totalSignal, 9);
  });

  it('fast f32 preview never carries a readout (rule 5)', () => {
    const res = core.handle({ id: 6, type: 'traceWorldFast' });
    expect(res.type).toBe('segments');
    if (res.type !== 'segments') return;
    expect(res.detector).toBeUndefined();
  });
});

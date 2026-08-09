/**
 * EMB-E detector decoding: the f64 result parse, the f32 hit-record layout,
 * and the bin-grid orientation contract (verified against the kernel with an
 * off-axis probe — the f64 centroid, the hit records, and the hot cells must
 * all tell the same story; these tests pin that convention).
 */

import { describe, expect, it } from 'vitest';

import {
  binCenter,
  decodeHits,
  detectorToCanvas,
  fluxRampCss,
  HIT_HEADER_FLOATS,
  HIT_RECORD_FLOATS,
  parseDetectorResult,
  readoutLine,
} from '../detector';

const RESULT_JSON = JSON.stringify({
  hits: 16,
  totalIncident: 1.0,
  totalSignal: 0.916,
  cellArea: 0.0244140625,
  centroid: [0.25, -1.5],
  meanOpl: 202.635,
  bins: [64, 64],
  incident: new Array(64 * 64).fill(0),
});

describe('parseDetectorResult', () => {
  it('parses the kernel result JSON', () => {
    const r = parseDetectorResult(RESULT_JSON)!;
    expect(r.hits).toBe(16);
    expect(r.centroid).toEqual([0.25, -1.5]);
    expect(r.bins).toEqual([64, 64]);
    expect(r.incident).toHaveLength(4096);
  });

  it('returns null for null/absent/garbage payloads', () => {
    expect(parseDetectorResult('null')).toBeNull();
    expect(parseDetectorResult(null)).toBeNull();
    expect(parseDetectorResult(undefined)).toBeNull();
    expect(parseDetectorResult('')).toBeNull();
    expect(parseDetectorResult('not json')).toBeNull();
    expect(parseDetectorResult('{"unrelated":true}')).toBeNull();
  });
});

describe('decodeHits', () => {
  it('decodes the [halfW, halfH, n, records...] layout', () => {
    const buffer = new Float32Array([
      5, 5, 2,
      1.5, -4.1, 0, 0.4, 0.6, 0.057,
      -1.5, -4.1, 0, 0.4, 0.6, 0.057,
    ]);
    expect(buffer).toHaveLength(HIT_HEADER_FLOATS + 2 * HIT_RECORD_FLOATS);
    const hits = decodeHits(buffer)!;
    expect(hits.halfW).toBe(5);
    expect(hits.count).toBe(2);
    const first = hits.at(0);
    expect(first.u).toBeCloseTo(1.5, 6);
    expect(first.v).toBeCloseTo(-4.1, 6);
    expect(first.flux).toBeCloseTo(0.057, 6);
  });

  it('clamps a lying header count to the actual record capacity', () => {
    const buffer = new Float32Array([5, 5, 99, 1, 2, 0, 0, 0, 0.5]);
    expect(decodeHits(buffer)!.count).toBe(1);
  });

  it('rejects empty buffers', () => {
    expect(decodeHits(null)).toBeNull();
    expect(decodeHits(new Float32Array(0))).toBeNull();
  });
});

describe('bin-grid orientation (the pinned kernel convention)', () => {
  const grid = { bins: [64, 64] as [number, number] };

  it('cell (0, 0) is the (-u, -v) corner; the last cell is (+u, +v)', () => {
    const [u0, v0] = binCenter(grid, 5, 5, 0, 0);
    expect(u0).toBeCloseTo(-5 + 5 / 64, 9);
    expect(v0).toBeCloseTo(-5 + 5 / 64, 9);
    const [u1, v1] = binCenter(grid, 5, 5, 63, 63);
    expect(u1).toBeCloseTo(5 - 5 / 64, 9);
    expect(v1).toBeCloseTo(5 - 5 / 64, 9);
  });

  it('matches the empirical kernel probe: index 361 = row 5, col 41 → (+1.48, -4.14)', () => {
    // The off-axis achromat probe put a hit at (u=1.487, v=-4.122); its hot
    // cell was flat index 361 = iv·64 + iu with iv=5, iu=41.
    const [u, v] = binCenter(grid, 5, 5, 41, 5);
    expect(u).toBeCloseTo(1.484, 3);
    expect(v).toBeCloseTo(-4.141, 3);
  });
});

describe('detectorToCanvas', () => {
  it('maps +u right and +v up (canvas y inverted)', () => {
    expect(detectorToCanvas(0, 0, 5, 5, 100)).toEqual([50, 50]);
    expect(detectorToCanvas(5, 0, 5, 5, 100)[0]).toBe(100);
    expect(detectorToCanvas(0, 5, 5, 5, 100)[1]).toBe(0);
    expect(detectorToCanvas(0, -5, 5, 5, 100)[1]).toBe(100);
  });
});

describe('display helpers', () => {
  it('flux ramp is a single hue, dark at 0, light at 1, clamped', () => {
    expect(fluxRampCss(0)).toBe('rgb(13,20,32)');
    expect(fluxRampCss(1)).toBe('rgb(154,222,244)');
    expect(fluxRampCss(-1)).toBe(fluxRampCss(0));
    expect(fluxRampCss(2)).toBe(fluxRampCss(1));
  });

  it('readout line quotes only f64 result values', () => {
    const line = readoutLine(parseDetectorResult(RESULT_JSON)!);
    expect(line).toBe('16 hits · flux 0.916 · centroid (0.250, -1.500) mm · mean OPL 202.63 mm');
  });
});

/**
 * Detector readout decoding (EMB-E, integration spec §18 + rule 5).
 *
 * Two kernel products feed the panel:
 *
 * - `firstDetectorResultJSON()` — the f64 reference readout. Rule 5: this is
 *   the ONLY source of a displayed number (hits, flux, centroid, mean OPL,
 *   bin fluxes). Parsed here into {@link DetectorResult}.
 * - `firstDetectorHitsF32()` — per-hit spot-diagram records, flat f32 layout
 *   `[halfW, halfH, n, (u, v, r, g, b, flux) × n]`. A render-only picture:
 *   records are capped at max_records (a dense beam shows a sample), colors
 *   are linear-light wavelength colors matching the ray renderer. Never a
 *   number source — which is also why the spot diagram has no per-hit
 *   tooltip: a hover number would come from f32 samples.
 *
 * Bin-grid orientation (verified against the kernel with an off-axis probe:
 * the f64 centroid, the hit records, and the hot cells agree):
 *   index = iv * nu + iu,
 *   u = (iu + 0.5) / nu * 2*halfW − halfW   (u grows with the column),
 *   v = (iv + 0.5) / nv * 2*halfH − halfH   (v grows with the row).
 */

/** Wire form crossing the worker boundary (buffer transferred, not copied). */
export interface DetectorReadoutWire {
  /** `firstDetectorResultJSON()` verbatim — parsed on the main thread. */
  resultJson: string;
  /** `firstDetectorHitsF32()` verbatim. */
  hits: Float32Array;
}

/** The parsed f64 reference readout — the honest numbers. */
export interface DetectorResult {
  hits: number;
  totalIncident: number;
  totalSignal: number;
  /** Area of one bin cell, mm². */
  cellArea: number;
  /** Flux-weighted centroid [u, v] in detector-local mm. */
  centroid: [number, number];
  meanOpl: number;
  /** Bin grid dimensions [nu, nv]. */
  bins: [number, number];
  /** Per-cell incident flux, row-major (see module docs for orientation). */
  incident: number[];
}

export function parseDetectorResult(json: string | null | undefined): DetectorResult | null {
  if (!json) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (typeof d.hits !== 'number' || !Array.isArray(d.centroid) || !Array.isArray(d.bins)) {
    return null;
  }
  return d as unknown as DetectorResult;
}

export const HIT_HEADER_FLOATS = 3;
export const HIT_RECORD_FLOATS = 6;

export interface SpotHit {
  /** Detector-local mm. */
  u: number;
  v: number;
  /** Linear-light wavelength color (ray-renderer convention). */
  r: number;
  g: number;
  b: number;
  flux: number;
}

export interface SpotHits {
  /** Detector half-extents, mm. */
  halfW: number;
  halfH: number;
  count: number;
  at(index: number): SpotHit;
}

export function decodeHits(buffer: Float32Array | null | undefined): SpotHits | null {
  if (!buffer || buffer.length < HIT_HEADER_FLOATS) return null;
  const [halfW, halfH, n] = buffer;
  const count = Math.min(
    Math.max(0, Math.floor(n)),
    Math.floor((buffer.length - HIT_HEADER_FLOATS) / HIT_RECORD_FLOATS),
  );
  return {
    halfW,
    halfH,
    count,
    at(index: number): SpotHit {
      const o = HIT_HEADER_FLOATS + index * HIT_RECORD_FLOATS;
      return {
        u: buffer[o],
        v: buffer[o + 1],
        r: buffer[o + 2],
        g: buffer[o + 3],
        b: buffer[o + 4],
        flux: buffer[o + 5],
      };
    },
  };
}

/** Center (u, v) in mm of bin cell (iu, iv) on a result's grid. */
export function binCenter(
  result: Pick<DetectorResult, 'bins'>,
  halfW: number,
  halfH: number,
  iu: number,
  iv: number,
): [number, number] {
  const [nu, nv] = result.bins;
  return [
    ((iu + 0.5) / nu) * 2 * halfW - halfW,
    ((iv + 0.5) / nv) * 2 * halfH - halfH,
  ];
}

/** Map detector-local (u, v) to canvas pixels: +u right, +v UP (canvas y is
 * inverted), the full ±half extent filling `sizePx`. */
export function detectorToCanvas(
  u: number,
  v: number,
  halfW: number,
  halfH: number,
  sizePx: number,
): [number, number] {
  return [
    ((u + halfW) / (2 * halfW)) * sizePx,
    (1 - (v + halfH) / (2 * halfH)) * sizePx,
  ];
}

/** Sequential single-hue ramp for the flux heatmap (magnitude — one hue,
 * dark→light on the dark plot surface; never a rainbow). `t` in [0, 1] is the
 * display-normalized flux; sqrt-compressed upstream so dim cells stay visible.
 * Display-only: the numbers live in the f64 readout (rule 5). */
export function fluxRampCss(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  // Dark plot surface (13, 20, 32) → light cyan (154, 222, 244), one hue.
  const r = Math.round(13 + k * (154 - 13));
  const g = Math.round(20 + k * (222 - 20));
  const b = Math.round(32 + k * (244 - 32));
  return `rgb(${r},${g},${b})`;
}

/** The one-line readout under the plots. All values from the f64 result.
 * Flux is the kernel's conserved quantity in the source's declared unit —
 * the curated records author `flux: 1.0`, so it reads as source-relative. */
export function readoutLine(result: DetectorResult): string {
  const flux = result.totalSignal;
  const fluxText = flux === 0 ? '0' : flux.toPrecision(3);
  // `+ 0` folds −0 into 0 so an on-axis centroid never reads "-0.000".
  const mm = (x: number) => (Math.round(x * 1000) / 1000 + 0).toFixed(3);
  const [cu, cv] = result.centroid;
  return (
    `${result.hits} hits · flux ${fluxText} · ` +
    `centroid (${mm(cu)}, ${mm(cv)}) mm · ` +
    `mean OPL ${result.meanOpl.toFixed(2)} mm`
  );
}

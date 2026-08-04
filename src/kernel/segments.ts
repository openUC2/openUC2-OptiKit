/**
 * Decoding helpers for the kernel's world-frame segment buffer:
 * 11 floats per segment `[ax, ay, az, bx, by, bz, r, g, b, flux, flags]`,
 * world mm, linear-light color, flags bit1 = TIR (spec 18.7; the ghost bit
 * never sets — ghost tracing is off for the openUC2 kernel, see KernelCore).
 * The buffer is render-only: no displayed number may be derived from it.
 */

import { SEGMENT_FLOATS } from './messages';

export interface KernelSegment {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number; g: number; b: number;
  flux: number;
  tir: boolean;
}

export function segmentCount(buffer: Float32Array | null): number {
  return buffer ? Math.floor(buffer.length / SEGMENT_FLOATS) : 0;
}

export function forEachSegment(
  buffer: Float32Array,
  fn: (seg: KernelSegment, index: number) => void,
): void {
  const n = Math.floor(buffer.length / SEGMENT_FLOATS);
  for (let i = 0; i < n; i++) {
    const o = i * SEGMENT_FLOATS;
    const flags = buffer[o + 10];
    fn(
      {
        ax: buffer[o], ay: buffer[o + 1], az: buffer[o + 2],
        bx: buffer[o + 3], by: buffer[o + 4], bz: buffer[o + 5],
        r: buffer[o + 6], g: buffer[o + 7], b: buffer[o + 8],
        flux: buffer[o + 9],
        tir: (flags & 2) !== 0,
      },
      i,
    );
  }
}

/** Linear-light component -> sRGB-encoded [0, 1]. */
export function linearToSrgb(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** CSS color for a segment's linear-light rgb (Konva wants sRGB). */
export function segmentCssColor(r: number, g: number, b: number): string {
  const e = (c: number) => Math.round(linearToSrgb(c) * 255);
  return `rgb(${e(r)}, ${e(g)}, ${e(b)})`;
}

import type { DocCategory } from '../../document';
import { wavelengthToColor } from '../../utils/sceneBuilder';

/** Schematic glyph colors by part category. */
export const GLYPH_COLORS: Record<DocCategory, string> = {
  source: '#e74c3c',
  lens: '#4aa3ff',
  mirror: '#b8c4cc',
  beamsplitter: '#9b7fd4',
  dichroic: '#2ec4a5',
  filter: '#f2a33c',
  detector: '#546878',
  sample: '#7cc142',
  // WP-47: programmable surfaces — a distinct violet so a DMD never reads as
  // a plain mirror.
  slm: '#c86bd8',
  display: '#6b8fd8',
  other: '#8a8f98',
};

/**
 * Tint for a source's active line (WP-47): the visible spectrum where we can
 * show it honestly, a neutral amber outside it (IR/UV have no true colour).
 * `null` (no active wavelength) falls back to the category colour.
 */
export function sourceTint(wavelengthUm: number | null | undefined): string | null {
  if (wavelengthUm == null) return null;
  const nm = wavelengthUm * 1000;
  if (nm < 380 || nm > 780) return '#c8a45a'; // outside the visible range
  return wavelengthToColor(nm);
}

/** Fiber patch cords (WP-46) — amber, deliberately unlike a beam segment. */
export const FIBER_COLOR = '#f2a33c';

/**
 * Per-path colors for the authoritative service rays (WP-15), distinct from
 * the approximate overlay's wavelength tints.
 */
export const PATH_COLORS = ['#37e8a3', '#69d2ff', '#ff9f43', '#e478ff', '#f5e663'];

export function pathColor(index: number): string {
  return PATH_COLORS[index % PATH_COLORS.length];
}

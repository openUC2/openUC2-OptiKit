import type { DocCategory } from '../../document';

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
  other: '#8a8f98',
};

/**
 * Per-path colors for the authoritative service rays (WP-15), distinct from
 * the approximate overlay's wavelength tints.
 */
export const PATH_COLORS = ['#37e8a3', '#69d2ff', '#ff9f43', '#e478ff', '#f5e663'];

export function pathColor(index: number): string {
  return PATH_COLORS[index % PATH_COLORS.length];
}

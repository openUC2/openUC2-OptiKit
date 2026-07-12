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

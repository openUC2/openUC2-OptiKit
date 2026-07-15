/**
 * 2D optical glyph thumbnails for the schematic part palette (WP-23):
 * the same visual language as the 3D scene glyphs (colors from colors.ts),
 * drawn as small inline SVGs — beam axis horizontal, matching the scene.
 */

import type { DocCategory } from '../../document';
import { GLYPH_COLORS } from './colors';

function Axis() {
  return (
    <g stroke="#8f9aa6" strokeWidth="1.5" opacity="0.7">
      <line x1="4" y1="30" x2="56" y2="30" />
      <path d="M56 30 l-6 -3 v6 z" fill="#8f9aa6" stroke="none" />
    </g>
  );
}

export function GlyphThumb({ category, size = 58 }: { category: DocCategory; size?: number }) {
  const color = GLYPH_COLORS[category] ?? GLYPH_COLORS.other;
  let shape: React.ReactNode;
  switch (category) {
    case 'lens':
      shape = <ellipse cx="30" cy="30" rx="6" ry="18" fill={color} opacity="0.75" />;
      break;
    case 'mirror':
      shape = (
        <g transform="rotate(-45 30 30)">
          <rect x="26" y="12" width="5" height="36" rx="1.5" fill={color} />
          <rect x="24" y="12" width="2" height="36" fill="#eef4f8" />
        </g>
      );
      break;
    case 'source':
      shape = (
        <g>
          <rect x="8" y="24" width="22" height="12" rx="3" fill={color} />
          <path d="M30 22 L44 30 L30 38 z" fill={color} opacity="0.8" />
        </g>
      );
      break;
    case 'detector':
      shape = (
        <g>
          <rect x="26" y="14" width="24" height="32" rx="3" fill={color} />
          <rect x="22" y="20" width="5" height="20" fill="#1c242b" />
        </g>
      );
      break;
    case 'beamsplitter':
    case 'dichroic':
      shape = (
        <g>
          <rect x="14" y="14" width="32" height="32" rx="2" fill={color} opacity="0.25" />
          <line x1="14" y1="46" x2="46" y2="14" stroke={color} strokeWidth="3.5" />
        </g>
      );
      break;
    case 'filter':
      shape = <rect x="26" y="12" width="8" height="36" rx="3" fill={color} opacity="0.7" />;
      break;
    case 'sample':
      shape = <rect x="24" y="16" width="12" height="28" rx="2" fill={color} opacity="0.6" />;
      break;
    default:
      shape = <rect x="16" y="16" width="28" height="28" rx="4" fill={color} opacity="0.5" />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" role="img" aria-label={category}>
      <Axis />
      {shape}
    </svg>
  );
}

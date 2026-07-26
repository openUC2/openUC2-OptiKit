/**
 * Renders an authored schematic symbol (WP-48) in place of the derived glyph.
 * Loading, sanitizing and the caching contract live in `symbolAsset.ts` —
 * kept in a differently-named file, not a case variant, because a
 * case-insensitive filesystem would resolve both to one module.
 */

import { Html } from '@react-three/drei';

export function AuthoredSymbol({ svg, color }: { svg: string; color: string }) {
  return (
    <Html
      center
      transform
      // 1 SVG unit = 1 mm (the contract), and Html renders at CSS pixels —
      // this scale puts the drawing on the same footing as a derived glyph.
      scale={0.42}
      rotation={[-Math.PI / 2, 0, 0]}
      pointerEvents="none"
      zIndexRange={[8, 0]}
    >
      <div
        style={{ color, width: 50, height: 50, pointerEvents: 'none' }}
        // Sanitized in authoredSymbol.ts: scripts, event handlers and
        // javascript: URLs are stripped before the markup gets here.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Html>
  );
}

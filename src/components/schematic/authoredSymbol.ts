/**
 * Loading and sanitizing authored schematic symbols (WP-48).
 *
 * Derived glyphs (category shape + surface profile) stay the default — they
 * can't drift from the record. But a controller board or a carrier has no
 * optical shape to derive from, so those records ship a drawn symbol that
 * versions alongside them.
 *
 * The symbol is LOOKS ONLY: pins keep coming from `optics.ports`, so rotating
 * the part still moves the pins correctly even though the drawing is fixed
 * artwork. `currentColor` in the SVG picks up the glyph tint, which is why
 * the contract asks authors to use it instead of hardcoded colours.
 *
 * Contract (enforced by `library validate`): viewBox centered on the part
 * origin, 1 unit = 1 mm, beam axis +x.
 */

import { useEffect, useState } from 'react';

/** Cache by URL so a palette of identical boards fetches once. */
const CACHE = new Map<string, Promise<string>>();

/**
 * Strip anything executable before the markup reaches innerHTML. A symbol is
 * artwork; a community registry is not a trusted script source, so scripts,
 * inline event handlers, and external references are removed rather than
 * rendered.
 */
export function sanitizeSvg(raw: string): string {
  // Browser-only by design: without a parser we cannot prove the markup is
  // inert, so we refuse it and the caller draws the derived glyph.
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return '';
  for (const el of Array.from(svg.querySelectorAll('script, foreignObject, iframe'))) {
    el.remove();
  }
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return svg.outerHTML;
}

function loadSymbol(url: string): Promise<string> {
  let hit = CACHE.get(url);
  if (!hit) {
    hit = fetch(url)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(sanitizeSvg)
      .catch(() => '');
    CACHE.set(url, hit);
  }
  return hit;
}

/**
 * Fetch + sanitize a record's symbol. Returns null while loading AND when the
 * asset is unreachable or unparseable — callers draw the derived glyph then,
 * so a part is never left with no symbol at all (an offline registry must not
 * blank the schematic).
 */
export function useAuthoredSymbol(url: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setSvg(null);
      return;
    }
    let live = true;
    loadSymbol(url).then(text => {
      if (live) setSvg(text || null);
    });
    return () => {
      live = false;
    };
  }, [url]);

  return svg;
}

/**
 * Record-style port catalog for palette parts (WP-29).
 *
 * Feedback round 2's root cause: imported designs derive pins/glyphs/routing
 * from their real `optics.ports`, but palette placements used a hardcoded +x
 * convention — so a palette mirror at yaw 0° routed like the 45° record while
 * drawing a normal-incidence plate. This catalog closes the split: every
 * palette module id resolves to ports in the SAME shape the retained source
 * design produces (`SourcePort`), so `portsOf`/`opticalAxisOf` have exactly
 * one code path.
 *
 * Conventions (part-local DOCUMENT axes, z = up):
 *   - the beam runs along +x at yaw 0 (glyphs are authored with +x = axis);
 *   - entry ports face AGAINST the beam ('front': '-x' means the beam enters
 *     travelling +x) — mirroring the schema-v0 record semantics
 *     (openuc2.mirror.flat_45: front '-z', reflected '+x');
 *   - fold parts exit toward -y (doc south) at yaw 0, matching the 2D
 *     SimulationEngine's default mirror orientation (angle -45, the '/'
 *     surface) so the ray preview and the port routing agree — verified
 *     empirically: an eastbound sim ray reflects to doc south.
 */

import type { DocCategory } from './types';
import type { SourcePort } from './sourceDesignStore';
import { libraryEntryOf } from './libraryPalette';

const P = (
  name: string,
  direction: string,
  positionMm: [number, number, number] = [0, 0, 0],
): SourcePort => ({ name, direction, positionMm, afterSurface: null });

/** Straight-through element (lens, filter, aperture, window …). */
const THROUGH: SourcePort[] = [P('front', '-x'), P('back', '+x')];
/** 45°-mounted fold mirror: beam +x in, -y (south) out (90° fold). */
const FOLD_90: SourcePort[] = [P('front', '-x'), P('reflected', '-y')];
/** Normal-incidence mirror: beam +x in, reflected straight back (180°). */
const RETRO: SourcePort[] = [P('front', '-x'), P('reflected', '-x')];
/** Splitter/dichroic: transmitted straight, reflected arm folded 90°. */
const SPLIT: SourcePort[] = [
  P('front', '-x'),
  P('transmitted', '+x'),
  P('reflected', '-y'),
];
const EMIT: SourcePort[] = [P('out', '+x')];
const SENSE: SourcePort[] = [P('sensor', '-x')];
const SAMPLE: SourcePort[] = [P('plane', '-x')];

/**
 * Per-module overrides where the module id implies specific semantics the
 * category default can't know (fold vs retro mirrors, splitter arms).
 */
const MODULE_PORTS: Record<string, SourcePort[]> = {
  'mirror-1x1': FOLD_90,
  'kinematicmirror-1x1': FOLD_90,
  'kinematicmirror-90-1x1': RETRO,
  'beamsplitter-1x1': SPLIT,
  'filter-dichroic': SPLIT,
};

const CATEGORY_PORTS: Record<DocCategory, SourcePort[]> = {
  source: EMIT,
  detector: SENSE,
  sample: SAMPLE,
  mirror: FOLD_90, // openUC2 mirror cubes are 45° folds unless stated otherwise
  beamsplitter: SPLIT,
  dichroic: SPLIT,
  lens: THROUGH,
  filter: THROUGH,
  // WP-47: a programmable surface traces as a plate — reflective (DMD/LCoS)
  // parts fold like a mirror, transmissive ones pass straight through. The
  // 45° fold is the safe default, matching how the glyph draws them.
  slm: FOLD_90,
  display: THROUGH,
  other: THROUGH,
};

/**
 * Catalog ports for a palette part. Always returns a non-empty list — the
 * category default is itself catalog data, not a separate code path.
 * Library-registry parts (WP-34) resolve to their RECORD ports (±z optical
 * axis — placement compensates with the default grid rotation).
 */
export function catalogPortsOf(libraryRef: string, category: DocCategory): SourcePort[] {
  const lib = libraryEntryOf(libraryRef);
  if (lib && lib.ports.length > 0) return lib.ports;
  return MODULE_PORTS[libraryRef] ?? CATEGORY_PORTS[category] ?? THROUGH;
}

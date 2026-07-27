/**
 * Layer derivation & classification (WP-65).
 *
 * A part's layer index is derivable from its pose: the grid cell's z is
 * already `round(z / UC2_GRID_MM[2])` (see mapping.ts `splitWorldPosition`).
 * Interface parts — the sandwich plates, puzzle joints and baseplates living
 * in the 5 mm zone between cube levels (WP-64 `interfaceKindOf`) — belong to
 * the interface ABOVE their derived layer: they mount the layer sitting on
 * them, so the joints between L0 and L1 (cell z = 0) and a stack's bottom
 * plate (cell z = -1) classify as layer 1 and layer 0 respectively, each with
 * `interface: true`. The classified layer is clamped into the design's
 * cube-layer span so the TOP plate (cell z = topLayer + 1) follows the
 * topmost cube layer instead of a phantom layer above it.
 */

import { interfaceKindOf } from './libraryPalette';
import type { DocPart } from './types';

/** Integer layer index (55 mm z pitch) of a part — its grid cell's z. */
export function layerOf(part: DocPart): number {
  return part.gridPose.cell[2];
}

export interface LayerClassification {
  /** The layer this part belongs WITH for visibility purposes. */
  layer: number;
  /** True for plates/joints/baseplates in the 5 mm inter-layer zone. */
  interface: boolean;
}

/** Span of CUBE layers in a design (interface parts live between layers and
 * are excluded); null for an empty document. */
export interface LayerRange {
  min: number;
  max: number;
}

export function layerRangeOf(parts: DocPart[]): LayerRange | null {
  let min = Infinity;
  let max = -Infinity;
  for (const part of parts) {
    if (interfaceKindOf(part.libraryRef) !== null) continue;
    const layer = layerOf(part);
    if (layer < min) min = layer;
    if (layer > max) max = layer;
  }
  return min === Infinity ? null : { min, max };
}

/**
 * Classify a part for layer visibility (WP-65). Interface parts belong to
 * the interface ABOVE their derived layer (`layerOf + 1`), clamped into
 * `range` when given (see module docs for why the top plate needs this).
 */
export function classifyPart(
  part: DocPart,
  range?: LayerRange | null,
): LayerClassification {
  if (interfaceKindOf(part.libraryRef) === null) {
    return { layer: layerOf(part), interface: false };
  }
  let layer = layerOf(part) + 1;
  if (range) layer = Math.min(Math.max(layer, range.min), range.max);
  return { layer, interface: true };
}

/**
 * The single frame-remap module (canvas integration spec §18.3, decision E6).
 *
 * optikit-core world frame (spec decision 6.6): right-handed, mm,
 *   +X nominal forward optical direction (grid east),
 *   +Y lateral (grid south — the store's grid y),
 *   +Z vertical (layer stacking, 55 mm pitch).
 *
 * Configurator three.js frame (Y-up):
 *   three.x east, three.y up, three.z south.
 *
 * The normative map is
 *   three.x = w.x
 *   three.y = w.z + FRAME_Y_OFFSET_MM
 *   three.z = w.y
 * with the vertical offset pinned so a layer-0 module's optical axis renders
 * at y = 30 mm — exactly where the GLB cubes sit (a component's optikit
 * origin lies on its optical axis; layer L flattens to w.z = L · 55).
 *
 * This module is imported by the design generator and the ray overlay;
 * NOTHING ELSE converts between these frames. (This answers the standing
 * configurator TODO: "see if the coordinate systems match".)
 */

export const FRAME_Y_OFFSET_MM = 30;

export type Vec3 = [number, number, number];

/** optikit world (mm) → three.js world (mm). */
export function optikitToThree(w: Readonly<Vec3>): Vec3 {
  return [w[0], w[2] + FRAME_Y_OFFSET_MM, w[1]];
}

/** three.js world (mm) → optikit world (mm). Exact inverse of optikitToThree. */
export function threeToOptikit(t: Readonly<Vec3>): Vec3 {
  return [t[0], t[2], t[1] - FRAME_Y_OFFSET_MM];
}

/**
 * Remap a flat array of optikit-world points (x0,y0,z0, x1,y1,z1, …) into
 * three.js coordinates, in place-order (new array, same layout). This is the
 * bulk form the ray overlay uses for kernel segment buffers.
 */
export function optikitPointsToThree(points: ArrayLike<number>): Float32Array {
  const out = new Float32Array(points.length);
  for (let i = 0; i + 2 < points.length; i += 3) {
    out[i] = points[i];
    out[i + 1] = points[i + 2] + FRAME_Y_OFFSET_MM;
    out[i + 2] = points[i + 1];
  }
  return out;
}

// --- 2D grid canvas (Konva) map ------------------------------------------------
//
// The 2D canvas draws a module's tile as the cell rectangle
// [x·50, (x+1)·50] mm, so the tile centre sits at (x + 0.5)·50 mm — while the
// module's optikit origin flattens to x·50 mm (its optical axis crosses the
// grid intersection, matching the 3D cubes). The 2D image of an optikit world
// point is therefore shifted by half a cell on both in-plane axes.

/** Half-cell shift: canvas mm = optikit world mm + this, per in-plane axis. */
export const CANVAS_HALF_CELL_MM = 25;

/** optikit world (mm) → 2D canvas coordinates (mm; multiply by px-per-mm). */
export function optikitToCanvasMM(w: Readonly<Vec3>): { x: number; y: number } {
  return { x: w[0] + CANVAS_HALF_CELL_MM, y: w[1] + CANVAS_HALF_CELL_MM };
}

/** The optikit-world height of layer L's optical axis (55 mm pitch). */
export function layerAxisZ(layer: number): number {
  return layer * 55;
}

/** Half-thickness of a layer's slab: rays within ±27.5 mm of the layer axis
 * belong to the layer's 2D view (spec 18.8); cross-layer rays truncate here. */
export const LAYER_SLAB_HALF_MM = 27.5;

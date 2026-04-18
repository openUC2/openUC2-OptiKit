import { GRID_MM } from '../constants/grid';
import type { PlacedModule } from '../types';

/**
 * Convert a PlacedModule from store coordinates to Three.js world-space.
 * Cube origin = center of bottom face, sitting on top of the baseplate.
 *   Three.js X  <- store grid x  (east)
 *   Three.js Y  <- layer * yLayer + baseplate  (up)
 *   Three.js Z  <- store grid y  (south, depth)
 */
export function moduleWorldPosition(m: PlacedModule): [number, number, number] {
  return [
    m.position.x * GRID_MM.x,
    m.layer * GRID_MM.yLayer + GRID_MM.baseplate,
    m.position.y * GRID_MM.z,
  ];
}

/**
 * Snap a Three.js world XZ position back to store grid coordinates.
 * Note: store-space "y" maps to Three.js Z.
 */
export function snapGridXZ(worldX: number, worldZ: number) {
  return {
    x: Math.round(worldX / GRID_MM.x),
    y: Math.round(worldZ / GRID_MM.z), // store-space y, three-space z
  };
}

/**
 * Snap a Three.js world Y position to the nearest layer index.
 */
export function snapLayerY(worldY: number) {
  return Math.max(0, Math.round((worldY - GRID_MM.baseplate) / GRID_MM.yLayer));
}

/**
 * Snap an arbitrary degree value to the nearest 90° increment, in [0, 360).
 */
export function snapRotation(deg: number) {
  return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
}

export const GRID_MM = { x: 50, z: 50, yLayer: 55, baseplate: 5, cube: 50 } as const;
export const ROTATION_STEP = 90;

/** Remote fallback GLB shown when a module's own glbUrl is missing or fails to load. */
export const DEFAULT_GLB_URL =
  'https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/models/default/default-cube.glb';

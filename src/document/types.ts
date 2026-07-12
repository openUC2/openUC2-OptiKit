/**
 * Document-layer types — the editor-facing view of an Optikit design.
 *
 * The document speaks the `.dsn` schema-v0 language (see
 * DOCS/kicad-for-optics-execution.md): millimeters, a right-handed frame with
 * z pointing UP, and grid cells of UC2_GRID_MM. How this maps onto the legacy
 * appStore backing model is documented in `mapping.ts`.
 */

import type { Rot24 } from './rot24';

/** [x, y, z] in the document frame: x east, y north, z up. */
export type Vec3 = [number, number, number];

/** Quaternion [x, y, z, w] in the document frame. */
export type Quat = [number, number, number, number];

/** UC2 grid pitch in mm along document x/y/z (z = layer stacking axis). */
export const UC2_GRID_MM: Vec3 = [50, 50, 55];

/** Schematic category of a part, derived from its optical role. */
export type DocCategory =
  | 'source'
  | 'lens'
  | 'mirror'
  | 'beamsplitter'
  | 'dichroic'
  | 'filter'
  | 'detector'
  | 'sample'
  | 'other';

export interface DocWorldPose {
  /** Absolute position in mm, document frame. */
  positionMm: Vec3;
  /** Orientation as a quaternion, document frame. */
  rotation: Quat;
  /** Yaw about +z (degrees, CCW looking down) — the 2.5D editor's main rotation. */
  yawDeg: number;
}

export interface DocGridPose {
  /** Integer grid cell [x, y, z(layer)]. */
  cell: Vec3;
  /** One of the 24 axis-aligned rotations, as schema-v0 axis naming. */
  rot24: Rot24;
  /** Continuous residual offset from the cell origin, mm. */
  offsetMm: Vec3;
  /** Residual yaw not representable by rot24 (deg; goes to rotation.offset-deg). */
  residualYawDeg: number;
}

export interface DocDof {
  name: string;
  range: [number, number] | null;
  unit: string;
  value: number;
}

export interface DocPart {
  /** Stable instance id (backing PlacedModule.id). */
  id: string;
  /** Human-readable reference (customText or moduleId + index). */
  ref: string;
  category: DocCategory;
  worldPose: DocWorldPose;
  gridPose: DocGridPose;
  /** Library reference (today: ModuleDefinition.id). */
  libraryRef: string;
  dofs: DocDof[];
  /** Simulation/authoring params passed through from the backing module. */
  params: Record<string, unknown>;
}

/** A port reference used in path chains: `<partId>.<portName>`. */
export type PortRef = string;

export interface DocPath {
  name: string;
  chain: PortRef[];
}

/** Snapshot of the whole document (input to the .dsn converter, WP-12). */
export interface DocSnapshot {
  parts: DocPart[];
  paths: DocPath[];
  meta: { name: string; description: string };
}

export function makePortRef(partId: string, port: string): PortRef {
  return `${partId}.${port}`;
}

export function parsePortRef(ref: PortRef): { partId: string; port: string } {
  const i = ref.lastIndexOf('.');
  if (i <= 0 || i === ref.length - 1) throw new Error(`malformed port ref: ${ref}`);
  return { partId: ref.slice(0, i), port: ref.slice(i + 1) };
}

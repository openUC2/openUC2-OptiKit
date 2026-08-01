/**
 * Document-layer types — the editor-facing view of an Optikit design.
 *
 * The document speaks the `.dsn` schema-v0 language (the normative contract is
 * `../optikit-core/DOCS/DSN-CONTRACT.md`): millimeters, a right-handed frame
 * with z pointing UP, grid cells of UC2_GRID_MM, and the pose composition
 * `p = S·cell + δ`, `R = R24 · ΔR`.
 *
 * `DsnPart` below is the STORED form — one design component, spelled the way
 * the `.dsn` spells it. `DocPart` is the DERIVED form the views read (world
 * pose resolved, category resolved, library facts joined).
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
  // WP-47: pixel-addressable surfaces — DMD/LCoS (slm) and screens/diffusers
  // (display). They trace as a plane; the pattern is not simulated.
  | 'slm'
  | 'display'
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
  /**
   * Rotation residual ΔR (R = R24 · ΔR) as extrinsic-ZXY degrees in the
   * part's local frame — the schema's `rotation.offset-deg` (WP-28).
   */
  offsetDeg: { x: number; y: number; z: number };
  /** Convenience alias for offsetDeg.z (the pre-WP-28 yaw-only residual). */
  residualYawDeg: number;
}

export interface DocDof {
  name: string;
  range: [number, number] | null;
  unit: string;
  value: number;
}

/** Rotation residual ΔR as extrinsic-ZXY degrees, in the part's LOCAL frame. */
export interface OffsetDeg {
  x: number;
  y: number;
  z: number;
}

export const ZERO_OFFSET_DEG: OffsetDeg = { x: 0, y: 0, z: 0 };

/**
 * One design component, in the `.dsn` spelling — THE stored form.
 *
 * Every field maps 1:1 onto the schema:
 *   cell      → pose.translation.offset-grid   (integer cells, document frame)
 *   offsetMm  → pose.translation.offset-mm     (continuous residual δ)
 *   rot24     → pose.rotation.grid {z, x}      (one of the 24 orientations)
 *   offsetDeg → pose.rotation.offset-deg       (the residual ΔR)
 *   ref       → the component KEY in the design's `components:` map
 *   dofValues → instantiation.dof_values["<key>.<dof>"]
 *
 * There is no second pose representation: nothing in the editor stores a
 * store-frame euler triple any more (`legacyLayout.ts` converts on the way in
 * and out of the old interchange files, and nowhere else).
 */
export interface DsnPart {
  /** Stable instance id (uuid) — identity, not a design field. */
  id: string;
  /** Component key / display ref; '' = derive from the library record. */
  ref: string;
  /** Library record this instance places (module or bare component id). */
  libraryRef: string;
  /** Integer grid cell [x, y, layer] in the DOCUMENT frame. */
  cell: Vec3;
  /** Continuous residual from the cell center, mm, document frame. */
  offsetMm: Vec3;
  /** The discrete orientation. */
  rot24: Rot24;
  /** The continuous rotation residual (R = R24 · ΔR). */
  offsetDeg: OffsetDeg;
  /** Resolved DOF values by name. */
  dofValues: Record<string, number>;
  /** User/authoring params that round-trip through the `.dsn` (groupId,
   * enabled, wavelengthUm, T1 state, …). */
  params: Record<string, unknown>;
}

export interface DocPart {
  /** Stable instance id. */
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

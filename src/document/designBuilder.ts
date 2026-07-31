/**
 * designBuilder — PlacedModule[] → optikit-core DesignDecl YAML (EMB-C).
 *
 * The WP-11 document boundary: this is the only place the configurator's
 * placement vocabulary (grid cells, layer, 90°-step rotations) is translated
 * into the optikit-core design vocabulary (grid poses, 24-rotation axis
 * naming). Each mapped module's library `optics:` block is inlined VERBATIM
 * (canvas spec rule 12: the configurator never interprets Optiland surface
 * dicts — the block is copied, not read).
 *
 * Rotation contract (pinned by the rotation fixtures in
 * __tests__/designBuilder.test.ts):
 *
 * The 3D view composes a module's orientation as
 *   R_three = Ry(−rotation) · Rx(tiltRotation) · Rz(topRotation)
 * (CubeInstance.tsx: outer yaw group, inner [tilt, 0, top] XYZ Euler group),
 * and the 2D tracer emits a rotation-0 beam along grid east. Conjugating
 * through the E6 frame map (frames.ts, an axis swap) turns that into the
 * optikit world rotation
 *   R_w = Rz_w(rotation) · Rx_w(−tilt) · Ry_w(−top) · R0
 * with R0 = rot24(z: +x, x: −z): at zero rotations the record's optical axis
 * (record-local +z) points along optikit +X (east) and record-local +x points
 * down — the same convention the golden fluo-scope design authors for its
 * laser. All factors are exact 90° rotations, so R_w always lands on one of
 * the 24 grid rotations and the (z, x) axis literals are read off its columns.
 *
 * Mount rotations (`optikitMount` CSV column): R0 alone strands fold records —
 * a mirror record authors `reflected: +x`, which R0 sends straight DOWN, and
 * yaw (a rotation about the vertical) can never bring it into the grid plane,
 * so a placed mirror kills the beam at every 2D rotation. A module may
 * therefore declare how its record is mounted inside the cube: a sequence of
 * quarter-turn rotations about the optikit world axes at zero placement
 * rotations, composed between the placement rotations and R0:
 *   R_w = Rz_w(rotation) · Rx_w(−tilt) · Ry_w(−top) · M · R0
 * `mirror-1x1` mounts `x:90`, turning the fold from −Z (down) onto +Y (grid
 * south) — the legacy 2D engine's east→south fold at rotation 0 — after which
 * yaw steers it through all four in-plane directions.
 */

import { stringify } from 'yaml';
import type { PlacedModule } from '../types';

export type AxisDir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** A library component record, as fetched by coreClient. `optics` is the
 * record's `optics:` block as parsed YAML — opaque data, inlined verbatim. */
export interface OptikitRecord {
  id: string;
  category: string;
  optics: unknown;
}

export interface UnmappedPlacement {
  placementId: string;
  moduleId: string;
  /** Set when the CSV names an optikitId but no record was supplied for it. */
  optikitId?: string;
}

/** The curated slug→record link. A bare string is the record id; the object
 * form adds the module's `optikitMount` (how the record sits in the cube). */
export type OptikitRef = string | { id: string; mount?: string };

export interface DesignBuildResult {
  /** optikit-design.yml text; byte-identical for identical inputs (rule 10). */
  yaml: string;
  /** Design component ids emitted, sorted — placement uuid prefixed with slug. */
  mapped: string[];
  /** Placements with no library mapping: placed, rendered, in the BOM, but
   * absent from the design — rendered as "not simulated" (decision E4). */
  unmapped: UnmappedPlacement[];
  /** World pose per mapped component id — the tier-2 fast path's baseline
   * for this build (EMB-F). */
  poses: Map<string, WorldPose>;
}

// --- 24-rotation mapping (integer 3×3 matrices, exact) -------------------------

type Mat3 = readonly (readonly number[])[];

/** rot24(z: +x, x: −z): columns = record-local x/y/z axes in optikit world. */
const R0: Mat3 = [
  [0, 0, 1],
  [0, 1, 0],
  [-1, 0, 0],
];

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

function rotX(q: number): Mat3 {
  const c = COS[q], s = SIN[q];
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}

function rotY(q: number): Mat3 {
  const c = COS[q], s = SIN[q];
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}

function rotZ(q: number): Mat3 {
  const c = COS[q], s = SIN[q];
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  return a.map((row, i) =>
    row.map((_, j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]),
  );
}

function quarterTurns(deg: number | undefined, what: string): number {
  const d = deg ?? 0;
  if (d % 90 !== 0) {
    throw new Error(`${what} must be a multiple of 90°, got ${d}`);
  }
  return ((d / 90) % 4 + 4) % 4;
}

function axisLiteral(v: readonly number[], what: string): AxisDir {
  const names: AxisDir[][] = [['+x', '-x'], ['+y', '-y'], ['+z', '-z']];
  for (let i = 0; i < 3; i++) {
    if (v[i] === 1) return names[i][0];
    if (v[i] === -1) return names[i][1];
  }
  throw new Error(`${what} is not axis-aligned: [${v.join(', ')}]`);
}

const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const MOUNT_ROT: Record<string, (q: number) => Mat3> = { x: rotX, y: rotY, z: rotZ };

/** Parse an `optikitMount` value (`"x:90"`, `"z:90,x:180"`) into its matrix.
 * Steps rotate about the optikit world axes at zero placement rotations and
 * apply in listed order; angles must be multiples of 90°. */
export function mountRotation(mount: string | undefined): Mat3 {
  if (!mount || !mount.trim()) return IDENTITY;
  let m = IDENTITY;
  for (const step of mount.split(',')) {
    const [axis, deg] = step.split(':').map((s) => s.trim());
    const rot = MOUNT_ROT[axis];
    if (!rot || deg === undefined || deg === '' || Number.isNaN(Number(deg))) {
      throw new Error(`optikitMount step '${step.trim()}' is not '<x|y|z>:<degrees>'`);
    }
    m = mul(rot(quarterTurns(Number(deg), `optikitMount ${axis}`)), m);
  }
  return m;
}

/** The placement's optikit `rotation.grid` naming (z, x axis literals). */
export function gridRotation(
  m: Pick<PlacedModule, 'rotation' | 'topRotation' | 'tiltRotation'>,
  mount?: string,
): {
  z: AxisDir;
  x: AxisDir;
} {
  const yaw = quarterTurns(m.rotation, 'rotation');
  const tilt = quarterTurns(-(m.tiltRotation ?? 0), 'tiltRotation');
  const top = quarterTurns(-(m.topRotation ?? 0), 'topRotation');
  const r = mul(mul(mul(mul(rotZ(yaw), rotX(tilt)), rotY(top)), mountRotation(mount)), R0);
  return {
    z: axisLiteral([r[0][2], r[1][2], r[2][2]], 'local z image'),
    x: axisLiteral([r[0][0], r[1][0], r[2][0]], 'local x image'),
  };
}

// --- world poses (EMB-F) --------------------------------------------------------

/** A component's rigid pose in the optikit world frame (mm; exact integer
 * rotation matrix — every placement rotation is a 90° grid rotation). */
export interface WorldPose {
  rotation: Mat3;
  /** Cell center in world mm: `[x·50, y·50, layer·55]` (UC2_GRID_MM). */
  position: readonly [number, number, number];
}

const GRID_MM = [50, 50, 55] as const;

/** The world pose the materializer gives this placement's component frame —
 * the same `R_w` the design's `rotation.grid` literals are read from, plus the
 * grid translation. The tier-2 fast path moves scene objects by deltas between
 * two of these. */
export function worldPose(
  m: Pick<PlacedModule, 'position' | 'layer' | 'rotation' | 'topRotation' | 'tiltRotation'>,
  mount?: string,
): WorldPose {
  const yaw = quarterTurns(m.rotation, 'rotation');
  const tilt = quarterTurns(-(m.tiltRotation ?? 0), 'tiltRotation');
  const top = quarterTurns(-(m.topRotation ?? 0), 'topRotation');
  const rotation = mul(mul(mul(mul(rotZ(yaw), rotX(tilt)), rotY(top)), mountRotation(mount)), R0);
  return {
    rotation,
    position: [m.position.x * GRID_MM[0], m.position.y * GRID_MM[1], m.layer * GRID_MM[2]],
  };
}

/** `[x, y, z, w]` quaternion of an exact rotation matrix (Shepperd's method —
 * safe for every branch since the inputs are orthonormal). */
export function quatFromMat3(m: Mat3): [number, number, number, number] {
  const t = m[0][0] + m[1][1] + m[2][2];
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
  }
  if (m[0][0] >= m[1][1] && m[0][0] >= m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
  }
  if (m[1][1] >= m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
}

/** The rigid delta carrying `from` onto `to` (`T_to ∘ T_from⁻¹`), in the
 * kernel wire layout `[px, py, pz, qx, qy, qz, qw]` — what
 * `transformObjects3` composes onto every object of the moved component. */
export function poseDelta(from: WorldPose, to: WorldPose): number[] {
  const rd = mul(to.rotation, transpose(from.rotation));
  const rp = [
    rd[0][0] * from.position[0] + rd[0][1] * from.position[1] + rd[0][2] * from.position[2],
    rd[1][0] * from.position[0] + rd[1][1] * from.position[1] + rd[1][2] * from.position[2],
    rd[2][0] * from.position[0] + rd[2][1] * from.position[1] + rd[2][2] * from.position[2],
  ];
  const q = quatFromMat3(rd);
  return [
    to.position[0] - rp[0],
    to.position[1] - rp[1],
    to.position[2] - rp[2],
    q[0], q[1], q[2], q[3],
  ];
}

export function samePose(a: WorldPose, b: WorldPose): boolean {
  return (
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.rotation.every((row, i) => row.every((v, j) => v === b.rotation[i][j]))
  );
}

function transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

// --- design generation ---------------------------------------------------------

export interface BuildDesignOptions {
  /** Design name; fixed default keeps output deterministic (rule 10). */
  name?: string;
}

export function buildDesign(
  placements: readonly PlacedModule[],
  optikitRefFor: (moduleId: string) => OptikitRef | undefined,
  records: ReadonlyMap<string, OptikitRecord>,
  options: BuildDesignOptions = {},
): DesignBuildResult {
  const unmapped: UnmappedPlacement[] = [];
  const entries: [string, PlacedModule, OptikitRecord, string | undefined][] = [];

  for (const placement of placements) {
    const ref = optikitRefFor(placement.moduleId);
    const optikitId = typeof ref === 'string' ? ref : ref?.id;
    const mount = typeof ref === 'string' ? undefined : ref?.mount;
    const record = optikitId ? records.get(optikitId) : undefined;
    if (!optikitId || !record) {
      unmapped.push({
        placementId: placement.id,
        moduleId: placement.moduleId,
        ...(optikitId ? { optikitId } : {}),
      });
      continue;
    }
    // Placement uuid prefixed with the slug: stable across regenerations of
    // an unchanged scene (spec §18.5).
    entries.push([`${placement.moduleId}-${placement.id}`, placement, record, mount]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // The lexically-first component is the fixed anchor: it takes its absolute
  // grid offset against the design origin; every other component anchors to
  // it with a relative offset. Integer arithmetic, so world positions equal
  // the configurator's exactly.
  const anchorEntry = entries[0];
  const components: Record<string, unknown> = {};
  for (const [compId, placement, record, mount] of entries) {
    const isAnchor = compId === anchorEntry[0];
    const [ax, ay, az] = [
      anchorEntry[1].position.x,
      anchorEntry[1].position.y,
      anchorEntry[1].layer,
    ];
    const grid = isAnchor
      ? { x: placement.position.x, y: placement.position.y, z: placement.layer }
      : {
          x: placement.position.x - ax,
          y: placement.position.y - ay,
          z: placement.layer - az,
        };
    components[compId] = {
      type: 'primitive',
      category: record.category,
      primitive: { type: 'step', model: record.id },
      optics: record.optics,
      pose: {
        rotation: { type: 'grid', grid: gridRotation(placement, mount) },
        translation: {
          ...(isAnchor ? {} : { anchor: anchorEntry[0] }),
          'offset-grid': grid,
        },
      },
    };
  }

  const design = {
    'optikit-version': 'v0.0.0-alpha.1',
    design: {
      name: options.name ?? 'optikit-configurator',
      description: 'Generated by the openUC2-OptiKit configurator',
    },
    components,
  };
  const poses = new Map<string, WorldPose>(
    entries.map(([compId, placement, , mount]) => [compId, worldPose(placement, mount)]),
  );
  return {
    yaml: stringify(design),
    mapped: entries.map(([compId]) => compId),
    unmapped,
    poses,
  };
}

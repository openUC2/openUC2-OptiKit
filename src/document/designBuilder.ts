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

export interface DesignBuildResult {
  /** optikit-design.yml text; byte-identical for identical inputs (rule 10). */
  yaml: string;
  /** Design component ids emitted, sorted — placement uuid prefixed with slug. */
  mapped: string[];
  /** Placements with no library mapping: placed, rendered, in the BOM, but
   * absent from the design — rendered as "not simulated" (decision E4). */
  unmapped: UnmappedPlacement[];
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

/** The placement's optikit `rotation.grid` naming (z, x axis literals). */
export function gridRotation(m: Pick<PlacedModule, 'rotation' | 'topRotation' | 'tiltRotation'>): {
  z: AxisDir;
  x: AxisDir;
} {
  const yaw = quarterTurns(m.rotation, 'rotation');
  const tilt = quarterTurns(-(m.tiltRotation ?? 0), 'tiltRotation');
  const top = quarterTurns(-(m.topRotation ?? 0), 'topRotation');
  const r = mul(mul(mul(rotZ(yaw), rotX(tilt)), rotY(top)), R0);
  return {
    z: axisLiteral([r[0][2], r[1][2], r[2][2]], 'local z image'),
    x: axisLiteral([r[0][0], r[1][0], r[2][0]], 'local x image'),
  };
}

// --- design generation ---------------------------------------------------------

export interface BuildDesignOptions {
  /** Design name; fixed default keeps output deterministic (rule 10). */
  name?: string;
}

export function buildDesign(
  placements: readonly PlacedModule[],
  optikitIdFor: (moduleId: string) => string | undefined,
  records: ReadonlyMap<string, OptikitRecord>,
  options: BuildDesignOptions = {},
): DesignBuildResult {
  const unmapped: UnmappedPlacement[] = [];
  const entries: [string, PlacedModule, OptikitRecord][] = [];

  for (const placement of placements) {
    const optikitId = optikitIdFor(placement.moduleId);
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
    entries.push([`${placement.moduleId}-${placement.id}`, placement, record]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  // The lexically-first component is the fixed anchor: it takes its absolute
  // grid offset against the design origin; every other component anchors to
  // it with a relative offset. Integer arithmetic, so world positions equal
  // the configurator's exactly.
  const anchorEntry = entries[0];
  const components: Record<string, unknown> = {};
  for (const [compId, placement, record] of entries) {
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
        rotation: { type: 'grid', grid: gridRotation(placement) },
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
  return {
    yaml: stringify(design),
    mapped: entries.map(([compId]) => compId),
    unmapped,
  };
}

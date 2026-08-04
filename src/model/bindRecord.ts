/**
 * Part-binding model (WP-19/31, re-founded on the frame treaty in WP-116).
 *
 * The treaty (DSN-CONTRACT §Frames): component optics speak the RECORD frame
 * (F2, +z = optical axis) and ship VERBATIM — this module never derives
 * optics from geometry clicks. What it authors is the F3 side of the trio:
 *
 * - the template's `insert-pose` — the F2→F3 pose (rot24 grid map +
 *   offset-deg residual + offset-mm), stating where the record frame sits
 *   inside the cube;
 * - the template's `frames:` — insert-pose ∘ the record's own frames, the
 *   cube-frame positions verify-t1 compares;
 * - the template's `optical_ports` — the record's ports as mounted
 *   (pose-rotated directions);
 * - template + module identity, envelope, assets — mirroring the WP-8/WP-9
 *   importer conventions so all roads into the library look alike.
 *
 * The legacy datum road (housing binding, the expert tab) still turns
 * clicked `BindDatum`s into template frame POSITIONS — but never into ports:
 * a datum says WHERE, the record says WHAT.
 */

import * as THREE from 'three';
import { stringify } from 'yaml';
import type { Vec3 } from '../document';
import { rot24Matrix, type Rot24 } from '../document/rot24';
import { offsetDegMatrix } from '../document';

export type DatumKind = 'source' | 'sensor' | 'reflective' | 'front' | 'back' | 'custom';

export interface BindDatum {
  id: string;
  name: string;
  kind: DatumKind;
  /** PART-frame position, mm (document axes; moves with the mesh). */
  pointMm: Vec3;
  /** Unit direction the beam travels at this datum (part frame). */
  direction: Vec3;
  /** Clear-aperture disc diameter, when meaningful. */
  areaDiameterMm: number | null;
  /**
   * Full PART-frame orientation of the optical primitive placed at this datum
   * (WP-41): [x, y, z, w]. Present only for gizmo-placed optics (whole-module
   * binding) — a plain clicked datum keeps just `direction`. Written to the
   * record frame's `rotation` (the continuous form, WP-39).
   */
  quaternion?: [number, number, number, number];
}

export interface MeshTransform {
  positionMm: Vec3;
  rotationDeg: Vec3; // extrinsic ZXY, matching the schema's offset-deg
}

/** Rotation matrix (document axes) of a mesh transform. */
function transformMatrix(t: MeshTransform): THREE.Matrix4 {
  return offsetDegMatrix({ x: t.rotationDeg[0], y: t.rotationDeg[1], z: t.rotationDeg[2] });
}

/** Part-frame datum → cube-frame point + direction (world = T ∘ part). */
export function datumToCube(
  datum: Pick<BindDatum, 'pointMm' | 'direction'>,
  t: MeshTransform,
): { pointMm: Vec3; direction: Vec3 } {
  const m = transformMatrix(t);
  const p = new THREE.Vector3(...datum.pointMm)
    .applyMatrix4(m)
    .add(new THREE.Vector3(...t.positionMm));
  const d = new THREE.Vector3(...datum.direction).transformDirection(m).normalize();
  return { pointMm: [p.x, p.y, p.z], direction: [d.x, d.y, d.z] };
}

/**
 * Decompose a three.js group pose (the object the bind gizmo drags) back to
 * the doc-frame MeshTransform the store keeps (WP-33 regression surface:
 * this is the exact math `commitTransform` runs on mouse-up — the drag bug
 * was the gizmo mutating a DIFFERENT object than the one read here).
 * three(x, y, z) = doc(x, z, −y); rotation extrinsic doc-ZXY ⇒ three 'YXZ'
 * with sign flips.
 */
export function threePoseToMeshTransform(
  position: { x: number; y: number; z: number },
  quaternion: THREE.Quaternion,
): MeshTransform {
  const positionMm: Vec3 = [
    Math.round(position.x * 100) / 100,
    Math.round(-position.z * 100) / 100,
    Math.round(position.y * 100) / 100,
  ];
  const e = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
  const rotationDeg: Vec3 = [
    Math.round(THREE.MathUtils.radToDeg(e.x) * 10) / 10,
    Math.round(THREE.MathUtils.radToDeg(-e.z) * 10) / 10,
    Math.round(THREE.MathUtils.radToDeg(e.y) * 10) / 10,
  ];
  return { positionMm, rotationDeg };
}

/** Part-frame optic orientation → cube frame (mesh rotation ∘ datum quat).
 * The record frame's `rotation` is in the CUBE frame, so a placed optic
 * carries the mesh placement's rotation too (WP-41). */
export function datumQuatToCubeQuat(
  quat: [number, number, number, number],
  t: MeshTransform,
): THREE.Quaternion {
  const meshQuat = new THREE.Quaternion().setFromRotationMatrix(transformMatrix(t));
  return meshQuat.multiply(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3])).normalize();
}

export function datumQuatToCube(
  quat: [number, number, number, number],
  t: MeshTransform,
): [number, number, number, number] {
  const q = datumQuatToCubeQuat(quat, t);
  return [round6(q.x), round6(q.y), round6(q.z), round6(q.w)];
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * A placed optic's part-frame orientation quaternion ↔ editable Euler angles,
 * in the schema's extrinsic-ZXY degrees (the same pitch-x / roll-y / yaw-z the
 * schematic property panel and `offset-deg` use everywhere) — so a coarse
 * gizmo placement can be dialed in by typing exact values (WP-41 follow-up).
 */
export function quatToEulerDeg(
  q: [number, number, number, number],
): { x: number; y: number; z: number } {
  const e = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    'ZXY',
  );
  return {
    x: round1(THREE.MathUtils.radToDeg(e.x)),
    y: round1(THREE.MathUtils.radToDeg(e.y)),
    z: round1(THREE.MathUtils.radToDeg(e.z)),
  };
}

export function eulerDegToQuat(d: {
  x: number;
  y: number;
  z: number;
}): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(d.x),
      THREE.MathUtils.degToRad(d.y),
      THREE.MathUtils.degToRad(d.z),
      'ZXY',
    ),
  );
  return [round6(q.x), round6(q.y), round6(q.z), round6(q.w)];
}

/**
 * WP-114: the part-frame orientation quaternion that puts the optic's local
 * optical axis (+y) along `direction`.
 *
 * A CLICKED datum states its orientation as a bare direction; a PLACED one as
 * a quaternion. Seeding the quaternion from the direction is what makes
 * "type a pitch/roll/yaw on a clicked datum" continuous instead of a jump —
 * the optic starts exactly where the clicked face put it.
 */
export function quatFromDirection(direction: Vec3): [number, number, number, number] {
  const d = new THREE.Vector3(...direction);
  if (d.lengthSq() < 1e-12) return [0, 0, 0, 1];
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    d.normalize(),
  );
  return [round6(q.x), round6(q.y), round6(q.z), round6(q.w)];
}

// ── WP-116: the insert pose — F2 (record) → F3 (cube) ───────────────────────

/** The F2→F3 pose (DSN-CONTRACT §Frames): where the record frame sits inside
 * the cube. rot24 + extrinsic-ZXY residual + translation — the same spelling
 * a design pose uses, because the insert-in-cube orientation IS one of the
 * 24 discrete rotations plus residuals. */
export interface InsertPose {
  rot24: Rot24;
  offsetDeg: Vec3;
  offsetMm: Vec3;
}

export const IDENTITY_INSERT_POSE: InsertPose = {
  rot24: { z: '+z', x: '+x' },
  offsetDeg: [0, 0, 0],
  offsetMm: [0, 0, 0],
};

/** R = R24 · ΔR (ΔR extrinsic ZXY from offset-deg), the contract's §3 rule. */
export function insertPoseMatrix(pose: InsertPose): THREE.Matrix4 {
  const residual = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(pose.offsetDeg[0]),
      THREE.MathUtils.degToRad(pose.offsetDeg[1]),
      THREE.MathUtils.degToRad(pose.offsetDeg[2]),
      'ZXY',
    ),
  );
  return rot24Matrix(pose.rot24).multiply(residual);
}

/** A record-frame (F2) point carried into the cube frame (F3). */
export function posePoint(pose: InsertPose, pointMm: Vec3): Vec3 {
  const v = new THREE.Vector3(...pointMm).applyMatrix4(insertPoseMatrix(pose));
  return [v.x + pose.offsetMm[0], v.y + pose.offsetMm[1], v.z + pose.offsetMm[2]];
}

/** A record-frame (F2) direction carried into the cube frame (F3). */
export function poseDirection(pose: InsertPose, dir: Vec3): Vec3 {
  const v = new THREE.Vector3(...dir)
    .applyMatrix4(new THREE.Matrix4().extractRotation(insertPoseMatrix(pose)))
    .normalize();
  return [v.x, v.y, v.z];
}

/** A record port, as mounted: its F2 direction through the pose, spelled as
 * an axis literal when within snap tolerance (the WP-39 rule). */
export function asMountedDirection(
  pose: InsertPose,
  direction: string | [number, number, number],
): string | [number, number, number] {
  const AXES_LOCAL: Record<string, Vec3> = {
    '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0],
    '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1],
  };
  const v = Array.isArray(direction)
    ? (direction as Vec3)
    : (AXES_LOCAL[direction] ?? ([0, 0, 1] as Vec3));
  return dirToPort(poseDirection(pose, v));
}

// Basis change doc↔three: doc(x, y, z) = three(x, −z, y), a −90° rotation
// about the shared x. A doc-frame orientation quaternion becomes a
// three-space one by left-composition with this rotation (WP-41 gizmo math).
const QB = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function docQuatToThree(q: THREE.Quaternion): THREE.Quaternion {
  return QB.clone().multiply(q);
}

export function threeQuatToDoc(q: THREE.Quaternion): THREE.Quaternion {
  return QB.clone().invert().multiply(q);
}

/** A three-space gizmo group pose → a PART-frame BindDatum patch (WP-41):
 * the placed cube pose travels back through the mesh transform to the part
 * frame, and the orientation is stored as the datum quaternion. */
export function threePoseToDatum(
  position: { x: number; y: number; z: number },
  quaternion: THREE.Quaternion,
  t: MeshTransform,
): { pointMm: Vec3; direction: Vec3; quaternion: [number, number, number, number] } {
  const cubePointMm: Vec3 = [position.x, -position.z, position.y]; // three → doc
  const cubeQuat = threeQuatToDoc(quaternion);
  // Part frame = mesh⁻¹ ∘ cube.
  const meshQuatInv = new THREE.Quaternion()
    .setFromRotationMatrix(transformMatrix(t))
    .invert();
  const partQuat = meshQuatInv.clone().multiply(cubeQuat).normalize();
  const back = cubeToDatum(cubePointMm, [0, 1, 0], t); // point only; dir recomputed
  const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(partQuat).normalize();
  return {
    pointMm: [round3(back.pointMm[0]), round3(back.pointMm[1]), round3(back.pointMm[2])],
    direction: [round6(direction.x), round6(direction.y), round6(direction.z)],
    quaternion: [round6(partQuat.x), round6(partQuat.y), round6(partQuat.z), round6(partQuat.w)],
  };
}

/** Cube-frame point + direction → part frame (for click authoring). */
export function cubeToDatum(
  pointMm: Vec3,
  direction: Vec3,
  t: MeshTransform,
): { pointMm: Vec3; direction: Vec3 } {
  const inv = transformMatrix(t).invert();
  const p = new THREE.Vector3(...pointMm)
    .sub(new THREE.Vector3(...t.positionMm))
    .applyMatrix4(inv);
  const d = new THREE.Vector3(...direction).transformDirection(inv).normalize();
  return { pointMm: [p.x, p.y, p.z], direction: [d.x, d.y, d.z] };
}

export interface BindInput {
  namespace: string;
  name: string; // id slug
  category: string; // lens | mirror | source | detector | …
  templateClass: 'fixed' | 'adaptive' | 'generative';
  meshFile: string; // e.g. "laser-housing.step" (source of truth)
  meshTransform: MeshTransform;
  /**
   * WP-109: the mesh's measured bounding box in mm. `library validate` checks
   * a template's mesh against the envelope it declares, so a guessed envelope
   * is a guaranteed disagreement — pass the real one when the viewport has
   * loaded the geometry.
   */
  envelopeMm?: [number, number, number];
  datums: BindDatum[];
  description?: string;
  /**
   * WP-41: the mesh is the WHOLE cube module (cube + insert + optic + screws,
   * one Inventor export), not just an insert body. Marks the template
   * `provenance: whole-module` and promotes the placed optic frames to the
   * template's declared insert frames (so verify-t1 checks the placed pose).
   */
  wholeModule?: boolean;
  /**
   * Bind the mechanics to an EXISTING optical component instead of
   * generating a stub (WP-31): the module references this id and no
   * component record is emitted.
   */
  existingComponent?: { id: string; version: string } | null;
  /**
   * WP-67: the mesh is a bare HOUSING, not cube-mounted at all (a Thorlabs
   * laser body, a kinematic mount). Emits component + template with
   * `footprint_grid: null` and the component ref ON the template — and NO
   * cube_module. The part then places freely with its mesh travelling; a
   * cube can be generated around it later (T3) or exported for Inventor.
   */
  housingOnly?: boolean;
  /** WP-120: which frame the mesh is authored in ('cube' | 'record'),
   * detected at load — declared on the template so `library validate`'s
   * axes check stops guessing between the two shipping conventions. */
  meshFrame?: 'cube' | 'record' | null;
  /**
   * WP-116: the F2→F3 pose. When present, the template's frames are
   * insert-pose ∘ recordFrames and the datums are ignored — the pose IS the
   * binding. When absent, the legacy datum road applies (positions only).
   */
  insertPose?: InsertPose | null;
  /** The record's own F2 frame origins (name → [x, y, z] mm). */
  recordFrames?: Record<string, Vec3>;
  /** The record's own F2 ports, shipped as-mounted on the template. */
  recordPorts?: {
    name: string;
    frame: string;
    direction: string | [number, number, number];
    afterSurface: number | null;
  }[];
}

export interface BoundRecords {
  /** ALWAYS null since WP-116 — the caller owns the component record (F2,
   * verbatim). Kept in the shape so call sites read uniformly. */
  component: Record<string, unknown> | null;
  template: Record<string, unknown>;
  /** null for a housing (WP-67) — a housing is not cube-mounted, so no
   * cube_module exists to bind the pair. */
  module: Record<string, unknown> | null;
  warnings: string[];
  /** WP-77: reasons the pair MUST NOT be saved (a dead record would result).
   * The records are still built for preview; the UI blocks both exits. */
  errors: string[];
}

const AXES: [string, Vec3][] = [
  ['+x', [1, 0, 0]], ['-x', [-1, 0, 0]],
  ['+y', [0, 1, 0]], ['-y', [0, -1, 0]],
  ['+z', [0, 0, 1]], ['-z', [0, 0, -1]],
];

/** Off-axis tolerance before the snap gets warned about (degrees). */
export const AXIS_SNAP_WARN_DEG = 2.0;

export function snapToAxis(direction: Vec3): {
  axis: string;
  vec: Vec3;
  deviationDeg: number;
} {
  const len = Math.hypot(...direction) || 1;
  const unit: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len];
  let best: { axis: string; vec: Vec3; dot: number } = { axis: '+z', vec: [0, 0, 1], dot: -2 };
  for (const [axis, vec] of AXES) {
    const dot = unit[0] * vec[0] + unit[1] * vec[1] + unit[2] * vec[2];
    if (dot > best.dot) best = { axis, vec, dot };
  }
  const deviationDeg = (Math.acos(Math.min(1, best.dot)) * 180) / Math.PI;
  return { axis: best.axis, vec: best.vec, deviationDeg };
}

/** Default port name for a datum kind (overridable via the datum's name). */
export function defaultPortName(kind: DatumKind, index: number): string {
  switch (kind) {
    case 'source': return 'out';
    case 'sensor': return 'sensor';
    case 'reflective': return 'front';
    case 'front': return 'front';
    case 'back': return 'back';
    default: return `port-${index}`;
  }
}

const round3 = (v: number) => Math.round(v * 1e3) / 1e3;

/** A cube-frame unit vector → an axis literal (within 2°) or the WP-39
 * continuous form. */
function dirToPort(v: Vec3): string | [number, number, number] {
  const snap = snapToAxis(v);
  if (snap.deviationDeg <= AXIS_SNAP_WARN_DEG) return snap.axis;
  const len = Math.hypot(...v) || 1;
  return [round3(v[0] / len), round3(v[1] / len), round3(v[2] / len)];
}

export function bindToRecords(input: BindInput): BoundRecords {
  const warnings: string[] = [];
  const errors: string[] = [];
  // WP-77: the workbench authors NO generator block and NO DOFs, so two of
  // the three classes would emit dead records. Refuse them instead:
  // - `generative` with no generator can never generate anything — the T3
  //   road is "generate a holder…", which writes the generator + the exact
  //   params of a real run;
  // - `adaptive` with zero DOFs silently degrades to free movement and
  //   exports nothing through fx.
  if (input.templateClass === 'generative') {
    errors.push(
      'class T3 · generative would emit a template with NO generator block — a dead ' +
        'record that can never generate anything. Use “generate a holder…” instead: ' +
        'it writes the generator and the exact params of a real run.',
    );
  }
  if (input.templateClass === 'adaptive') {
    errors.push(
      'class T2 · adaptive with zero declared DOFs silently degrades to free movement ' +
        'and exports nothing through fx. The workbench cannot author DOFs yet — ' +
        'use T1 · fixed, or author the dof block in the record directly.',
    );
  }
  const componentId = input.existingComponent
    ? input.existingComponent.id
    : `${input.namespace}.${input.category}.${input.name}`;
  const templateId = `${input.namespace}.tpl.${input.name}`;
  const moduleId = `${input.namespace}.cube.${input.name}`;

  // ── frames + ports (WP-116: the treaty) ──────────────────────────────────
  // Component optics are never derived here. This function authors the F3
  // side: the template's frames and its as-mounted optical_ports.
  const frames: Record<string, unknown> = {};
  const pose = input.insertPose ?? null;
  // Names of the frames that carry a placed optical primitive (WP-41 legacy
  // gizmo road): these become the template's declared insert frames.
  const opticFrameNames: string[] = [];
  if (pose) {
    const recordFrames = Object.entries(input.recordFrames ?? {});
    for (const [name, p] of recordFrames) {
      const posed = posePoint(pose, p);
      frames[name] = {
        'x-mm': round3(posed[0]),
        'y-mm': round3(posed[1]),
        'z-mm': round3(posed[2]),
      };
    }
    if (recordFrames.length === 0) {
      warnings.push(
        'the record declares no frames — the template has nothing to hold and ' +
          'verify-t1 will be vacuous',
      );
    }
  } else {
    // Legacy datum road (housing binding, expert tab): clicked datums give
    // the F3 positions directly. They say WHERE — never what the beam does.
    frames.optical = { 'z-mm': 0.0 };
    input.datums.forEach((datum, i) => {
      let name = datum.name || defaultPortName(datum.kind, i);
      if (name === 'optical' || name in frames) name = `${name}-${i}`;
      const cube = datumToCube(datum, input.meshTransform);
      const frame: Record<string, number | number[]> = {};
      if (cube.pointMm[0]) frame['x-mm'] = round3(cube.pointMm[0]);
      if (cube.pointMm[1]) frame['y-mm'] = round3(cube.pointMm[1]);
      frame['z-mm'] = round3(cube.pointMm[2]);
      // WP-41: a gizmo-placed optic carries its full orientation.
      if (datum.quaternion) {
        frame.rotation = datumQuatToCube(datum.quaternion, input.meshTransform);
        opticFrameNames.push(name);
      }
      frames[name] = frame;
    });
    if (input.datums.length === 0) {
      warnings.push(
        'no datums authored — the template declares no insert frames, so ' +
          'verify-t1 will be vacuous',
      );
    }
  }

  // Ports: the RECORD's ports, as mounted. The click→ports derivation (the
  // reflection law against a hardcoded +x beam) is gone — the fold belongs
  // to the optics model, stated once, on the record.
  const ports: Record<string, unknown> = {};
  for (const port of input.recordPorts ?? []) {
    ports[port.name] = {
      frame: port.frame,
      direction: pose ? asMountedDirection(pose, port.direction) : port.direction,
      ...(port.afterSurface != null ? { 'after-surface': port.afterSurface } : {}),
    };
  }
  if ((input.recordPorts ?? []).length === 0) {
    warnings.push('the record declares no ports — chaining will not work');
  }

  // WP-116: no stub component, ever — the caller ships the record verbatim.
  const component: Record<string, unknown> | null = null;

  // WP-109: only a REAL .step/.stp is the mechanical source of truth. This
  // used to write `step: <meshFile>` unconditionally, so dropping a .glb
  // published a record whose `step:` named a glTF — and the index then served
  // gltf-binary bytes under `assets.step` (it happened, to
  // openuc2.tpl.mirror_1x1).
  const isStep = /\.(step|stp)$/i.test(input.meshFile);
  const template: Record<string, unknown> = {
    kind: 'mechanical_template',
    id: templateId,
    version: '0.1.0',
    class: input.templateClass,
    description: `mount for ${componentId} (bound from ${input.meshFile})`,
    tags: ['bound'],
    // WP-109: the cube's real z pitch is 55 mm, not 50 — a hardcoded 50/50/50
    // envelope makes `library validate`'s mesh check disagree with every
    // whole-cube export. The caller passes the measured box when it has one.
    envelope: input.envelopeMm
      ? {
          'x-mm': round3(input.envelopeMm[0]),
          'y-mm': round3(input.envelopeMm[1]),
          'z-mm': round3(input.envelopeMm[2]),
        }
      : { 'x-mm': 50, 'y-mm': 50, 'z-mm': 55 },
    ...(isStep ? { step: input.meshFile } : {}),
    glb: input.meshFile.replace(/\.(step|stp)$/i, '.glb'),
    ...(input.meshFrame ? { 'mesh-frame': input.meshFrame } : {}),
    optical_ports: Object.fromEntries(
      Object.entries(ports).map(([name, port]) => [name, port]),
    ),
    footprint_grid: [1, 1, 1],
  };
  // WP-116: the mesh transform is VIEW alignment only. A rotation cannot
  // ship — the cube frame IS the reference (rotate the INSERT POSE instead)
  // — and `mesh-offset` (WP-109's write-only field) is retired: round 16
  // proved a user can pour real alignment work into a field nothing reads.
  const t = input.meshTransform;
  if (t.rotationDeg.some(v => Math.abs(v) > 1e-6)) {
    errors.push(
      'the mesh is rotated in the viewport — that rotation is recorded nowhere. ' +
        'The cube frame is the reference: leave the mesh as exported and rotate ' +
        'the insert pose instead (or re-export the file in the cube frame).',
    );
  }
  if (t.positionMm.some(v => Math.abs(v) > 1e-6)) {
    warnings.push(
      'the mesh is translated in the viewport — view alignment only, nothing is ' +
        'recorded. Re-export centred on the cube origin, or `library validate` ' +
        'will flag the offset.',
    );
  }

  // WP-116: the F2→F3 pose, spelled exactly like a design pose (§3).
  if (pose) {
    const offDeg: Record<string, number> = {};
    (['x', 'y', 'z'] as const).forEach((axis, i) => {
      if (Math.abs(pose.offsetDeg[i]) > 1e-9) offDeg[axis] = round3(pose.offsetDeg[i]);
    });
    const offMm: Record<string, number> = {};
    (['x', 'y', 'z'] as const).forEach((axis, i) => {
      if (Math.abs(pose.offsetMm[i]) > 1e-9) offMm[axis] = round3(pose.offsetMm[i]);
    });
    template['insert-pose'] = {
      rotation: {
        type: 'grid',
        grid: { z: pose.rot24.z, x: pose.rot24.x },
        ...(Object.keys(offDeg).length > 0 ? { 'offset-deg': offDeg } : {}),
      },
      translation: { 'offset-mm': offMm },
    };
  }

  // WP-41: the whole module IS the mesh. Mark it, and promote the placed
  // optic frames to the template's declared insert frames so verify-t1
  // checks the placed pose against itself (the mesh has no separate insert
  // body, so the optic pose is the only truth for where the optic sits).
  if (input.wholeModule) {
    template.provenance = 'whole-module';
    if (pose) {
      // The pose road: every posed record frame IS an insert frame.
      if (Object.keys(frames).length > 0) template.frames = frames;
    } else {
      // Legacy gizmo road: the placed-optic frames; else every clicked datum.
      const insertFrames: Record<string, unknown> = {};
      const names = opticFrameNames.length
        ? opticFrameNames
        : Object.keys(frames).filter(n => n !== 'optical');
      for (const name of names) {
        if (frames[name]) insertFrames[name] = frames[name];
      }
      if (Object.keys(insertFrames).length > 0) template.frames = insertFrames;
    }
  }

  // The module's component ref: a caret range on the existing component's
  // major.minor, or the stub's ^0.1.
  const componentRef = input.existingComponent
    ? `${componentId}@^${input.existingComponent.version.split('.').slice(0, 2).join('.')}`
    : `${componentId}@^0.1`;

  // WP-67: a bare housing is component + template, NO module. The template
  // says so itself (footprint_grid: null) and carries the component ref,
  // because no module exists to carry the pair.
  if (input.housingOnly) {
    template.footprint_grid = null;
    template.component = componentRef;
    template.description = `housing for ${componentId} (attached from ${input.meshFile})`;
    return { component, template, module: null, warnings, errors };
  }

  const module: Record<string, unknown> = {
    kind: 'cube_module',
    id: moduleId,
    version: '0.1.0',
    description: `${input.name} in a 1x1 cube (bound)`,
    tags: ['bound'],
    component: componentRef,
    template: `${templateId}@^0.1`,
    footprint_grid: [1, 1, 1],
  };

  return { component, template, module, warnings, errors };
}

/** ±Infinity → .inf survives the yaml stringifier via a replacer pass. */
function yamlText(record: Record<string, unknown>): string {
  return stringify(record, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
}

export interface BindAssets {
  /** Original STEP bytes (mechanical source of truth). */
  step?: Uint8Array | null;
  /** Converted GLB bytes (render copy). */
  glb?: Uint8Array | null;
  /** Scene snapshot for library tiles. */
  thumbnailPng?: Uint8Array | null;
}

/**
 * File map for the "Download records" zip AND the dev write (library-PR
 * layout). WP-31: the mesh assets ship WITH the records — a record without
 * its STP/GLB is not reviewable. Binding to an existing component emits no
 * component.yml.
 */
export function recordsToFiles(
  records: BoundRecords,
  meshFile = 'part.step',
  assets: BindAssets = {},
): Record<string, string | Uint8Array> {
  const templateId = records.template.id as string;
  const files: Record<string, string | Uint8Array> = {};
  if (records.component) {
    files[`components/${records.component.id as string}/component.yml`] =
      yamlText(records.component);
  }
  files[`templates/${templateId}/template.yml`] = yamlText(records.template);
  // WP-67: a housing emits no module — the part is deliberately cube-less.
  if (records.module) {
    files[`modules/${records.module.id as string}/module.yml`] = yamlText(records.module);
  }
  const stepName = meshFile.replace(/\.(glb|gltf)$/i, '.step');
  if (assets.step) files[`templates/${templateId}/${stepName}`] = assets.step;
  if (assets.glb) {
    files[`templates/${templateId}/${stepName.replace(/\.(step|stp)$/i, '.glb')}`] = assets.glb;
  }
  if (assets.thumbnailPng) files[`templates/${templateId}/thumbnail.png`] = assets.thumbnailPng;
  return files;
}

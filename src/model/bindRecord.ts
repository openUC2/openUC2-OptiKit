/**
 * Part-binding model (WP-19, reworked in WP-31): datums authored on a
 * mechanical part become library records.
 *
 * A `BindDatum` is a point + direction (+ optional circular area) in the
 * PART frame — datums belong to the mesh, so moving or rotating the part
 * carries them along (the mechanical intuition; the STEP is the source of
 * truth). Cube-frame coordinates are derived: world = meshTransform ∘ datum.
 * The record mapping (in the CUBE frame, unchanged from WP-19):
 *
 * - each datum → one `optics.frames` entry (full x/y/z-mm offset);
 * - each datum → one `optics.ports` entry; schema-v0 port directions are
 *   axis-aligned (`+x` … `-z`), so the authored direction snaps to the
 *   nearest principal axis, warning when the deviation is real;
 * - the mesh placement transform → the template's `mesh-offset` extra;
 * - the records bind into component + template + module, mirroring the
 *   WP-8/WP-9 importer conventions so all roads into the library look alike.
 *   Binding to an EXISTING optical component (the KiCad symbol↔footprint
 *   association) skips the stub component: the module references the chosen
 *   component id and only template + module are emitted.
 */

import * as THREE from 'three';
import { stringify } from 'yaml';
import type { Vec3 } from '../document';
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

/** The optic's local optical axis (+y) in the cube frame — a placed mirror's
 * surface normal (WP-41). */
function cubeNormalOf(datum: BindDatum, t: MeshTransform): THREE.Vector3 {
  if (!datum.quaternion) return new THREE.Vector3(...datumToCube(datum, t).direction);
  return new THREE.Vector3(0, 1, 0).applyQuaternion(datumQuatToCubeQuat(datum.quaternion, t));
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
}

export interface BoundRecords {
  /** null when binding to an existing component (nothing to emit). */
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

  const frames: Record<string, unknown> = { optical: { 'z-mm': 0.0 } };
  const ports: Record<string, unknown> = {};
  // Names of the frames that carry a placed optical primitive (WP-41): these
  // become the template's declared insert frames in whole-module binding.
  const opticFrameNames: string[] = [];
  // One reflective surface per placed mirror (WP-41 multi-mirror: a dual-axis
  // galvo carries two, each its own fragment surface + frame).
  const reflectiveDatums = input.datums.filter(d => d.kind === 'reflective');
  const multiMirror = reflectiveDatums.length > 1;
  input.datums.forEach((datum, i) => {
    // Records speak the CUBE frame: part-frame datums travel through the
    // mesh placement first (WP-31 — datums follow the part).
    const cube = datumToCube(datum, input.meshTransform);
    const snap = snapToAxis(cube.direction);
    // WP-39: within tolerance the direction snaps to the axis literal; beyond
    // it the TRUE continuous direction is kept as a unit vector — no more
    // forced quantization of a 30° galvo mirror to the nearest cube axis.
    let direction: string | [number, number, number] = snap.axis;
    if (snap.deviationDeg > AXIS_SNAP_WARN_DEG) {
      const len = Math.hypot(...cube.direction) || 1;
      direction = [
        round3(cube.direction[0] / len),
        round3(cube.direction[1] / len),
        round3(cube.direction[2] / len),
      ];
      warnings.push(
        `datum '${datum.name}' points ${snap.deviationDeg.toFixed(1)}° off the ${snap.axis} ` +
          'axis — kept the continuous direction (vector ports need schema-v0.1; ' +
          '`library validate` will warn until ratified)',
      );
    }
    // One name serves as both the frame and the port; 'optical' is reserved
    // for the part origin, and empty names fall back to the kind default.
    let name = datum.name || defaultPortName(datum.kind, i);
    if (name === 'optical' || name in frames) name = `${name}-${i}`;
    const frame: Record<string, number | number[]> = {};
    if (cube.pointMm[0]) frame['x-mm'] = round3(cube.pointMm[0]);
    if (cube.pointMm[1]) frame['y-mm'] = round3(cube.pointMm[1]);
    frame['z-mm'] = round3(cube.pointMm[2]);
    // WP-41: a gizmo-placed optic carries its full orientation onto the frame.
    if (datum.quaternion) {
      frame.rotation = datumQuatToCube(datum.quaternion, input.meshTransform);
      opticFrameNames.push(name);
    }
    frames[name] = frame;

    // A placed mirror emits BOTH beam endpoints derived from its surface
    // normal (WP-41 + WP-40 reflection law): a +x-incoming beam reflects off
    // the placed normal, so the schematic folds accordingly. Everything else
    // keeps the single datum port.
    if (datum.kind === 'reflective' && datum.quaternion) {
      const n = cubeNormalOf(datum, input.meshTransform).normalize();
      const incoming = new THREE.Vector3(1, 0, 0); // canonical cube optical axis
      const reflected = incoming.clone().sub(n.clone().multiplyScalar(2 * incoming.dot(n)));
      const surfaceIdx = reflectiveDatums.indexOf(datum);
      const entryName = multiMirror ? `${name}-in` : 'front';
      const exitName = multiMirror ? `${name}-refl` : 'reflected';
      ports[entryName] = {
        frame: name,
        direction: dirToPort([-incoming.x, -incoming.y, -incoming.z]),
      };
      ports[exitName] = {
        frame: name,
        direction: dirToPort([reflected.x, reflected.y, reflected.z]),
        'after-surface': surfaceIdx,
      };
    } else {
      ports[name] = { frame: name, direction };
    }
  });
  if (input.datums.length === 0) {
    warnings.push('no datums authored — the record has no ports; chaining will not work');
  }

  let component: Record<string, unknown> | null = null;
  if (!input.existingComponent) {
    component = {
      kind: 'optical_component',
      id: componentId,
      version: '0.1.0',
      category: input.category,
      description: input.description ?? `${input.name} (bound in the part-binding workbench)`,
      tags: ['bound'],
      optics: { frames, ports },
    };
    // One reflective flat-fold surface per placed mirror (WP-8 convention;
    // WP-41: a dual-axis galvo carries two, indexed by the reflected ports'
    // after-surface).
    if (reflectiveDatums.length > 0) {
      (component.optics as Record<string, unknown>).fragment = {
        surfaces: reflectiveDatums.map(() => ({
          type: 'standard',
          geometry: { type: 'StandardGeometry', radius: Infinity, conic: 0 },
          interaction_model: { type: 'refractive_reflective', is_reflective: true },
        })),
      };
    }
  }

  const t = input.meshTransform;
  const template: Record<string, unknown> = {
    kind: 'mechanical_template',
    id: templateId,
    version: '0.1.0',
    class: input.templateClass,
    description: `mount for ${componentId} (bound from ${input.meshFile})`,
    tags: ['bound'],
    envelope: { 'x-mm': 50, 'y-mm': 50, 'z-mm': 50 },
    // STEP = mechanical source of truth; GLB = derived render copy.
    step: input.meshFile,
    glb: input.meshFile.replace(/\.(step|stp)$/i, '.glb'),
    'mesh-offset': {
      'x-mm': round3(t.positionMm[0]),
      'y-mm': round3(t.positionMm[1]),
      'z-mm': round3(t.positionMm[2]),
      'rot-deg': { x: round3(t.rotationDeg[0]), y: round3(t.rotationDeg[1]), z: round3(t.rotationDeg[2]) },
    },
    optical_ports: Object.fromEntries(
      Object.entries(ports).map(([name, port]) => [name, port]),
    ),
    footprint_grid: [1, 1, 1],
  };

  // WP-41: the whole module IS the mesh. Mark it, and promote the placed
  // optic frames to the template's declared insert frames so verify-t1
  // checks the placed pose against itself (the mesh has no separate insert
  // body, so the optic pose is the only truth for where the optic sits).
  if (input.wholeModule) {
    template.provenance = 'whole-module';
    const insertFrames: Record<string, unknown> = {};
    for (const name of opticFrameNames.length ? opticFrameNames : Object.keys(ports)) {
      if (frames[name]) insertFrames[name] = frames[name];
    }
    if (Object.keys(insertFrames).length > 0) template.frames = insertFrames;
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

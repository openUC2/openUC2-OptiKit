/**
 * Pose mapping between the legacy appStore model and the document frame.
 *
 * ## Backing model (appStore `PlacedModule`)
 * The current store is the *flattened* form of the future `.dsn` tree:
 *   - `position.x`, `position.y` — integer grid cell (2D top view; y grows "south",
 *     i.e. downward on the 2D canvas / +Z in the three.js scene)
 *   - `layer` — integer stacking level (55 mm pitch)
 *   - `rotation` — yaw in degrees; the 3D view applies it as -rotation about
 *     three.js Y (up). Historically 0/90/180/270; the document allows any value.
 *   - `topRotation` / `tiltRotation` — 90°-step rotations about three.js Z / X,
 *     applied inside the yaw group as Euler(tilt, 0, top, 'XYZ').
 *   - continuous residuals live in `params.__doc` (this layer's private bag):
 *     `{ offsetMm: [x,y,z] (document frame), offsetDeg: {x,y,z}, dofValues }`.
 *     `offsetDeg` is the schema's `rotation.offset-deg`: the residual ΔR with
 *     R = R24 · ΔR, ΔR = Rz(z)·Rx(x)·Ry(y) (extrinsic ZXY, degrees) in the
 *     part's local frame. Legacy layouts carried `freeYawDeg` (a store-sign
 *     GLOBAL yaw residual); `getDocParams` migrates it on read
 *     (offsetDeg.z = -freeYawDeg — identical for upright parts, which is the
 *     only case the old model represented faithfully).
 *
 * ## Document frame (matches `.dsn` schema v0)
 * Right-handed, millimeters, z UP:
 *   doc x = three.js x = store grid x (east)
 *   doc y = -three.js z = -store grid y (north)
 *   doc z = three.js y = layer axis (up)
 * Grid pitch: UC2_GRID_MM = [50, 50, 55]  (x, y, z).
 *
 * World position of a cell origin = cell * UC2_GRID_MM (the render-only baseplate
 * offset of the 3D view is NOT part of the model).
 *
 * Yaw: document yaw (CCW about +z, 0 = +x/east) = -store rotation.
 */

import * as THREE from 'three';
import type { PlacedModule } from '../types';
import { decomposeRot24, rot24Matrix } from './rot24';
import type { Rot24 } from './rot24';
import type { DocGridPose, DocWorldPose, Vec3 } from './types';
import { UC2_GRID_MM } from './types';

/** Reserved key inside PlacedModule.params for document-layer instance data. */
export const DOC_PARAMS_KEY = '__doc';

export interface OffsetDeg {
  x: number;
  y: number;
  z: number;
}

export interface DocParams {
  /** Continuous residual offset from the grid cell, mm, document frame. */
  offsetMm?: Vec3;
  /**
   * Rotation residual ΔR (R = R24 · ΔR) as extrinsic-ZXY degrees in the
   * part's local frame — exactly the schema's `rotation.offset-deg`.
   */
  offsetDeg?: OffsetDeg;
  /** @deprecated pre-WP-28 global yaw residual (store sign); migrated on read. */
  freeYawDeg?: number;
  /** Resolved DOF values by name. */
  dofValues?: Record<string, number>;
}

export const ZERO_OFFSET_DEG: OffsetDeg = { x: 0, y: 0, z: 0 };

export function getDocParams(m: PlacedModule): DocParams {
  const raw = m.params?.[DOC_PARAMS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const params = raw as DocParams;
  // Migrate persisted pre-WP-28 layouts: freeYawDeg (store-sign, global z)
  // becomes offsetDeg.z (doc-sign, local z — identical for upright parts).
  if (params.offsetDeg === undefined && typeof params.freeYawDeg === 'number' && params.freeYawDeg !== 0) {
    return { ...params, offsetDeg: { x: 0, y: 0, z: -params.freeYawDeg } };
  }
  return params;
}

/** The part's rotation residual, defaulting to zero. */
export function offsetDegOf(m: PlacedModule): OffsetDeg {
  return getDocParams(m).offsetDeg ?? ZERO_OFFSET_DEG;
}

// ── frame conversion ─────────────────────────────────────────────────────────

/** Change-of-basis three.js → document (doc = M · three). Proper rotation (det +1). */
const THREE_TO_DOC = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0), // three x → doc x
  new THREE.Vector3(0, 0, 1), // three y → doc z
  new THREE.Vector3(0, -1, 0), // three z → doc -y
);
const DOC_TO_THREE = THREE_TO_DOC.clone().transpose();

export function threePosToDoc(p: THREE.Vector3): Vec3 {
  return [p.x, -p.z, p.y];
}

export function docPosToThree(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[2], -p[1]);
}

/**
 * Convert a document-frame quaternion to the three.js scene frame
 * (q_three = Mᵀ · q_doc · M). Local glyph geometry authored with X = optical
 * axis and Y = up then renders correctly under this quaternion.
 */
export function docQuatToThree(q: [number, number, number, number]): THREE.Quaternion {
  const rDoc = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
  );
  const rThree = DOC_TO_THREE.clone().multiply(rDoc).multiply(THREE_TO_DOC);
  return new THREE.Quaternion().setFromRotationMatrix(rThree);
}

/** Rotate a document-frame local vector by a document-frame quaternion. */
export function rotateDocVec(q: [number, number, number, number], v: Vec3): Vec3 {
  const out = new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
  );
  return [out.x, out.y, out.z];
}

// ── store → document ─────────────────────────────────────────────────────────

/** Document yaw (CCW about +z) from a store yaw. */
export function docYawFromStoreYaw(storeDeg: number): number {
  return normalizeDeg(-storeDeg);
}

export function storeYawFromDocYaw(docDeg: number): number {
  return normalizeDeg(-docDeg);
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** ΔR from an offset-deg triple: Rz(z)·Rx(x)·Ry(y) (three.js 'ZXY' order). */
export function offsetDegMatrix(offsetDeg: OffsetDeg): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(offsetDeg.x),
      THREE.MathUtils.degToRad(offsetDeg.y),
      THREE.MathUtils.degToRad(offsetDeg.z),
      'ZXY',
    ),
  );
}

/**
 * The snapped (axis-aligned) orientation in the document frame, composed
 * exactly as the 3D view does (outer yaw about three-Y, inner
 * Euler(tilt, 0, top, 'XYZ')), then re-based.
 */
export function snappedDocRotationMatrix(m: PlacedModule): THREE.Matrix4 {
  const yaw = THREE.MathUtils.degToRad(-m.rotation);
  const tilt = THREE.MathUtils.degToRad(m.tiltRotation ?? 0);
  const top = THREE.MathUtils.degToRad(m.topRotation ?? 0);
  const outer = new THREE.Matrix4().makeRotationY(yaw);
  const inner = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt, 0, top, 'XYZ'));
  const rThree = outer.multiply(inner);
  return THREE_TO_DOC.clone().multiply(rThree).multiply(DOC_TO_THREE);
}

/**
 * Full orientation in the document frame: the snapped R24 orientation with
 * the offset-deg residual right-multiplied (schema convention R = R24 · ΔR —
 * the residual acts in the part's LOCAL frame).
 */
export function docRotationMatrix(m: PlacedModule): THREE.Matrix4 {
  const snapped = snappedDocRotationMatrix(m);
  const off = offsetDegOf(m);
  if (off.x === 0 && off.y === 0 && off.z === 0) return snapped;
  return snapped.multiply(offsetDegMatrix(off));
}

export function worldPoseOf(m: PlacedModule): DocWorldPose {
  const extras = getDocParams(m);
  const off = extras.offsetMm ?? [0, 0, 0];
  const positionMm: Vec3 = [
    m.position.x * UC2_GRID_MM[0] + off[0],
    -m.position.y * UC2_GRID_MM[1] + off[1],
    m.layer * UC2_GRID_MM[2] + off[2],
  ];
  const rot = docRotationMatrix(m);
  const q = new THREE.Quaternion().setFromRotationMatrix(rot);
  return {
    positionMm,
    rotation: [q.x, q.y, q.z, q.w],
    // For upright parts local z == document z, so the residual adds directly;
    // for tipped parts a single yaw number is ill-defined anyway — this stays
    // the 2.5D editor's working value.
    yawDeg: normalizeDeg(docYawFromStoreYaw(m.rotation) + offsetDegOf(m).z),
  };
}

export function gridPoseOf(m: PlacedModule): DocGridPose {
  const extras = getDocParams(m);
  const off = extras.offsetMm ?? [0, 0, 0];
  const dec = decomposeRot24(docRotationMatrix(m));
  return {
    cell: [m.position.x, -m.position.y, m.layer],
    rot24: dec.rot24,
    offsetMm: [...off] as Vec3,
    offsetDeg: dec.offsetDeg,
    residualYawDeg: dec.offsetDeg.z,
  };
}

// ── document → store ─────────────────────────────────────────────────────────

export interface StorePlacement {
  position: { x: number; y: number };
  layer: number;
  offsetMm: Vec3;
}

/**
 * Split an absolute document-frame position into the store's integer cell plus
 * a continuous residual (cubify's `p = S·g + δ` along each axis).
 */
export function splitWorldPosition(positionMm: Vec3): StorePlacement {
  const cellX = Math.round(positionMm[0] / UC2_GRID_MM[0]);
  const cellYDoc = Math.round(positionMm[1] / UC2_GRID_MM[1]);
  const cellZ = Math.round(positionMm[2] / UC2_GRID_MM[2]);
  return {
    position: { x: cellX, y: -cellYDoc },
    layer: cellZ,
    offsetMm: [
      positionMm[0] - cellX * UC2_GRID_MM[0],
      positionMm[1] - cellYDoc * UC2_GRID_MM[1],
      positionMm[2] - cellZ * UC2_GRID_MM[2],
    ],
  };
}

/** Recompose an absolute document position from a store placement. */
export function joinWorldPosition(p: StorePlacement): Vec3 {
  return [
    p.position.x * UC2_GRID_MM[0] + p.offsetMm[0],
    -p.position.y * UC2_GRID_MM[1] + p.offsetMm[1],
    p.layer * UC2_GRID_MM[2] + p.offsetMm[2],
  ];
}

/**
 * Store euler triple (rotation, tiltRotation, topRotation — all 90° steps)
 * realizing a given rot24. Every one of the 24 orientations is reachable;
 * resolved by exhaustive search over the 64 combinations (cached).
 */
export function eulerTripleForRot24(rot24: Rot24): {
  rotation: number;
  tiltRotation: number;
  topRotation: number;
} {
  const key = `${rot24.z}|${rot24.x}`;
  const cached = eulerTripleCache.get(key);
  if (cached) return cached;
  const target = rot24Matrix(rot24);
  const steps = [0, 90, 180, 270];
  for (const rotation of steps) {
    for (const tiltRotation of steps) {
      for (const topRotation of steps) {
        const m = docRotationMatrix({
          id: '',
          moduleId: '',
          position: { x: 0, y: 0 },
          layer: 0,
          rotation,
          tiltRotation,
          topRotation,
        });
        if (matricesClose(m, target)) {
          const triple = { rotation, tiltRotation, topRotation };
          eulerTripleCache.set(key, triple);
          return triple;
        }
      }
    }
  }
  throw new Error(`rot24 z=${rot24.z} x=${rot24.x} unreachable by 90° euler triple`);
}

const eulerTripleCache = new Map<string, { rotation: number; tiltRotation: number; topRotation: number }>();

function matricesClose(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
  for (let i = 0; i < 16; i++) {
    if (Math.abs(a.elements[i] - b.elements[i]) > 1e-9) return false;
  }
  return true;
}

/** Split a document yaw into the store's snapped rotation + free residual. */
export function splitDocYaw(docYawDeg: number, snap: boolean): { rotation: number; freeYawDeg: number } {
  const store = storeYawFromDocYaw(docYawDeg);
  if (snap) {
    return { rotation: normalizeDeg(Math.round(store / 90) * 90), freeYawDeg: 0 };
  }
  const snapped = normalizeDeg(Math.round(store / 90) * 90);
  let residual = store - snapped;
  if (residual > 180) residual -= 360;
  if (residual < -180) residual += 360;
  return { rotation: snapped, freeYawDeg: residual };
}

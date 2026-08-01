/**
 * The 24 axis-aligned rotations, named by which document axis the part's local
 * +z / +x axes point along — mirroring the `.dsn` schema's `rotation.grid` and
 * the Go reference table (exp/designs/geometry.go GridRotMats): the component's
 * y-axis follows from the right-hand rule (y = z × x).
 *
 * Pure math over three.js types; no rendering dependencies.
 */

import * as THREE from 'three';

export const AXIS_DIRS = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
export type AxisDir = (typeof AXIS_DIRS)[number];

const BASIS: Record<AxisDir, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0),
  '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0),
  '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1),
  '-z': new THREE.Vector3(0, 0, -1),
};

export interface Rot24 {
  z: AxisDir;
  x: AxisDir;
}

/** All 24 valid (z, x) combinations with their rotation matrices. */
export const ROT24_TABLE: { name: Rot24; matrix: THREE.Matrix4 }[] = [];

for (const z of AXIS_DIRS) {
  for (const x of AXIS_DIRS) {
    if (x[1] === z[1]) continue; // coaxial — invalid
    const zv = BASIS[z];
    const xv = BASIS[x];
    const yv = new THREE.Vector3().crossVectors(zv, xv); // right-hand rule
    const m = new THREE.Matrix4().makeBasis(xv, yv, zv); // columns = x, y, z axes
    ROT24_TABLE.push({ name: { z, x }, matrix: m });
  }
}

export function rot24Matrix(name: Rot24): THREE.Matrix4 {
  const entry = ROT24_TABLE.find(e => e.name.z === name.z && e.name.x === name.x);
  if (!entry) throw new Error(`invalid rot24: z=${name.z}, x=${name.x}`);
  return entry.matrix.clone();
}

// ── the yaw component of a discrete orientation ──────────────────────────────
// Yaw is rotation about document +z. It is NOT readable off a single local
// axis (a part whose local +x points along ±z makes that projection
// degenerate) and NOT recoverable from a 90°-step euler triple (several
// triples realize the same orientation with different yaw numbers — the
// ambiguity the pre-WP-96 clipboard had to work around).
//
// It IS well defined as coset arithmetic: Rz(k·90°) acts on the 24
// orientations with 6 orbits of 4. Fixing one representative per orbit — the
// lowest-indexed member of ROT24_TABLE — names the yaw step of every
// orientation unambiguously, and makes `yawStepOfRot24` and
// `rot24WithYawStep` exact inverses.

function matrixIndex(m: THREE.Matrix4): number {
  for (let i = 0; i < ROT24_TABLE.length; i++) {
    const t = ROT24_TABLE[i].matrix.elements;
    let same = true;
    for (let e = 0; e < 16; e++) {
      if (Math.abs(t[e] - m.elements[e]) > 1e-9) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  throw new Error('matrix is not one of the 24 axis-aligned rotations');
}

/** Rz(k·90°) about the DOCUMENT +z axis. */
function zSpin(k: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationZ((k * Math.PI) / 2);
}

/** Which quarter-turn about +z this orientation carries (0…3). */
export function yawStepOfRot24(rot: Rot24): number {
  const m = rot24Matrix(rot);
  let bestK = 0;
  let bestIndex = Infinity;
  for (let k = 0; k < 4; k++) {
    const index = matrixIndex(zSpin(-k).multiply(m.clone()));
    if (index < bestIndex) {
      bestIndex = index;
      bestK = k;
    }
  }
  return bestK;
}

/** The same orientation with its yaw replaced by `k` quarter-turns. */
export function rot24WithYawStep(rot: Rot24, k: number): Rot24 {
  const delta = (((k - yawStepOfRot24(rot)) % 4) + 4) % 4;
  if (delta === 0) return { ...rot };
  return ROT24_TABLE[matrixIndex(zSpin(delta).multiply(rot24Matrix(rot)))].name;
}

export interface Rot24Decomposition {
  rot24: Rot24;
  /** Residual ΔR such that R = R24 · ΔR. */
  residual: THREE.Matrix4;
  /** Residual as extrinsic-ZXY Euler angles in degrees (schema offset-deg). */
  offsetDeg: { x: number; y: number; z: number };
}

/**
 * Decompose an arbitrary rotation into the nearest of the 24 axis-aligned
 * rotations plus a residual: R = R24 · ΔR (ΔR in the part's local frame).
 */
export function decomposeRot24(r: THREE.Matrix4): Rot24Decomposition {
  let best = ROT24_TABLE[0];
  let bestTrace = -Infinity;
  const tmp = new THREE.Matrix4();
  for (const entry of ROT24_TABLE) {
    // trace(R24ᵀ·R) is maximal for the smallest residual rotation angle.
    tmp.copy(entry.matrix).transpose().multiply(r);
    const t = tmp.elements[0] + tmp.elements[5] + tmp.elements[10];
    if (t > bestTrace) {
      bestTrace = t;
      best = entry;
    }
  }
  const residual = best.matrix.clone().transpose().multiply(r);
  // Normative extrinsic Z-X-Y (go3d ExtractEulerAngles): R = Rz(z)·Rx(x)·Ry(y),
  // i.e. three.js intrinsic order 'ZXY'.
  const e = new THREE.Euler().setFromRotationMatrix(residual, 'ZXY');
  return {
    rot24: best.name,
    residual,
    offsetDeg: {
      x: THREE.MathUtils.radToDeg(e.x),
      y: THREE.MathUtils.radToDeg(e.y),
      z: THREE.MathUtils.radToDeg(e.z),
    },
  };
}

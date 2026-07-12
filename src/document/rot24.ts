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
  // Extrinsic Z-X-Y == intrinsic Y-X-Z: R = Ry(y)·Rx(x)·Rz(z).
  const e = new THREE.Euler().setFromRotationMatrix(residual, 'YXZ');
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

/**
 * WP-123 — which basis the assembly gives GLB content.
 *
 * The frame treaty (DSN-CONTRACT §4b): the cube mesh speaks F3 (z = pin
 * axis); the viewer speaks F4 (y up). The part group in the assembly carries
 * the CONJUGATED rotation B·R24·B⁻¹ (correct for viewer-native glyphs and
 * ghost boxes) — so F3 mesh content needs ONE trailing doc→viewer basis B,
 * making the full composition B·R24·B⁻¹ · B = B·R24: exactly what the bind
 * workbench shows (WP-121). Without it the basis cancels and the cube
 * renders z-up in a y-up world — the "flipped again" bug of round 18.
 */

import * as THREE from 'three';

/** Doc/F3 → viewer basis: x→x, y→−z, z→y (Rx(−90°)). */
export const DOC_TO_THREE_QUAT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const IDENTITY_QUAT = new THREE.Quaternion();

/** The shape both three.js `Object3D`s and test fixtures satisfy. */
export interface MeshNodeLike {
  quaternion: THREE.Quaternion;
  children?: readonly MeshNodeLike[];
  /** three.js sets this on Mesh; absent on plain groups. */
  isMesh?: boolean;
}

/**
 * WP-132: is the file already pre-rotated to viewer y-up?
 *
 * The wrapper node is not always a direct child. Seven shipped GLBs nest it
 * as `<unnamed>[rx=0] → child[rx=−90]`, and a depth-1 scan called them
 * cube-frame and applied `B` on top of a rotation that already was `B` — a
 * doubled basis is a 90° x-rotation, exactly the "flipped again" symptom the
 * contract names. Descend through mesh-less single-child nodes and judge by
 * the ACCUMULATED rotation down to the first node that carries geometry.
 */
export function hasWrapperRotation(nodes: readonly MeshNodeLike[]): boolean {
  const isRx90 = (q: THREE.Quaternion): boolean => {
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return (
      Math.abs(Math.abs(THREE.MathUtils.radToDeg(e.x)) - 90) < 1 &&
      Math.abs(THREE.MathUtils.radToDeg(e.y)) < 1 &&
      Math.abs(THREE.MathUtils.radToDeg(e.z)) < 1
    );
  };
  const walk = (node: MeshNodeLike, accumulated: THREE.Quaternion, depth: number): boolean => {
    const here = accumulated.clone().multiply(node.quaternion);
    if (isRx90(here)) return true;
    // Only follow a mesh-less chain: once geometry appears, the frame this
    // file speaks is settled, and a rotation deeper down is part authoring.
    if (node.isMesh || depth >= 4) return false;
    const kids = node.children ?? [];
    return kids.some(child => walk(child, here, depth + 1));
  };
  return nodes.some(node => walk(node, new THREE.Quaternion(), 0));
}

/** The y-up glTF convention as a FILE→cube grid map — `mesh-frame: record`
 * is sugar for exactly this (file y = cube z, file z = cube −y). Exported so
 * the bind store can seed a correction from a detected wrapper file. */
export const RECORD_GRID: [string, string] = ['-y', '+x'];

const AXIS_VECS: Record<string, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0), '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0), '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1), '-z': new THREE.Vector3(0, 0, -1),
};

/** FILE→cube rotation for a grid spelling ({z, x} = where the file's +z and
 * +x land in cube axes) — the same construction as rot24Matrix, kept local so
 * this module stays importable without the document store. */
export function meshPoseQuat(grid: readonly [string, string]): THREE.Quaternion {
  const zv = AXIS_VECS[grid[0]];
  const xv = AXIS_VECS[grid[1]];
  if (!zv || !xv) return IDENTITY_QUAT;
  const yv = new THREE.Vector3().crossVectors(zv, xv);
  const m = new THREE.Matrix4().makeBasis(xv, yv, zv);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/**
 * WP-137: `meshPoseGrid` is the declared TOTAL file→cube map and wins over
 * everything — the sugar and the sniff exist only for files with no
 * declaration. The content transform is B · R(grid): un-rotate the file into
 * cube axes, then apply the one display basis.
 */
export function meshContentQuat(
  meshFrame: string,
  children: readonly MeshNodeLike[],
  meshPoseGrid?: readonly [string, string] | null,
): THREE.Quaternion {
  if (meshPoseGrid) {
    return DOC_TO_THREE_QUAT.clone().multiply(meshPoseQuat(meshPoseGrid));
  }
  if (meshFrame === 'record') return IDENTITY_QUAT;
  if (meshFrame === 'cube') return DOC_TO_THREE_QUAT;
  return hasWrapperRotation(children) ? IDENTITY_QUAT : DOC_TO_THREE_QUAT;
}

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

/** Which basis the GLB content gets. Undeclared legacy exports ('') are
 * sniffed for an Rx(±90°) wrapper node — those files are already pre-rotated
 * to viewer y-up, and applying the basis again would double-rotate them.
 * Same detection as the bind workbench (WP-121). */
export function meshContentQuat(
  meshFrame: string,
  children: readonly { quaternion: THREE.Quaternion }[],
): THREE.Quaternion {
  if (meshFrame === 'record') return IDENTITY_QUAT;
  if (meshFrame === 'cube') return DOC_TO_THREE_QUAT;
  for (const child of children) {
    const e = new THREE.Euler().setFromQuaternion(child.quaternion, 'XYZ');
    if (
      Math.abs(Math.abs(THREE.MathUtils.radToDeg(e.x)) - 90) < 1 &&
      Math.abs(THREE.MathUtils.radToDeg(e.y)) < 1 &&
      Math.abs(THREE.MathUtils.radToDeg(e.z)) < 1
    ) return IDENTITY_QUAT;
  }
  return DOC_TO_THREE_QUAT;
}

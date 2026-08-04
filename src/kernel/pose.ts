/**
 * Rigid-pose plumbing for the kernel's tier-2 drag fast path (EMB-F).
 *
 * The scene3 materializer places a component's scene objects from the part's
 * document pose composed with record-local constants (mount frame, record
 * axes). A rigid DELTA between two document poses cancels every constant
 * right-factor — `T_to·C ∘ (T_from·C)⁻¹ = T_to ∘ T_from⁻¹` — so deltas
 * computed from the facade's `worldPoseOfPart` are exactly what
 * `transformObjects3` must compose onto the moved component's objects, with
 * no record knowledge on this side.
 */

import * as THREE from 'three';
import type { DocWorldPose } from '../document';

/** The pose the fast path measures drags against (document frame, mm). */
export type WorldPose = Pick<DocWorldPose, 'positionMm' | 'rotation'>;

/**
 * A placement the design cannot carry (no library mapping) — rendered but not
 * simulated. Every dsn-model part exports, so wirers pass `[]`; the type keeps
 * the loop's reporting contract from the donor branch for the day a document
 * grows non-design parts again.
 */
export interface UnmappedPlacement {
  placementId: string;
  moduleId: string;
  optikitId?: string;
}

/** Exact-equality pose compare — poses derive from the same stored fields, so
 * an untouched part reproduces bit-identical numbers. */
export function samePose(a: WorldPose, b: WorldPose): boolean {
  return (
    a.positionMm[0] === b.positionMm[0] &&
    a.positionMm[1] === b.positionMm[1] &&
    a.positionMm[2] === b.positionMm[2] &&
    a.rotation[0] === b.rotation[0] &&
    a.rotation[1] === b.rotation[1] &&
    a.rotation[2] === b.rotation[2] &&
    a.rotation[3] === b.rotation[3]
  );
}

/**
 * The rigid delta carrying `from` onto `to` (`T_to ∘ T_from⁻¹`) in the kernel
 * wire layout `[px, py, pz, qx, qy, qz, qw]` — what `transformObjects3`
 * composes onto every object of the moved component.
 */
export function poseDelta(from: WorldPose, to: WorldPose): number[] {
  const qFrom = new THREE.Quaternion(...from.rotation);
  const qDelta = new THREE.Quaternion(...to.rotation).multiply(qFrom.invert());
  const rotated = new THREE.Vector3(...from.positionMm).applyQuaternion(qDelta);
  return [
    to.positionMm[0] - rotated.x,
    to.positionMm[1] - rotated.y,
    to.positionMm[2] - rotated.z,
    qDelta.x,
    qDelta.y,
    qDelta.z,
    qDelta.w,
  ];
}

/**
 * WP-131 — the bind overlay's frame math, as pure functions.
 *
 * It lives outside the .tsx so it can be TESTED, because the defect it fixes
 * was invisible by inspection: the overlay drew a fold arm that had no
 * defined relationship to the record's reflected port, and for the part that
 * triggered round 20 the two errors cancelled and it drew the mesh's true
 * fold. A record declaring a different fold therefore looked correct in the
 * parts editor, was published, and took four rounds to catch.
 *
 * The invariant the app was missing, now asserted in __tests__/overlayFrames:
 *
 *     the arm drawn by the overlay  ===  asMountedDirection(pose, exit port)
 *
 * Frames: the record speaks F2 (+z = optical axis); the viewport speaks F4
 * (y up) via B = Rx(−90°); the glyph is authored with the beam travelling
 * local −y. See DSN-CONTRACT.md §4b.
 */

import * as THREE from 'three';
import type { Vec3 } from '../../document';
import { docQuatToThree, insertPoseMatrix, threeQuatToDoc } from '../../model/bindRecord';
import type { InsertPose } from '../../model/bindRecord';
import { beamAxesOfPorts } from '../schematic/ports';

/** Doc/record → viewer basis, as a vector map (B = Rx(−90°)). */
export const docToThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];

/** Glyph-local entry TRAVEL direction: the beam comes down the local −y axis. */
export const GLYPH_BEAM = new THREE.Vector3(0, -1, 0);

export interface DraftPortLike {
  name: string;
  direction: string | readonly number[];
  afterSurface?: number | null;
}

/**
 * Aligns the glyph's +y with the entry direction. This pins ONE axis — the
 * roll about it is whatever `setFromUnitVectors` picks, which is precisely
 * why the exit arm may not be derived from a local angle (see `exitLocalOf`).
 */
export function baseQuatOf(entryDir: Vec3 | null | undefined): THREE.Quaternion {
  const d = new THREE.Vector3(...docToThree(entryDir ?? [0, 1, 0]));
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    d.lengthSq() > 0 ? d.normalize() : new THREE.Vector3(0, 1, 0),
  );
}

/**
 * The record's reflected arm in GLYPH-LOCAL axes.
 *
 * The enclosing group already carries the full pose, so a posed direction
 * would apply the pose twice. A record-frame travel direction v renders at
 * B·R·v while the group maps a local u to B·R·B⁻¹·base·u — hence
 * u = base⁻¹·B·v.
 */
export function exitLocalOf(
  ports: readonly DraftPortLike[],
  base: THREE.Quaternion,
): THREE.Vector3 | null {
  const axes = beamAxesOfPorts(
    ports.map(p => ({
      name: p.name,
      direction: p.direction as string,
      positionMm: [0, 0, 0] as Vec3,
      afterSurface: p.afterSurface ?? null,
    })),
  );
  if (!axes.exit) return null;
  const v = new THREE.Vector3(...docToThree(axes.exit));
  if (v.lengthSq() < 1e-9) return null;
  return v.normalize().applyQuaternion(base.clone().invert());
}

/**
 * The plate that turns the entry beam into the declared exit: the bisector
 * n ∝ (exit − entry), the same law the schematic glyph uses. A retro
 * (exit = −beam) yields a plate square to the beam, so nothing degenerates.
 * `galvoTiltDeg` tips the plate INSIDE the fold plane — what a steering
 * mirror does — and the arm then swings 2θ by the reflection law.
 */
export function plateFrom(
  exitLocal: THREE.Vector3 | null,
  galvoTiltDeg = 0,
  mountAngleDeg = 0,
): { normal: THREE.Vector3; reflected: THREE.Vector3 } {
  const reflect = (n: THREE.Vector3) =>
    GLYPH_BEAM.clone().sub(n.clone().multiplyScalar(2 * GLYPH_BEAM.dot(n)));
  if (exitLocal && exitLocal.lengthSq() > 1e-9) {
    const e = exitLocal.clone().normalize();
    const n = e.clone().sub(GLYPH_BEAM).normalize();
    const w = new THREE.Vector3().crossVectors(GLYPH_BEAM, e);
    if (galvoTiltDeg && w.lengthSq() > 1e-9) {
      n.applyAxisAngle(w.normalize(), (galvoTiltDeg * Math.PI) / 180);
    }
    return { normal: n, reflected: reflect(n) };
  }
  // Fallback: a hand-placed datum optic with no reflected port to honour.
  const theta = ((galvoTiltDeg + mountAngleDeg) * Math.PI) / 180;
  const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), theta);
  return { normal: n, reflected: reflect(n) };
}

/** The overlay group's orientation: the insert pose composed onto `base`. */
export function overlayQuatOf(
  base: THREE.Quaternion,
  insertPose: InsertPose | null,
): THREE.Quaternion {
  if (!insertPose) return base.clone();
  const rPose = new THREE.Quaternion().setFromRotationMatrix(insertPoseMatrix(insertPose));
  return docQuatToThree(rPose.multiply(threeQuatToDoc(base.clone())));
}

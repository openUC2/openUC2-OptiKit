/**
 * WP-148 — the insert turns, the cube does not.
 *
 * Asked for in rounds 22 and 23: rotating the insert pose should turn
 * everything that is not a cube half while the halves stay pins-up, because
 * that is what the hardware does. Only the optics overlay previewed the pose
 * before, so the mesh sat still.
 *
 * The composition is the part worth pinning: the pose is a rotation in CUBE
 * axes, and it enters the scene ABOVE the content basis — so it must be
 * conjugated (B·R·B⁻¹), not left-multiplied. Getting that wrong is exactly
 * the class of bug rounds 18–20 were made of.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { docQuatToThree } from '../../../document';
import { DOC_TO_THREE_QUAT, meshPoseQuat } from '../../assembly/meshFrame';
import { insertPoseMatrix, type InsertPose } from '../../../model/bindRecord';

const pose = (z: string, x: string): InsertPose => ({
  rot24: { z, x } as InsertPose['rot24'],
  offsetDeg: [0, 0, 0],
  offsetMm: [0, 0, 0],
});

/** The wrapper BindScene puts above the content group for the insert copy. */
function insertWrapper(p: InsertPose): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromRotationMatrix(insertPoseMatrix(p));
  return docQuatToThree([q.x, q.y, q.z, q.w]);
}

describe('the posed insert copy', () => {
  it('composes to B·R·M — the pose acting in CUBE axes', () => {
    for (const [z, x] of [
      ['+z', '+x'],
      ['-x', '+y'],
      ['+y', '-z'],
      ['-z', '+x'],
    ] as const) {
      for (const grid of [null, ['-y', '+x'] as const]) {
        const p = pose(z, x);
        // What the scene builds: wrapper ∘ contentQuat.
        const content = grid
          ? DOC_TO_THREE_QUAT.clone().multiply(meshPoseQuat(grid))
          : DOC_TO_THREE_QUAT.clone();
        const rendered = insertWrapper(p).clone().multiply(content);

        // What it must equal: B · R · M.
        const r = new THREE.Quaternion().setFromRotationMatrix(insertPoseMatrix(p));
        const m = grid ? meshPoseQuat(grid) : new THREE.Quaternion();
        const want = DOC_TO_THREE_QUAT.clone().multiply(r).multiply(m);

        expect(rendered.angleTo(want)).toBeCloseTo(0, 6);
      }
    }
  });

  it('an identity pose leaves the insert exactly where the shell is', () => {
    const wrapper = insertWrapper(pose('+z', '+x'));
    expect(wrapper.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 9);
  });

  it('a 90° insert turn moves the insert and not the shell', () => {
    // record +z onto cube +x: the optical axis leaves along the cube's x.
    const wrapper = insertWrapper(pose('+x', '-z'));
    const axis = new THREE.Vector3(0, 0, 1) // cube +z, in viewer axes = +y
      .applyQuaternion(DOC_TO_THREE_QUAT);
    const turned = axis.clone().applyQuaternion(wrapper);
    // The shell copy is unwrapped, so it still points along viewer +y.
    expect(axis.y).toBeCloseTo(1, 6);
    expect(turned.y).toBeCloseTo(0, 6);
  });
});

/**
 * WP-143 — a T1 cube turns in 90° steps, and reaches all 24.
 *
 * Round 23: "camera_basic cannot be rotated in pitch/roll, even though it
 * says T1, so we should be able to have it facing any of the 24 directions".
 * Correct — a cube is bound to the GRID, not to four yaws; it can sit
 * pins-sideways in a stack. The panel's pitch/roll fields wrote `offset-deg`
 * residuals, which is the wrong mechanism for a discrete step (a residual
 * tilt would break the T-rule, which is why they were disabled). The steps
 * compose onto `rot24` instead.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROT24_TABLE, decomposeRot24, rot24Matrix, type Rot24 } from '../rot24';

/** The pure half of `stepPartRot24`: one 90° turn about a DOCUMENT axis. */
function step(rot: Rot24, axis: 'x' | 'y' | 'z', turns = 1): Rot24 {
  const m = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      axis === 'x' ? (Math.PI / 2) * turns : 0,
      axis === 'y' ? (Math.PI / 2) * turns : 0,
      axis === 'z' ? (Math.PI / 2) * turns : 0,
    ),
  );
  return decomposeRot24(m.multiply(rot24Matrix(rot))).rot24;
}

const key = (r: Rot24) => `${r.z}|${r.x}`;
const IDENTITY: Rot24 = { z: '+z', x: '+x' };

describe('the 90° steppers', () => {
  it('reach every one of the 24 grid orientations from identity', () => {
    const seen = new Set<string>([key(IDENTITY)]);
    const queue: Rot24[] = [IDENTITY];
    while (queue.length > 0) {
      const rot = queue.shift()!;
      for (const axis of ['x', 'y', 'z'] as const) {
        const next = step(rot, axis);
        if (!seen.has(key(next))) {
          seen.add(key(next));
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(24);
    expect(seen.size).toBe(ROT24_TABLE.length);
  });

  it('four turns about any axis is the identity — no drift', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      let rot = IDENTITY;
      for (let i = 0; i < 4; i++) rot = step(rot, axis);
      expect(rot).toEqual(IDENTITY);
    }
  });

  it('a step about x tips the pin axis OFF vertical — the point of the fix', () => {
    // The T-rule keeps a cube pins-up only while it is placed; a stack may
    // mount one sideways, and that state must be reachable.
    expect(step(IDENTITY, 'x').z).not.toBe('+z');
  });

  it('steps are DOCUMENT-frame (left-multiplied), like the yaw ring', () => {
    // From a tipped part, a z step turns about the world vertical — not the
    // part's own axis. Compare against the matrix directly.
    const tipped = step(IDENTITY, 'x');
    const got = rot24Matrix(step(tipped, 'z'));
    const want = new THREE.Matrix4()
      .makeRotationZ(Math.PI / 2)
      .multiply(rot24Matrix(tipped));
    // `|| 0` folds −0 into +0: deep equality distinguishes them and a 90°
    // rotation matrix is full of signed zeros.
    const round = (m: THREE.Matrix4) => m.elements.map(v => Math.round(v) || 0);
    expect(round(got)).toEqual(round(want));
  });
});

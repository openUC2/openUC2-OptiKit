/**
 * WP-131 — the parts editor must draw the fold the RECORD declares.
 *
 * Round 20's post-mortem: the overlay built its plate from
 * `Rx(mountAngle + galvoTilt)·(0,1,0)`, a fold pinned to the glyph's local
 * y–z plane, while the group's alignment quaternion left the roll about the
 * beam axis arbitrary. The drawn arm therefore had no defined relationship to
 * the declared one. For the part that triggered the round the two errors
 * cancelled and the overlay drew the MESH's true fold (+x ↔ −y) — so a
 * template declaring `reflected: -z`, which that mirror cannot physically do,
 * looked right here and got published.
 *
 * The invariant below is the one the app never had: whatever the overlay
 * draws, mapped back to the cube frame, IS `asMountedDirection`.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  baseQuatOf,
  docToThree,
  exitLocalOf,
  overlayQuatOf,
  plateFrom,
} from '../overlayFrames';
import {
  IDENTITY_INSERT_POSE,
  asMountedDirection,
  snapToAxis,
  type InsertPose,
} from '../../../model/bindRecord';
import type { Vec3 } from '../../../document';

/** The user's round-20 record: a 45° fold mirror, front −z, reflected −x. */
const PORTS = [
  { name: 'front', direction: '-z', afterSurface: null },
  { name: 'reflected', direction: '-x', afterSurface: 0 },
];
/** The entry port's FACING direction — what the overlay anchors on. */
const ENTRY_FACING: Vec3 = [0, 0, -1];

const pose = (z: string, x: string): InsertPose => ({
  rot24: { z, x } as InsertPose['rot24'],
  offsetDeg: [0, 0, 0],
  offsetMm: [0, 0, 0],
});

/** What the viewport actually shows, mapped back into cube-frame axes. */
function drawnArmAsMounted(insertPose: InsertPose, galvoDeg = 0): string {
  const base = baseQuatOf(ENTRY_FACING);
  const { reflected } = plateFrom(exitLocalOf(PORTS, base), galvoDeg);
  // Local arm → viewer, through the very quaternion the group carries.
  const viewer = reflected.clone().applyQuaternion(overlayQuatOf(base, insertPose));
  // Viewer → cube: B⁻¹, i.e. (x, y, z)three → (x, −z, y)doc.
  return snapToAxis([viewer.x, -viewer.z, viewer.y]).axis;
}

describe('the overlay draws the record, not a guess', () => {
  it('the drawn arm IS asMountedDirection — at the identity pose', () => {
    expect(drawnArmAsMounted(IDENTITY_INSERT_POSE)).toBe(
      asMountedDirection(IDENTITY_INSERT_POSE, '-x'),
    );
  });

  it('…and for the shipped pose, which the old code drew 90° away', () => {
    // {z:-x, x:+z} mounts front on +x and reflected on -z.
    const p = pose('-x', '+z');
    expect(asMountedDirection(p, '-z')).toBe('+x');
    expect(asMountedDirection(p, '-x')).toBe('-z');
    expect(drawnArmAsMounted(p)).toBe('-z');
  });

  it('…and for the pose that actually matches the mesh (+x ↔ −y)', () => {
    // The GLB's plate normal is (−0.707, +0.707, 0), so a beam entering the
    // +x face leaves along −y. Only {z:-x, x:+y} reproduces that.
    const p = pose('-x', '+y');
    expect(asMountedDirection(p, '-z')).toBe('+x');
    expect(asMountedDirection(p, '-x')).toBe('-y');
    expect(drawnArmAsMounted(p)).toBe('-y');
  });

  it('…and for every one of the 24 insert rotations', () => {
    const axes = ['+x', '-x', '+y', '-y', '+z', '-z'];
    let checked = 0;
    for (const z of axes) {
      for (const x of axes) {
        // Only the 24 orthogonal pairs are rotations; skip parallel ones.
        if (z[1] === x[1]) continue;
        const p = pose(z, x);
        expect(drawnArmAsMounted(p)).toBe(asMountedDirection(p, '-x'));
        checked += 1;
      }
    }
    expect(checked).toBe(24);
  });
});

describe('the plate itself', () => {
  it('is the bisector of entry and exit — a 45° plate for a 90° fold', () => {
    const base = baseQuatOf(ENTRY_FACING);
    const { normal } = plateFrom(exitLocalOf(PORTS, base));
    const beam = new THREE.Vector3(0, -1, 0);
    // 45° between the plate normal and the incoming beam's reverse.
    expect(THREE.MathUtils.radToDeg(normal.angleTo(beam.clone().negate()))).toBeCloseTo(45, 6);
  });

  it('a retro record gives a plate square to the beam, not a degenerate one', () => {
    const retro = [
      { name: 'front', direction: '-z', afterSurface: null },
      { name: 'reflected', direction: '-z', afterSurface: 0 },
    ];
    const base = baseQuatOf(ENTRY_FACING);
    const { normal, reflected } = plateFrom(exitLocalOf(retro, base));
    expect(normal.angleTo(new THREE.Vector3(0, 1, 0))).toBeCloseTo(0, 6);
    expect(reflected.y).toBeCloseTo(1, 6);
  });

  it('the galvo swings the arm 2θ, in the fold plane', () => {
    const base = baseQuatOf(ENTRY_FACING);
    const flat = plateFrom(exitLocalOf(PORTS, base), 0);
    const tipped = plateFrom(exitLocalOf(PORTS, base), 5);
    expect(THREE.MathUtils.radToDeg(flat.reflected.angleTo(tipped.reflected))).toBeCloseTo(10, 4);
  });

  it('with no exit port it falls back to the mount angle (hand-placed datums)', () => {
    const { normal } = plateFrom(null, 0, 45);
    expect(THREE.MathUtils.radToDeg(normal.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(45, 6);
  });
});

describe('docToThree', () => {
  it('is B = Rx(−90°): doc z becomes viewer y', () => {
    expect(docToThree([0, 0, 1])).toEqual([0, 1, -0]);
    expect(docToThree([0, 1, 0])).toEqual([0, 0, -1]);
  });
});

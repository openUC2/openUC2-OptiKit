/**
 * WP-123 — the assembly renders GLB content through the frame treaty.
 *
 * Round-18 bug: the part group's rotation is the CONJUGATION B·R24·B⁻¹
 * (right for viewer-native glyphs/ghosts), and the F3 cube mesh rendered
 * raw underneath it — at rot24 = identity the whole thing collapsed to
 * identity and the cube stood z-up in the y-up viewer ("flipped again").
 * The fix is one inner basis group on the mesh content; these tests pin
 * the decision table and the resulting end-to-end composition.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DOC_TO_THREE_QUAT, RECORD_GRID, hasWrapperRotation, meshContentQuat } from '../meshFrame';
import { ROT24_TABLE, rot24Matrix } from '../../../document/rot24';

const child = (xDeg: number) => ({
  quaternion: new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(xDeg), 0, 0),
  ),
});

describe('meshContentQuat — the decision table', () => {
  it("a declared cube mesh gets the doc→viewer basis, even if it LOOKS wrapped", () => {
    expect(meshContentQuat('cube', [child(-90)]).angleTo(DOC_TO_THREE_QUAT)).toBeCloseTo(0);
  });

  it("a declared record mesh renders as-is (already y-up)", () => {
    expect(meshContentQuat('record', []).angleTo(new THREE.Quaternion())).toBeCloseTo(0);
  });

  it('undeclared + Rx(±90°) wrapper node → as-is (no double rotation)', () => {
    expect(meshContentQuat('', [child(-90)]).angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(meshContentQuat('', [child(90)]).angleTo(new THREE.Quaternion())).toBeCloseTo(0);
  });

  it('undeclared without a wrapper → the basis (a raw F3 export)', () => {
    expect(meshContentQuat('', [child(0)]).angleTo(DOC_TO_THREE_QUAT)).toBeCloseTo(0);
    expect(meshContentQuat('', []).angleTo(DOC_TO_THREE_QUAT)).toBeCloseTo(0);
  });
});

describe('the wrapper walk (WP-132: the node is often nested)', () => {
  const node = (
    xDeg: number,
    over: { children?: unknown[]; isMesh?: boolean } = {},
  ) => ({
    quaternion: new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(xDeg), 0, 0),
    ),
    ...over,
  });

  it('finds a wrapper one level down — the real shape of 7 shipped GLBs', () => {
    // openuc2.tpl.{mirror_mount,camera_mount,laser_pointer,puzzle}_1x1 and
    // three user templates all export <unnamed>[rx=0] → child[rx=-90]. The
    // depth-1 scan called them cube-frame and applied B on top of a rotation
    // that already WAS B — a doubled basis is a 90° x-rotation.
    const scene = [node(0, { children: [node(-90, { isMesh: true })] })];
    expect(hasWrapperRotation(scene)).toBe(true);
    expect(meshContentQuat('', scene).angleTo(new THREE.Quaternion())).toBeCloseTo(0);
  });

  it('accumulates: two 45° hops are a wrapper, one is not', () => {
    expect(hasWrapperRotation([node(45, { children: [node(45, { isMesh: true })] })])).toBe(true);
    expect(hasWrapperRotation([node(45, { children: [node(0, { isMesh: true })] })])).toBe(false);
  });

  it('stops at geometry — a rotation BELOW a mesh is part authoring, not framing', () => {
    const scene = [node(0, { isMesh: true, children: [node(-90)] })];
    expect(hasWrapperRotation(scene)).toBe(false);
  });

  it('a declared frame still wins over anything the file looks like', () => {
    const wrapped = [node(0, { children: [node(-90, { isMesh: true })] })];
    expect(meshContentQuat('cube', wrapped).angleTo(DOC_TO_THREE_QUAT)).toBeCloseTo(0);
  });
});

describe('mesh-pose (WP-137: the FILE→cube correction)', () => {
  it('the record sugar IS the grid {z:−y, x:+x} — bit-identical transforms', () => {
    const sugar = meshContentQuat('record', []);
    const pose = meshContentQuat('', [], RECORD_GRID);
    expect(pose.angleTo(sugar)).toBeCloseTo(0, 9);
  });

  it('identity grid reproduces the cube frame', () => {
    expect(meshContentQuat('', [], ['+z', '+x']).angleTo(DOC_TO_THREE_QUAT)).toBeCloseTo(0, 9);
  });

  it('a declared pose WINS over sugar, sniff, everything', () => {
    const wrapped = [
      { quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)) },
    ];
    // The file says wrapper (would sniff to identity), the sugar says record
    // (identity) — the pose says identity grid, i.e. plain cube: B wins.
    expect(
      meshContentQuat('record', wrapped, ['+z', '+x']).angleTo(DOC_TO_THREE_QUAT),
    ).toBeCloseTo(0, 9);
  });

  it('a 90° x-correction turns file −y into up — the flipped-export case', () => {
    // File exported with pins along −y (wrong): the correction {z:?} that
    // sends file −y to cube +z is a +90° rotation about cube x applied to
    // the record map… the user just presses x↻90° until the pins stand up;
    // here we assert the resulting transform actually does it.
    const q = meshContentQuat('', [], ['+y', '+x']); // file +z→cube +y, +x→+x
    const pins = new THREE.Vector3(0, -1, 0).applyQuaternion(q); // file −y
    expect(pins.y).toBeCloseTo(1, 6); // viewer up = doc/cube +z
  });
});

describe('the end-to-end composition (treaty §4b)', () => {
  it('shell conjugation ∘ content basis = B·R24 — the bind-view transform — for all 24', () => {
    const B = DOC_TO_THREE_QUAT.clone();
    const Binv = B.clone().invert();
    for (const { name } of ROT24_TABLE) {
      const r24 = new THREE.Quaternion().setFromRotationMatrix(rot24Matrix(name));
      // What AssemblyScene renders: outer part group (conjugated, as
      // docQuatToThree in mapping.ts produces) times the inner content group.
      const outer = B.clone().multiply(r24).multiply(Binv);
      const rendered = outer.multiply(meshContentQuat('cube', []));
      // What the treaty (and the bind workbench) says F3 content should get.
      const expected = B.clone().multiply(r24);
      expect(rendered.angleTo(expected)).toBeCloseTo(0, 6);
    }
  });

  it('at rot24 = identity the cube is NOT identity — it stands pins-up (the round-18 bug)', () => {
    // The old code rendered identity here (basis cancelled); the treaty
    // demands the plain doc→viewer basis, i.e. F3 +z (pins) → viewer +y.
    const rendered = meshContentQuat('cube', []);
    const pins = new THREE.Vector3(0, 0, 1).applyQuaternion(rendered);
    expect(pins.y).toBeCloseTo(1, 6);
  });
});

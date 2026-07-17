/**
 * WP-19 (+WP-31): datum → record mapping. Datums live in the PART frame and
 * travel through the mesh placement into cube-frame record frames/ports;
 * assets ship with the file map; binding to an existing component skips the
 * stub. The generated trio must follow the library conventions — the
 * committed fixture is validated against optikit-core `library validate`.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AXIS_SNAP_WARN_DEG,
  bindToRecords,
  cubeToDatum,
  datumToCube,
  recordsToFiles,
  snapToAxis,
  threePoseToMeshTransform,
  type BindInput,
} from '../bindRecord';

function laserInput(): BindInput {
  return {
    namespace: 'user',
    name: 'laser-pointer',
    category: 'source',
    templateClass: 'fixed',
    meshFile: 'laser-housing.step',
    meshTransform: { positionMm: [0, 0, -5], rotationDeg: [0, 0, 90] },
    datums: [
      {
        id: 'd1',
        name: 'out',
        kind: 'source',
        pointMm: [0, 0, 20],
        direction: [0, 0, 1],
        areaDiameterMm: 3,
      },
    ],
  };
}

describe('snapToAxis', () => {
  it('picks the dominant principal axis with the deviation', () => {
    expect(snapToAxis([0, 0, 1])).toMatchObject({ axis: '+z', deviationDeg: 0 });
    expect(snapToAxis([-1, 0, 0]).axis).toBe('-x');
    const tilted = snapToAxis([0.05, 0, 1]);
    expect(tilted.axis).toBe('+z');
    expect(tilted.deviationDeg).toBeGreaterThan(AXIS_SNAP_WARN_DEG);
  });
});

describe('datum frame math (WP-31: datums follow the part)', () => {
  it('rotating the part 90° about z carries an x-offset datum to +y', () => {
    const t = { positionMm: [0, 0, 0] as [number, number, number], rotationDeg: [0, 0, 90] as [number, number, number] };
    const world = datumToCube({ pointMm: [10, 0, 0], direction: [1, 0, 0] }, t);
    expect(world.pointMm[0]).toBeCloseTo(0, 6);
    expect(world.pointMm[1]).toBeCloseTo(10, 6);
    expect(world.direction[1]).toBeCloseTo(1, 6);
  });

  it('cubeToDatum is the exact inverse of datumToCube', () => {
    const t = { positionMm: [3, -4, 5] as [number, number, number], rotationDeg: [10, 20, 30] as [number, number, number] };
    const part = { pointMm: [7, 8, -9] as [number, number, number], direction: [0, 0, 1] as [number, number, number] };
    const world = datumToCube(part, t);
    const back = cubeToDatum(world.pointMm, world.direction, t);
    back.pointMm.forEach((v, i) => expect(v).toBeCloseTo(part.pointMm[i], 6));
    back.direction.forEach((v, i) => expect(v).toBeCloseTo(part.direction[i], 6));
  });
});

describe('bindToRecords', () => {
  it('maps the part-frame datum through the placement into cube-frame frames + ports', () => {
    const bound = bindToRecords(laserInput());
    expect(bound.warnings).toEqual([]);
    const optics = bound.component!.optics as {
      frames: Record<string, Record<string, number>>;
      ports: Record<string, { frame: string; direction: string }>;
    };
    // Part-frame [0,0,20] through the placement (z −5, yaw 90) → cube z 15.
    expect(optics.frames.out).toEqual({ 'z-mm': 15 });
    expect(optics.ports.out).toEqual({ frame: 'out', direction: '+z' });
    expect(bound.component!.id).toBe('user.source.laser-pointer');
    expect(bound.component!.category).toBe('source');
  });

  it('binding to an EXISTING component skips the stub and refs it (WP-31)', () => {
    const input = laserInput();
    input.existingComponent = { id: 'thorlabs.lens.ac254-050-a', version: '0.1.0' };
    const bound = bindToRecords(input);
    expect(bound.component).toBeNull();
    expect((bound.module as { component: string }).component).toBe(
      'thorlabs.lens.ac254-050-a@^0.1',
    );
    // Template still carries the datum-derived optical ports.
    const tplPorts = (bound.template as { optical_ports: Record<string, unknown> }).optical_ports;
    expect(Object.keys(tplPorts)).toEqual(['out']);
  });

  it('puts the placement transform on the template as mesh-offset', () => {
    const bound = bindToRecords(laserInput());
    const template = bound.template as Record<string, unknown>;
    expect(template.step).toBe('laser-housing.step'); // source of truth
    expect(template.glb).toBe('laser-housing.glb'); // derived render copy
    expect(template['mesh-offset']).toEqual({
      'x-mm': 0, 'y-mm': 0, 'z-mm': -5,
      'rot-deg': { x: 0, y: 0, z: 90 },
    });
    expect((bound.module as { component: string }).component).toBe(
      'user.source.laser-pointer@^0.1',
    );
  });

  it('warns on off-axis datums and reflective parts get a fold fragment', () => {
    const input = laserInput();
    input.category = 'mirror';
    input.meshTransform = { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] };
    input.datums = [
      {
        id: 'd1', name: 'front', kind: 'reflective',
        pointMm: [0, 0, 0], direction: [0.1, 0, -1], areaDiameterMm: 25,
      },
    ];
    const bound = bindToRecords(input);
    expect(bound.warnings.join()).toMatch(/off the -z axis/);
    const fragment = (bound.component!.optics as { fragment: { surfaces: unknown[] } }).fragment;
    expect(fragment.surfaces).toHaveLength(1);
  });

  it('emits the library-PR file layout WITH the mesh assets (WP-31)', () => {
    const step = new Uint8Array([1, 2, 3]);
    const glb = new Uint8Array([4, 5, 6]);
    const files = recordsToFiles(bindToRecords(laserInput()), 'laser-housing.step', {
      step, glb, thumbnailPng: new Uint8Array([7]),
    });
    expect(Object.keys(files).sort()).toEqual([
      'components/user.source.laser-pointer/component.yml',
      'modules/user.cube.laser-pointer/module.yml',
      'templates/user.tpl.laser-pointer/laser-housing.glb',
      'templates/user.tpl.laser-pointer/laser-housing.step',
      'templates/user.tpl.laser-pointer/template.yml',
      'templates/user.tpl.laser-pointer/thumbnail.png',
    ]);
    expect(files['templates/user.tpl.laser-pointer/laser-housing.step']).toBe(step);
    expect(files['components/user.source.laser-pointer/component.yml']).toContain('z-mm: 15');
  });
});

describe('threePoseToMeshTransform (WP-33: the gizmo commit math)', () => {
  it('decomposes a dragged three-space pose back to the doc-frame transform', () => {
    // Simulate the drag the bug used to lose: +20mm doc-x, −5mm doc-y (three
    // z = −doc y), and a 90° yaw about doc z (three y).
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const t = threePoseToMeshTransform({ x: 20, y: 0, z: 5 }, q);
    expect(t.positionMm).toEqual([20, -5, 0]);
    expect(t.rotationDeg[2]).toBeCloseTo(90, 4);
    expect(t.rotationDeg[0]).toBeCloseTo(0, 4);
    expect(t.rotationDeg[1]).toBeCloseTo(0, 4);
  });

  it('is the inverse of the PartMesh quaternion composition', () => {
    // The same composition PartMesh renders from a stored transform:
    const rot: [number, number, number] = [10, 20, 30]; // doc extrinsic ZXY
    const [rx, ry, rz] = rot.map(v => (v * Math.PI) / 180);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rz);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), ry);
    const q = qz.clone().multiply(qx).multiply(qy);
    const t = threePoseToMeshTransform({ x: 1, y: 2, z: 3 }, q);
    t.rotationDeg.forEach((v, i) => expect(v).toBeCloseTo(rot[i], 1));
    expect(t.positionMm).toEqual([1, -3, 2]);
  });
});

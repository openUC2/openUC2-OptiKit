/**
 * WP-19/31, re-founded on the frame treaty in WP-116: the binding authors
 * the F3 side of the trio — the template's insert-pose, its posed frames,
 * and the record's ports as mounted. Component optics are NEVER derived
 * from geometry (no stub component, no click→port reflection law, no
 * mesh-offset): the record speaks F2 and ships verbatim.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AXIS_SNAP_WARN_DEG,
  IDENTITY_INSERT_POSE,
  asMountedDirection,
  bindToRecords,
  cubeToDatum,
  datumToCube,
  posePoint,
  recordsToFiles,
  snapToAxis,
  threePoseToMeshTransform,
  type BindInput,
  type InsertPose,
} from '../bindRecord';

/** The 45° mirror of round 16: record frame front:-z, reflected:-x. */
const MIRROR_PORTS = [
  { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
  { name: 'reflected', frame: 'optical', direction: '-x', afterSurface: 0 },
];

/** Optical axis (record +z) mounted along the cube's +x. */
const POSE_Z_TO_X: InsertPose = {
  rot24: { z: '+x', x: '-z' },
  offsetDeg: [0, 0, 0],
  offsetMm: [0, 0, 0],
};

function mirrorInput(over: Partial<BindInput> = {}): BindInput {
  return {
    namespace: 'user',
    name: 'mirr-test',
    category: 'mirror',
    templateClass: 'fixed',
    meshFile: 'cube.glb',
    meshTransform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
    datums: [],
    wholeModule: true,
    insertPose: { ...IDENTITY_INSERT_POSE },
    recordFrames: { optical: [0, 0, 0] },
    recordPorts: MIRROR_PORTS,
    ...over,
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

describe('the insert pose (WP-116)', () => {
  it('carries record-frame points into the cube frame', () => {
    // Optical axis onto +x: the frame at record z=10 lands at cube x=10.
    expect(posePoint(POSE_Z_TO_X, [0, 0, 10]).map(Math.round)).toEqual([10, 0, 0]);
    // Translation adds on top.
    const shifted = { ...POSE_Z_TO_X, offsetMm: [0, 0, -5] as [number, number, number] };
    expect(posePoint(shifted, [0, 0, 10]).map(Math.round)).toEqual([10, 0, -5]);
  });

  it('mounts port directions through the pose, snapped to axis literals', () => {
    // Record front faces -z; with +z→+x the mounted front faces -x.
    expect(asMountedDirection(POSE_Z_TO_X, '-z')).toBe('-x');
    // The fold arm (-x in F2) lands on +z.
    expect(asMountedDirection(POSE_Z_TO_X, '-x')).toBe('+z');
  });

  it('template frames = pose ∘ record frames; the pose itself is emitted', () => {
    const bound = bindToRecords(
      mirrorInput({
        insertPose: POSE_Z_TO_X,
        recordFrames: { optical: [0, 0, 10] },
      }),
    );
    expect(bound.errors).toEqual([]);
    const frames = bound.template.frames as Record<string, Record<string, number>>;
    expect(frames.optical['x-mm']).toBeCloseTo(10, 3);
    expect(frames.optical['z-mm']).toBeCloseTo(0, 3);
    const pose = bound.template['insert-pose'] as {
      rotation: { grid: { z: string; x: string } };
    };
    expect(pose.rotation.grid).toEqual({ z: '+x', x: '-z' });
    // Ports as mounted: front -z → -x.
    const ports = bound.template.optical_ports as Record<string, { direction: unknown }>;
    expect(ports.front.direction).toBe('-x');
    expect(ports.reflected.direction).toBe('+z');
  });

  it('warns when the mounted fold leaves the baseplate plane (WP-129)', () => {
    // Round 19's published mirror: front lands on +x, but the reflected arm
    // lands on the PIN axis — the beam would exit through the cube's floor.
    // The GLB's plate is tilted about z (it folds x↔y), so the pose is
    // rolled 90° about the entry axis.
    const bound = bindToRecords(
      mirrorInput({
        // record front -z, reflected -x; pose +z→-x puts front on +x and the
        // fold arm on -z.
        insertPose: { rot24: { z: '-x', x: '+z' }, offsetDeg: [0, 0, 0], offsetMm: [0, 0, 0] },
      }),
    );
    const ports = bound.template.optical_ports as Record<string, { direction: unknown }>;
    expect(ports.front.direction).toBe('+x');
    expect(ports.reflected.direction).toBe('-z');
    // WP-133: the axis names its frame — the viewport draws that direction
    // pointing down and its triad used to call it "y".
    expect(
      bound.warnings.some(
        w => w.includes('(cube)') && w.includes('pin axis') && w.includes('roll the insert pose'),
      ),
    ).toBe(true);
    // It stays a warning — a periscope cube is a real part, and this string
    // test cannot see whether the MESH can fold that way.
    expect(bound.errors).toEqual([]);
  });

  it('warns for either sign — +z is the pin axis just as much as −z', () => {
    const bound = bindToRecords(mirrorInput({ insertPose: POSE_Z_TO_X }));
    const ports = bound.template.optical_ports as Record<string, { direction: unknown }>;
    expect(ports.reflected.direction).toBe('+z');
    expect(bound.warnings.some(w => w.includes('pin axis'))).toBe(true);
  });

  it('says nothing for the pose that actually matches the mesh (+x ↔ −y)', () => {
    // The GLB's plate normal is (−0.707, +0.707, 0): a beam into the +x face
    // leaves along −y, in the baseplate plane. This is the pose round 20
    // should have used, and it must draw no complaint at all.
    const bound = bindToRecords(
      mirrorInput({
        insertPose: { rot24: { z: '-x', x: '+y' }, offsetDeg: [0, 0, 0], offsetMm: [0, 0, 0] },
      }),
    );
    const ports = bound.template.optical_ports as Record<string, { direction: unknown }>;
    expect(ports.front.direction).toBe('+x');
    expect(ports.reflected.direction).toBe('-y');
    expect(bound.warnings.some(w => w.includes('pin axis'))).toBe(false);
  });

  it('never emits a component — the record ships verbatim from the caller', () => {
    expect(bindToRecords(mirrorInput()).component).toBeNull();
    expect(
      bindToRecords(
        mirrorInput({ existingComponent: { id: 'openuc2.mirror.flat_45', version: '1.0.0' } }),
      ).component,
    ).toBeNull();
  });

  it('refuses a rotated mesh with a sentence — the cube frame is the reference', () => {
    const bound = bindToRecords(
      mirrorInput({ meshTransform: { positionMm: [0, 0, 0], rotationDeg: [-89.9, -135, -45] } }),
    );
    expect(bound.errors.some(e => e.includes('rotate') && e.includes('insert pose'))).toBe(true);
  });

  it('mesh-offset is retired — nothing writes the dead field', () => {
    const bound = bindToRecords(
      mirrorInput({ meshTransform: { positionMm: [1, 2, 3], rotationDeg: [0, 0, 0] } }),
    );
    expect(bound.template['mesh-offset']).toBeUndefined();
    // A translation is view alignment only — warned, not recorded.
    expect(bound.warnings.some(w => w.includes('translated'))).toBe(true);
  });
});

describe('legacy datum road (housing / expert tab)', () => {
  const laser = (): BindInput => ({
    namespace: 'user',
    name: 'laser-pointer',
    category: 'source',
    templateClass: 'fixed',
    meshFile: 'laser-housing.step',
    meshTransform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
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
    recordPorts: [{ name: 'out', frame: 'optical', direction: '+z', afterSurface: null }],
    housingOnly: true,
  });

  it('emits the housing template (footprint null, component ref), NO module', () => {
    const bound = bindToRecords(laser());
    expect(bound.errors).toEqual([]);
    expect(bound.module).toBeNull();
    expect(bound.template.footprint_grid).toBeNull();
    expect(bound.template.component).toBe('user.source.laser-pointer@^0.1');
  });

  it('ports come from the RECORD — a datum never becomes a port', () => {
    const bound = bindToRecords(laser());
    const ports = bound.template.optical_ports as Record<string, { direction: unknown }>;
    expect(Object.keys(ports)).toEqual(['out']);
    expect(ports.out.direction).toBe('+z');
  });

  it('a pose-less, datum-less whole-module warns that verify-t1 will be vacuous', () => {
    const bound = bindToRecords(
      mirrorInput({ insertPose: null, recordFrames: undefined, datums: [] }),
    );
    expect(bound.warnings.some(w => w.includes('vacuous'))).toBe(true);
  });
});

describe('dead-record guard (WP-77)', () => {
  it('refuses class generative — no generator block can ever be emitted here', () => {
    const bound = bindToRecords(mirrorInput({ templateClass: 'generative' }));
    expect(bound.errors.some(e => e.includes('generator'))).toBe(true);
  });

  it('refuses class adaptive — zero DOFs degrade to free movement', () => {
    const bound = bindToRecords(mirrorInput({ templateClass: 'adaptive' }));
    expect(bound.errors.some(e => e.includes('DOF'))).toBe(true);
  });

  it('T1 fixed stays error-free', () => {
    expect(bindToRecords(mirrorInput()).errors).toEqual([]);
  });
});

describe('file layout (WP-31)', () => {
  it('emits the library-PR file map WITH the mesh assets, and no component', () => {
    const bound = bindToRecords(mirrorInput());
    const files = recordsToFiles(bound, 'cube.glb', {
      glb: new Uint8Array([1, 2, 3]),
    });
    const paths = Object.keys(files);
    expect(paths).toContain('templates/user.tpl.mirr-test/template.yml');
    expect(paths).toContain('modules/user.cube.mirr-test/module.yml');
    expect(paths.some(p => p.endsWith('.glb'))).toBe(true);
    // No component file — the caller owns the record (F2, verbatim).
    expect(paths.some(p => p.startsWith('components/'))).toBe(false);
  });

  it('falls back to the real 55 mm cube pitch, not 50', () => {
    const bound = bindToRecords(mirrorInput({ envelopeMm: undefined }));
    expect((bound.template.envelope as Record<string, number>)['z-mm']).toBe(55);
  });
});

describe('frame conversions (WP-31/33)', () => {
  it('datumToCube round-trips through cubeToDatum', () => {
    const t = {
      positionMm: [1, 2, 3] as [number, number, number],
      rotationDeg: [0, 90, 0] as [number, number, number],
    };
    const datum = {
      pointMm: [5, 0, 0] as [number, number, number],
      direction: [0, 0, 1] as [number, number, number],
    };
    const cube = datumToCube(datum, t);
    const back = cubeToDatum(cube.pointMm, cube.direction, t);
    expect(back.pointMm.map(v => Math.round(v * 1e6) / 1e6 || 0)).toEqual(datum.pointMm);
    expect(back.direction.map(v => Math.round(v * 1e6) / 1e6 || 0)).toEqual(datum.direction);
  });

  it('threePoseToMeshTransform inverts the doc→three basis change', () => {
    const t = threePoseToMeshTransform({ x: 1, y: 3, z: -2 }, new THREE.Quaternion());
    expect(t.positionMm.map(v => v || 0)).toEqual([1, 2, 3]);
    expect(t.rotationDeg.map(v => v || 0)).toEqual([0, 0, 0]);
  });
});

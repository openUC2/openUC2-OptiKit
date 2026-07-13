/**
 * .dsn conversion round trips (WP-12 acceptance):
 *  - golden fixtures from optikit-core parse and flatten correctly,
 *  - a document snapshot exports to a DesignDecl and re-imports semantically
 *    identically (poses, orientations, DOF values, paths),
 *  - YAML serialize/parse is lossless at the data level.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DocPart, DocSnapshot } from '../../../document';
import { designToParts, snapshotToDesign } from '../convert';
import { parseDesign, serializeDesign } from '../io';

const FIXTURES = join(__dirname, 'fixtures');

function fixture(name: string) {
  return parseDesign(readFileSync(join(FIXTURES, `${name}.yml`), 'utf8'));
}

describe('golden fixture import', () => {
  it('parses and flattens fluo-scope with dof values and paths', () => {
    const imported = designToParts(fixture('fluo-scope.dsn'));
    const byKey = Object.fromEntries(imported.parts.map(p => [p.key, p]));

    // Anchors: objective(z+1 cell, −5mm focus) and dichroic(z+2, fixed) hang off
    // the sample reference; tube-lens/camera stack above the dichroic.
    expect(byKey['objective'].positionMm).toEqual([0, 0, 50]); // 55 − 5
    expect(byKey['dichroic'].positionMm).toEqual([0, 0, 110]);
    expect(byKey['tube-lens'].positionMm).toEqual([0, 0, 220]);
    expect(byKey['camera'].positionMm).toEqual([0, 0, 330]);
    expect(byKey['laser'].positionMm).toEqual([-100, 0, 110]);

    expect(byKey['objective'].dofValues).toEqual({ dz: 1.85 });
    expect(byKey['laser'].rot24).toEqual({ z: '+x', x: '-z' });

    const emission = imported.paths.find(p => p.name === 'emission');
    expect(emission?.chain.map(c => `${c.key}.${c.port}`)).toEqual([
      'sample.plane',
      'objective.front>back',
      'dichroic.reflected>transmitted',
      'tube-lens.front>back',
      'camera.sensor',
    ]);
  });

  it('flattens relative and absolute anchor variants to identical world poses', () => {
    const rel = designToParts(fixture('simple-rel-transl-anchors.dsn'));
    const abs = designToParts(fixture('simple-abs-transl-anchors.dsn'));
    const relByKey = Object.fromEntries(rel.parts.map(p => [p.key, p.positionMm]));
    const absByKey = Object.fromEntries(abs.parts.map(p => [p.key, p.positionMm]));
    expect(Object.keys(relByKey).sort()).toEqual(Object.keys(absByKey).sort());
    for (const key of Object.keys(relByKey)) {
      expect(relByKey[key], key).toEqual(absByKey[key]);
    }
  });

  it('imports cube-skeleton primitives with their grid rotations', () => {
    const imported = designToParts(fixture('cube-skeleton.dsn'));
    const upper = imported.parts.find(p => p.key === 'upper-half');
    expect(upper?.rot24).toEqual({ z: '-z', x: '+x' });
    expect(upper?.libraryRef).toBe('PRT - 1003 - CUBHLF111 - V04.stp');
  });
});

// ── snapshot export → import round trip ────────────────────────────────────────

function part(over: Partial<DocPart> & { id: string; ref: string }): DocPart {
  return {
    category: 'lens',
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1], yawDeg: 0 },
    gridPose: { cell: [0, 0, 0], rot24: { z: '+z', x: '+x' }, offsetMm: [0, 0, 0], residualYawDeg: 0 },
    libraryRef: 'lens-pos-1x1',
    dofs: [],
    params: {},
    ...over,
  };
}

const SNAPSHOT: DocSnapshot = {
  meta: { name: 'demo scope', description: 'export round-trip fixture' },
  parts: [
    part({
      id: 'id-laser',
      ref: 'Laser 488',
      category: 'source',
      libraryRef: 'laser-488nm',
      gridPose: { cell: [-2, 0, 0], rot24: { z: '+x', x: '-z' }, offsetMm: [0, 0, 0], residualYawDeg: 0 },
      worldPose: { positionMm: [-100, 0, 0], rotation: [0, 0, 0, 1], yawDeg: 0 },
    }),
    part({
      id: 'id-lens',
      ref: 'Objective',
      gridPose: {
        cell: [1, 3, 2],
        rot24: { z: '+z', x: '+y' },
        offsetMm: [1.5, 0, -2.25],
        residualYawDeg: -13,
      },
      worldPose: { positionMm: [51.5, 150, 107.75], rotation: [0, 0, 0, 1], yawDeg: 0 },
      dofs: [{ name: 'dz', range: [-7.5, 7.5], unit: 'mm', value: 1.85 }],
    }),
    part({
      id: 'id-cam',
      ref: 'Camera',
      category: 'detector',
      libraryRef: 'camera-1x1',
      gridPose: { cell: [4, 3, 2], rot24: { z: '+z', x: '-x' }, offsetMm: [0, 0, 0], residualYawDeg: 0 },
      worldPose: { positionMm: [200, 150, 110], rotation: [0, 0, 0, 1], yawDeg: 0 },
    }),
  ],
  paths: [
    { name: 'main', chain: ['id-laser.out', 'id-lens.front', 'id-cam.sensor'] },
  ],
};

describe('snapshot → design → parts round trip', () => {
  const { design, keyByPartId } = snapshotToDesign(SNAPSHOT);
  const reimported = designToParts(design);

  it('carries metadata and produces one component per part', () => {
    expect(design.design?.name).toBe('demo scope');
    expect(Object.keys(design.components ?? {})).toHaveLength(3);
    expect(reimported.warnings).toEqual([]);
  });

  it('reproduces every pose exactly (cell × pitch + residual offset)', () => {
    for (const original of SNAPSHOT.parts) {
      const key = keyByPartId[original.id];
      const back = reimported.parts.find(p => p.key === key);
      expect(back, key).toBeDefined();
      const expected = [
        original.gridPose.cell[0] * 50 + original.gridPose.offsetMm[0],
        original.gridPose.cell[1] * 50 + original.gridPose.offsetMm[1],
        original.gridPose.cell[2] * 55 + original.gridPose.offsetMm[2],
      ];
      back!.positionMm.forEach((v, i) => expect(v, `${key}[${i}]`).toBeCloseTo(expected[i], 6));
      expect(back!.rot24).toEqual(original.gridPose.rot24);
      expect(back!.residualYawDeg).toBeCloseTo(original.gridPose.residualYawDeg, 6);
    }
  });

  it('carries DOF values into instantiation.dof_values and back', () => {
    const key = keyByPartId['id-lens'];
    expect(design.instantiation?.dof_values?.[`${key}.dz`]).toBe(1.85);
    expect(reimported.parts.find(p => p.key === key)?.dofValues).toEqual({ dz: 1.85 });
  });

  it('re-keys path chains to component keys and back', () => {
    const main = reimported.paths.find(p => p.name === 'main');
    expect(main?.chain).toEqual([
      { key: keyByPartId['id-laser'], port: 'out' },
      { key: keyByPartId['id-lens'], port: 'front' },
      { key: keyByPartId['id-cam'], port: 'sensor' },
    ]);
  });

  it('YAML serialize/parse is lossless for the exported design', () => {
    expect(parseDesign(serializeDesign(design))).toEqual(design);
  });
});

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
    gridPose: { cell: [0, 0, 0], rot24: { z: '+z', x: '+x' }, offsetMm: [0, 0, 0], offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0 },
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
      gridPose: { cell: [-2, 0, 0], rot24: { z: '+x', x: '-z' }, offsetMm: [0, 0, 0], offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0 },
      worldPose: { positionMm: [-100, 0, 0], rotation: [0, 0, 0, 1], yawDeg: 0 },
    }),
    part({
      id: 'id-lens',
      ref: 'Objective',
      gridPose: {
        cell: [1, 3, 2],
        rot24: { z: '+z', x: '+y' },
        offsetMm: [1.5, 0, -2.25],
        offsetDeg: { x: 0, y: 0, z: -13 }, residualYawDeg: -13,
      },
      worldPose: { positionMm: [51.5, 150, 107.75], rotation: [0, 0, 0, 1], yawDeg: 0 },
      dofs: [{ name: 'dz', range: [-7.5, 7.5], unit: 'mm', value: 1.85 }],
    }),
    part({
      id: 'id-cam',
      ref: 'Camera',
      category: 'detector',
      libraryRef: 'camera-1x1',
      gridPose: { cell: [4, 3, 2], rot24: { z: '+z', x: '-x' }, offsetMm: [0, 0, 0], offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0 },
      worldPose: { positionMm: [200, 150, 110], rotation: [0, 0, 0, 1], yawDeg: 0 },
    }),
  ],
  paths: [
    { name: 'main', chain: ['id-laser.out', 'id-lens.front', 'id-cam.sensor'] },
  ],
};

// ── WP-32: palette parts export their catalog optics ──────────────────────────

describe('palette optics enrichment (WP-32)', () => {
  const componentOf = (p: DocPart) => {
    const { design, keyByPartId } = snapshotToDesign({
      meta: { name: 't', description: '' },
      parts: [p],
      paths: [],
    });
    return design.components![keyByPartId[p.id]]!;
  };

  it('a palette lens exports a thin-lens fragment + front/back ports', () => {
    const comp = componentOf(
      part({ id: 'l', ref: 'Lens', category: 'lens', libraryRef: 'lens-pos-1x1',
             params: { focalLength: 100 } } as Partial<DocPart> & { id: string; ref: string }),
    );
    expect(comp.category).toBe('lens');
    const optics = comp.optics!;
    const surfaces = (optics.fragment as { surfaces: { geometry: { radius: number } }[] }).surfaces;
    expect(surfaces).toHaveLength(2);
    // R = 2·f·(n−1) with n = 1.5168 → ±103.36 for f = 100.
    expect(surfaces[0].geometry.radius).toBeCloseTo(103.36, 2);
    expect(surfaces[1].geometry.radius).toBeCloseTo(-103.36, 2);
    const ports = optics.ports as Record<string, { direction: string; 'after-surface'?: number }>;
    expect(ports.front.direction).toBe('-x');
    expect(ports.back['after-surface']).toBe(1);
  });

  it('a palette mirror exports a reflective flat with the fold ports', () => {
    const comp = componentOf(
      part({ id: 'm', ref: 'Mirror', category: 'mirror', libraryRef: 'mirror-1x1' }),
    );
    const optics = comp.optics!;
    const surfaces = (optics.fragment as {
      surfaces: { interaction_model: { is_reflective: boolean } }[];
    }).surfaces;
    expect(surfaces[0].interaction_model.is_reflective).toBe(true);
    const ports = optics.ports as Record<string, { direction: string; 'after-surface'?: number }>;
    expect(ports.reflected).toEqual({ frame: 'optical', direction: '-y', 'after-surface': 0 });
  });

  it('filters export as passthrough; sources export their emit port', () => {
    const filter = componentOf(
      part({ id: 'f', ref: 'Filter', category: 'filter', libraryRef: 'filter-bandpass' }),
    );
    expect(filter.optics!.passthrough).toBe(true);
    expect(filter.optics!.fragment).toBeUndefined();

    const laser = componentOf(
      part({ id: 's', ref: 'Laser', category: 'source', libraryRef: 'laser-405nm' }),
    );
    expect(laser.category).toBe('source');
    const ports = laser.optics!.ports as Record<string, { direction: string }>;
    expect(Object.keys(ports)).toEqual(['out']); // E_BAD_PORT at laser.out: gone
    expect(ports.out.direction).toBe('+x');
  });
});

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
      expect(back!.offsetDeg.x).toBeCloseTo(original.gridPose.offsetDeg.x, 6);
      expect(back!.offsetDeg.y).toBeCloseTo(original.gridPose.offsetDeg.y, 6);
      expect(back!.offsetDeg.z).toBeCloseTo(original.gridPose.offsetDeg.z, 6);
    }
  });

  it('round-trips a tilted mirror: full offset-deg triple, no warnings (WP-28)', () => {
    const tilted: DocSnapshot = {
      meta: { name: 'tilt', description: '' },
      parts: [
        part({
          id: 'id-mirror',
          ref: 'Fold Mirror',
          category: 'mirror',
          libraryRef: 'mirror-1x1',
          gridPose: {
            cell: [1, 0, 0],
            rot24: { z: '+z', x: '+y' },
            offsetMm: [0, 0, 0],
            offsetDeg: { x: 2, y: -0.75, z: -13 },
            residualYawDeg: -13,
          },
        }),
      ],
      paths: [],
    };
    const { design: d, keyByPartId: keys } = snapshotToDesign(tilted);
    const comp = d.components?.[keys['id-mirror']];
    expect(comp?.pose?.rotation?.['offset-deg']).toEqual({ x: 2, y: -0.75, z: -13 });

    const back = designToParts(d);
    expect(back.warnings).toEqual([]); // x/y tilts import exactly — nothing dropped
    const mirror = back.parts.find(p => p.key === keys['id-mirror']);
    expect(mirror?.offsetDeg.x).toBeCloseTo(2, 6);
    expect(mirror?.offsetDeg.y).toBeCloseTo(-0.75, 6);
    expect(mirror?.offsetDeg.z).toBeCloseTo(-13, 6);
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

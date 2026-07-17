/**
 * WP-15: the merged service export — retained source design + live document.
 *
 * The store cannot represent optics/template/dof blocks or location
 * components; these tests pin that the merge keeps them while the live
 * document wins on poses, DOF values, additions, and deletions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocPart, DocSnapshot } from '../../../document';
import { useSourceDesignStore } from '../../../document/sourceDesignStore';
import {
  buildServiceDesign,
  listPartMechanics,
  listRangedDofs,
  serviceFiles,
} from '../serviceExport';
import { parseDesign } from '../io';

const FLUO_YAML = readFileSync(
  join(__dirname, 'fixtures', 'fluo-scope.dsn.yml'),
  'utf8',
);

/** Minimal DocPart for merge purposes (only gridPose/dofs/ids are consumed). */
function makePart(
  key: string,
  cell: [number, number, number],
  over: Partial<DocPart> = {},
): DocPart {
  return {
    id: `p-${key}`,
    ref: key,
    category: 'other',
    libraryRef: `glb-${key}`,
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1] },
    gridPose: {
      cell,
      offsetMm: [0, 0, 0],
      rot24: { z: '+z', x: '+x' },
      offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0,
    },
    dofs: [],
    params: {},
    ...over,
  } as DocPart;
}

/** The fluo-scope parts as the importer would place them. */
function fluoSnapshot(): DocSnapshot {
  const parts = [
    makePart('laser', [-2, 0, 2]),
    makePart('excitation-filter', [-1, 0, 2]),
    makePart('dichroic', [0, 0, 2]),
    makePart('objective', [0, 0, 1], {
      gridPose: {
        cell: [0, 0, 1],
        offsetMm: [0, 0, -5],
        rot24: { z: '+z', x: '+x' },
        offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0,
      },
      dofs: [{ name: 'dz', range: null, unit: 'mm', value: 1.85 }],
    }),
    makePart('tube-lens', [0, 0, 4]),
    makePart('camera', [0, 0, 6]),
  ];
  return {
    parts,
    paths: [
      {
        name: 'excitation',
        chain: [
          'p-laser.out',
          'p-excitation-filter.front>back',
          'p-dichroic.front>reflected',
          'p-objective.back>front',
        ],
      },
      {
        name: 'emission',
        chain: [
          'p-objective.front>back',
          'p-dichroic.reflected>transmitted',
          'p-tube-lens.front>back',
          'p-camera.sensor',
        ],
      },
    ],
    meta: { name: 'fluo-scope', description: '' },
  };
}

function seedSource() {
  useSourceDesignStore.getState().setSource(
    FLUO_YAML,
    Object.fromEntries(
      ['laser', 'excitation-filter', 'dichroic', 'objective', 'tube-lens', 'camera'].map(
        k => [`p-${k}`, k],
      ),
    ),
  );
}

beforeEach(() => {
  useSourceDesignStore.getState().clear();
});

describe('buildServiceDesign with a retained source', () => {
  it('keeps optics blocks and location components the store cannot hold', () => {
    seedSource();
    const { design } = buildServiceDesign(fluoSnapshot());
    expect(design.components?.objective?.optics?.fragment?.surfaces).toHaveLength(2);
    expect(design.components?.objective?.dof?.[0]?.name).toBe('dz');
    // `sample` is a location — never placed as a part, must survive the merge.
    expect(design.components?.sample?.type).toBe('location');
  });

  it('overrides poses with the live absolute grid pose (anchors dropped)', () => {
    seedSource();
    const snap = fluoSnapshot();
    const objective = snap.parts.find(p => p.id === 'p-objective')!;
    objective.gridPose.offsetMm = [0, 0, -3]; // user moved the focus stage
    const { design } = buildServiceDesign(snap);
    const pose = design.components?.objective?.pose;
    expect(pose?.translation?.anchor).toBeUndefined();
    expect(pose?.translation?.['offset-grid']).toEqual({ z: 1 });
    expect(pose?.translation?.['offset-mm']).toEqual({ z: -3 });
  });

  it('rebuilds dof_values from the live parts', () => {
    seedSource();
    const snap = fluoSnapshot();
    snap.parts.find(p => p.id === 'p-objective')!.dofs = [
      { name: 'dz', range: null, unit: 'mm', value: 3.85 },
    ];
    const { design } = buildServiceDesign(snap);
    expect(design.instantiation?.dof_values?.['objective.dz']).toBe(3.85);
  });

  it('keeps original chains (with location nodes) when only locations differ', () => {
    seedSource();
    const { design } = buildServiceDesign(fluoSnapshot());
    // The store chain has no `sample`, but the source chain does — preserved.
    expect(design.paths?.emission?.chain?.[0]).toBe('sample.plane');
    expect(design.paths?.excitation?.chain?.at(-1)).toBe('sample.plane');
  });

  it('takes the live chain when the user re-chained a path', () => {
    seedSource();
    const snap = fluoSnapshot();
    snap.paths[1] = {
      name: 'emission',
      chain: ['p-objective.front>back', 'p-camera.sensor'],
    };
    const { design } = buildServiceDesign(snap);
    expect(design.paths?.emission?.chain).toEqual([
      'objective.front>back',
      'camera.sensor',
    ]);
  });

  it('deletes removed parts and their dof_values; adds new parts bare', () => {
    seedSource();
    const snap = fluoSnapshot();
    snap.parts = snap.parts.filter(p => p.id !== 'p-objective');
    snap.parts.push(makePart('extra-mirror', [3, 0, 2]));
    snap.paths = [];
    const { design, keyByPartId } = buildServiceDesign(snap);
    expect(design.components?.objective).toBeUndefined();
    expect(design.instantiation?.dof_values?.['objective.dz']).toBeUndefined();
    const extraKey = keyByPartId['p-extra-mirror'];
    expect(design.components?.[extraKey]?.primitive?.model).toBe('glb-extra-mirror');
  });

  it('stamps provenance after accepted optimization deltas', () => {
    seedSource();
    useSourceDesignStore.getState().setProvenance({
      optimized_by: 'optiland',
      run: '2026-07-14T12:00:00',
      merit: { rms_spot_after_mm: 0.001 },
    });
    const { design } = buildServiceDesign(fluoSnapshot());
    expect(design.provenance?.optimized_by).toBe('optiland');
  });

  it('serializes to a files map the service accepts', () => {
    seedSource();
    const files = serviceFiles(fluoSnapshot());
    const design = parseDesign(files['optikit-design.yml'] as string);
    expect(design.components?.sample?.type).toBe('location');
  });
});

describe('listRangedDofs', () => {
  it('lists the objective focus DOF with range, value, and part mapping', () => {
    seedSource();
    const dofs = listRangedDofs(fluoSnapshot());
    expect(dofs).toHaveLength(1);
    expect(dofs[0]).toMatchObject({
      key: 'objective.dz',
      range: [-7.5, 7.5],
      value: 1.85,
      partId: 'p-objective',
    });
  });
});

describe('listPartMechanics (WP-16)', () => {
  it('exposes template classes and the draggable translation DOF', () => {
    seedSource();
    const mechanics = listPartMechanics(fluoSnapshot());
    const byKey = Object.fromEntries(mechanics.map(m => [m.componentKey, m]));
    // objective: T2 adaptive with the dz insert axis, current value 1.85.
    expect(byKey.objective.templateClass).toBe('adaptive');
    expect(byKey.objective.translationDofs).toEqual([
      {
        key: 'objective.dz',
        name: 'dz',
        axis: 'z',
        range: [-7.5, 7.5],
        unit: 'mm',
        value: 1.85,
        actuatable: true,
      },
    ]);
    // dichroic: T1 fixed — insert locked, nothing draggable.
    expect(byKey.dichroic.templateClass).toBe('fixed');
    expect(byKey.dichroic.translationDofs).toEqual([]);
    // laser: no template bound at all (ghost box + "no template" badge).
    expect(byKey.laser.templateClass).toBeNull();
  });
});

describe('without a retained source', () => {
  it('degrades to the snapshot export WITH palette optics (WP-32)', () => {
    const { design } = buildServiceDesign(fluoSnapshot());
    // Bare parts now carry catalog-derived optics so chain/compile see the
    // same ports the schematic draws (no more E_BAD_PORT).
    const objective = design.components?.objective;
    expect(objective?.category).toBe('other'); // fixture part carries no category
    expect(objective?.optics?.passthrough).toBe(true);
    expect(Object.keys(objective?.optics?.ports ?? {})).toEqual(['front', 'back']);
    expect(design.components?.sample).toBeUndefined();
    expect(design.paths?.emission?.chain?.[0]).toBe('objective.front>back');
  });
});

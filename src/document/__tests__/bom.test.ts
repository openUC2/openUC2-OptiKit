/**
 * WP-50: the live BOM — parts grouped by library id WITH their grid cells,
 * priced from the registry, drafts flagged. The acceptance design: 2× the
 * same laser + 1 mirror → laser qty 2 with both cells listed.
 */

import { describe, expect, it } from 'vitest';
import { buildDocBom, docBomCsv } from '../bom';
import { entriesFromIndex, registerLibraryModules } from '../libraryPalette';
import type { IndexModule } from '../../model/libraryIndex';
import type { DocPart, Vec3 } from '../types';

const mod = (
  id: string,
  category: string,
  price: number | null,
  review = false,
): IndexModule =>
  ({
    id, version: '0.1.0', kind: 'cube_module', description: '', tags: [],
    category, thumbnail: null, footprint_grid: [1, 1, 1], review,
    ...(price != null ? { price } : {}),
    component: {
      ref: `${id.replace('.cube.', '.src.')}@^0.1`, resolved: '0.1.0',
      vendor: null, efl_mm: null,
    },
    template: { ref: 't@^0.1', resolved: '0.1.0', class: 'fixed', actuatable: false },
    ports: [], electronics: null,
  }) as IndexModule;

function part(id: string, libraryRef: string, cell: Vec3): DocPart {
  return {
    id, ref: id, category: 'other', libraryRef,
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1], yawDeg: 0 },
    gridPose: {
      cell, offsetMm: [0, 0, 0], rot24: { z: '+z', x: '+x' },
      offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0,
    },
    dofs: [], params: {},
  } as DocPart;
}

registerLibraryModules(
  entriesFromIndex(
    [
      mod('openuc2.cube.laser_488nm', 'source', 650),
      mod('openuc2.cube.mirror_1x1', 'mirror', 50, true),
      mod('openuc2.cube.mystery', 'other', null),
    ],
    'http://core.test',
  ),
);

const PARTS = [
  part('p1', 'openuc2.cube.laser_488nm', [0, 0, 0]),
  part('p2', 'openuc2.cube.laser_488nm', [2, 0, 0]),
  part('p3', 'openuc2.cube.mirror_1x1', [4, 0, 0]),
  part('p4', 'openuc2.cube.mystery', [4, -1, 0]),
];

describe('buildDocBom', () => {
  it('groups the acceptance design: laser qty 2 with BOTH cells listed', () => {
    const bom = buildDocBom(PARTS);
    expect(bom.totalParts).toBe(4);
    const laser = bom.lines.find(l => l.libraryRef === 'openuc2.cube.laser_488nm')!;
    expect(laser.qty).toBe(2);
    expect(laser.cells).toEqual([[0, 0, 0], [2, 0, 0]]);
    expect(laser.partIds).toEqual(['p1', 'p2']); // index-aligned for cross-probing
    expect(laser.unitPriceEur).toBe(650);
  });

  it('prices only what the registry prices, and flags drafts', () => {
    const bom = buildDocBom(PARTS);
    expect(bom.pricedTotalEur).toBe(2 * 650 + 50);
    expect(bom.unpricedLines).toBe(1); // the mystery module stays unpriced
    const mirror = bom.lines.find(l => l.libraryRef === 'openuc2.cube.mirror_1x1')!;
    expect(mirror.review).toBe(true); // draft — marked, not hidden
  });

  it('CSV carries qty, cells, totals row and the unpriced flag', () => {
    const csv = docBomCsv(buildDocBom(PARTS));
    expect(csv).toContain('2,laser 488nm,openuc2.cube.laser_488nm');
    expect(csv).toContain('[0 0 0] [2 0 0]');
    expect(csv).toContain('unpriced');
    expect(csv).toContain(`TOTAL`);
    expect(csv).toContain((2 * 650 + 50).toFixed(2));
  });

  it('a part with no registry entry still appears (namespace = its id root)', () => {
    const bom = buildDocBom([part('x', 'somewhere.cube.unknown', [1, 1, 0])]);
    expect(bom.lines[0].namespace).toBe('somewhere');
    expect(bom.lines[0].unitPriceEur).toBeNull();
  });
});

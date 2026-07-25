/**
 * Community pages: the live BOM — real registry prices only, unpriced lines
 * stay visibly unpriced (the design's "moment of truth" promise).
 */

import { describe, expect, it } from 'vitest';
import { bomOf } from '../designData';
import { designFromFiles } from '../../../model/dsn';
import type { IndexModule } from '../../../model/libraryIndex';

const DESIGN_YML = `
optikit-version: v0.0.0-alpha.1
design: {name: bom-test, version: 0.1.0}
components:
  m1:
    type: primitive
    primitive: {type: glb, model: openuc2.cube.mirror_1x1}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 1}}}
  m2:
    type: primitive
    primitive: {type: glb, model: openuc2.cube.mirror_1x1}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 2}}}
  cam:
    type: primitive
    primitive: {type: glb, model: openuc2.cube.camera_usb}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 3}}}
  ghost:
    type: primitive
    primitive: {type: glb, model: openuc2.cube.unpriced_thing}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 4}}}
`;

const mod = (id: string, price: number | null, category = 'other'): IndexModule =>
  ({
    id, version: '0.1.0', kind: 'cube_module', description: '', tags: [],
    category, thumbnail: null, footprint_grid: [1, 1, 1], review: false,
    component: { ref: 'x@^0.1', resolved: null, vendor: null, efl_mm: null },
    template: { ref: 't@^0.1', resolved: null, class: 'fixed', actuatable: false },
    ports: [], electronics: null,
    ...(price != null ? { price } : {}),
  }) as IndexModule;

describe('bomOf', () => {
  it('aggregates quantities and sums only priced lines', () => {
    const decl = designFromFiles({ 'optikit-design.yml': DESIGN_YML });
    const bom = bomOf(decl, [
      mod('openuc2.cube.mirror_1x1', 50, 'mirror'),
      mod('openuc2.cube.camera_usb', 24, 'detector'),
      mod('openuc2.cube.unpriced_thing', null),
    ]);
    expect(bom.totalParts).toBe(4);
    const mirror = bom.lines.find(l => l.moduleId === 'openuc2.cube.mirror_1x1')!;
    expect(mirror.qty).toBe(2);
    expect(mirror.unitPrice).toBe(50);
    expect(bom.pricedTotal).toBe(2 * 50 + 24);
    expect(bom.unpricedLines).toBe(1); // the ghost stays visibly unpriced
  });

  it('a module missing from the registry is unpriced, not invented', () => {
    const decl = designFromFiles({ 'optikit-design.yml': DESIGN_YML });
    const bom = bomOf(decl, []);
    expect(bom.pricedTotal).toBe(0);
    expect(bom.unpricedLines).toBe(3);
  });
});

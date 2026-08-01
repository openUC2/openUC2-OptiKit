import { describe, expect, it } from 'vitest';
import { optilandDropPosition, optilandPreviewRows } from '../optilandImport';
import type { ImportOptilandResponse } from '../../api/coreClient';

const RESPONSE: ImportOptilandResponse = {
  components: [
    {
      id: 'user.source.relay-source',
      category: 'source',
      source: { wavelengths_um: [0.532] },
    },
    {
      id: 'user.lens.relay-el1',
      category: 'lens',
      optics: {
        fragment: {
          surfaces: [
            {
              geometry: { radius: 50, conic: 0 },
              material_post: { name: 'N-BK7' },
              thickness: 4,
              semi_aperture: 12.7,
            },
            { geometry: { radius: -50, conic: 0 }, semi_aperture: 12.7 },
          ],
        },
      },
    },
    { id: 'user.detector.relay-detector', category: 'detector' },
  ],
  placements: [
    { component: 'user.source.relay-source', 'z-mm': -50, kind: 'source' },
    { component: 'user.lens.relay-el1', 'z-mm': 0, kind: 'lens' },
    { component: 'user.detector.relay-detector', 'z-mm': 52.5, kind: 'detector' },
  ],
  review: [],
  records: {},
  wavelengths_um: [0.532],
};

describe('optilandPreviewRows (WP-87)', () => {
  it('joins placements onto components in axial order', () => {
    const rows = optilandPreviewRows(RESPONSE);
    expect(rows.map(r => r.kind)).toEqual(['source', 'lens', 'detector']);
    expect(rows.map(r => r.zMm)).toEqual([-50, 0, 52.5]);
    expect(rows[1].nSurfaces).toBe(2);
    expect(rows[0].nSurfaces).toBe(0);
  });

  it('estimates a paraxial EFL from the fragment', () => {
    const rows = optilandPreviewRows(RESPONSE);
    expect(rows[1].eflMm).not.toBeNull();
    expect(rows[1].eflMm!).toBeGreaterThan(40);
    expect(rows[1].eflMm!).toBeLessThan(60);
    expect(rows[0].eflMm).toBeNull();
  });
});

describe('optilandDropPosition (WP-87)', () => {
  it('lays the row along +x (the document beam axis) in continuous mm', () => {
    expect(optilandDropPosition([0, 0, 0], 52.5)).toEqual([52.5, 0, 0]);
    expect(optilandDropPosition([100, -50, 55], -50)).toEqual([50, -50, 55]);
  });
});

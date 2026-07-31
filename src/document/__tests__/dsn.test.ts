/**
 * .dsn round trip (EMB-E remainder, WP-12): what this app exports, it can
 * import back to the same placements; foreign content is reported, not
 * guessed.
 */

import { describe, expect, it } from 'vitest';

import type { PlacedModule } from '../../types';
import { dsnFromPlacements, placementsFromDsn } from '../dsn';
import { optikitIdFor, optikitRefFor, placed, RECORDS, threeModuleRow } from './helpers';

const SLUG_BY_RECORD = new Map<string, string>([
  ['openuc2.source.laser_488', 'laser-488nm'],
  ['thorlabs.lens.ac254-050-a', 'lens-pos-1x1'],
  ['openuc2.detector.camera_cs165', 'camera-usb-daheng'],
  ['openuc2.mirror.flat_45', 'mirror-1x1'],
]);
const MOUNTS: Record<string, string> = {
  'mirror-1x1': 'x:90',
  'camera-usb-daheng': 'z:90',
};

const slugFor = (recordId: string) => SLUG_BY_RECORD.get(recordId);
const mountFor = (slug: string) => MOUNTS[slug];

function roundTrip(placements: PlacedModule[]) {
  const { yaml } = dsnFromPlacements(placements, optikitRefFor, RECORDS, 'abc123');
  return placementsFromDsn(yaml, slugFor, mountFor);
}

const byId = (ps: PlacedModule[]) => [...ps].sort((a, b) => (a.id < b.id ? -1 : 1));

describe('.dsn round trip', () => {
  it('reproduces the first-success row exactly, with the catalog lock', () => {
    const original = threeModuleRow();
    const res = roundTrip(original);
    expect(res.skipped).toEqual([]);
    expect(res.catalogHash).toBe('abc123');
    expect(byId(res.placements).map(p => [p.id, p.moduleId, p.position.x, p.position.y, p.layer, p.rotation]))
      .toEqual(byId(original).map(p => [p.id, p.moduleId, p.position.x, p.position.y, p.layer, p.rotation]));
  });

  it('reproduces yaws and mounted folds (mirror x:90 at every yaw)', () => {
    const original = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('mirror-1x1', 'b2', 2, 0),
      placed('mirror-1x1', 'c3', 2, 2, { rotation: 90 }),
      placed('camera-usb-daheng', 'd4', 0, 2, { rotation: 270 }),
      placed('lens-pos-1x1', 'e5', 1, 0, { rotation: 180 }),
    ];
    const res = roundTrip(original);
    expect(res.skipped).toEqual([]);
    for (const p of original) {
      const back = res.placements.find(q => q.id === p.id)!;
      expect(back.moduleId).toBe(p.moduleId);
      expect(back.rotation).toBe(p.rotation);
      expect(back.position).toEqual(p.position);
    }
  });

  it('round trips layers as grid z', () => {
    const original = [
      placed('laser-488nm', 'a1', 0, 0),
      { ...placed('lens-pos-1x1', 'b2', 1, 0), layer: 2 },
    ];
    const back = roundTrip(original).placements.find(p => p.id === 'b2')!;
    expect(back.layer).toBe(2);
  });

  it('reports a component whose record maps to no module', () => {
    const { yaml } = dsnFromPlacements(threeModuleRow(), optikitRefFor, RECORDS);
    const res = placementsFromDsn(
      yaml,
      id => (id === 'openuc2.source.laser_488' ? 'laser-488nm' : undefined),
      mountFor,
    );
    expect(res.placements.map(p => p.moduleId)).toEqual(['laser-488nm']);
    expect(res.skipped).toHaveLength(2);
    expect(res.skipped[0].reason).toMatch(/no module maps to record/);
    expect(res.catalogHash).toBeNull();
  });

  it('unmapped placements are absent from the export and reported there', () => {
    const placements = [...threeModuleRow(), placed('esp32-1x1', 'x9', 3, 0)];
    const { yaml, unmapped } = dsnFromPlacements(placements, optikitIdFor, RECORDS);
    expect(unmapped.map(u => u.placementId)).toEqual(['x9']);
    const res = placementsFromDsn(yaml, slugFor, mountFor);
    expect(res.placements).toHaveLength(3);
  });

  it('resolves anchor chains and reports dangling anchors', () => {
    const yaml = [
      'components:',
      '  a:',
      "    primitive: {model: openuc2.source.laser_488}",
      "    pose: {rotation: {type: grid, grid: {z: +x, x: -z}}, translation: {'offset-grid': {x: 1, y: 0, z: 0}}}",
      '  b:',
      "    primitive: {model: openuc2.source.laser_488}",
      "    pose: {rotation: {type: grid, grid: {z: +x, x: -z}}, translation: {anchor: a, 'offset-grid': {x: 2, y: 1, z: 0}}}",
      '  c:',
      "    primitive: {model: openuc2.source.laser_488}",
      "    pose: {rotation: {type: grid, grid: {z: +x, x: -z}}, translation: {anchor: ghost, 'offset-grid': {x: 0, y: 0, z: 0}}}",
    ].join('\n');
    const res = placementsFromDsn(yaml, slugFor, mountFor);
    expect(res.placements.find(p => p.id === 'b')!.position).toEqual({ x: 3, y: 1 });
    expect(res.skipped).toEqual([
      { component: 'c', reason: 'translation anchor does not resolve' },
    ]);
  });
});

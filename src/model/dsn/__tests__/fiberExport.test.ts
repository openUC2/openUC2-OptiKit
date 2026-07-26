/**
 * The `.dsn` contract for fibers (WP-46) and source state (WP-47): what the
 * frontend writes must be exactly what optikit-core's inference reads.
 */

import { describe, expect, it } from 'vitest';
import { designToParts } from '../convert';
import { designFromFiles } from '../io';

const YAML = `
optikit-version: v0.0.0-alpha.1
design: {name: fiber-bench, version: 0.1.0}
components:
  laser:
    type: primitive
    category: source
    wavelength-um: 0.488
    primitive: {type: glb, model: openuc2.cube.laser_488nm}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 0}}}
  spare-laser:
    type: primitive
    category: source
    enabled: false
    primitive: {type: glb, model: openuc2.cube.laser_488nm}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 1}}}
  collimator:
    type: primitive
    category: lens
    primitive: {type: glb, model: openuc2.cube.lens_25mm}
    pose: {rotation: {type: grid}, translation: {offset-grid: {x: 3}}}
fibers:
  patch:
    from: laser.pigtail
    to: collimator.fiber_in
    core-um: 50
    na: 0.22
    length-m: 2
    type: MM
`;

describe('fiber + source state import', () => {
  const imported = designToParts(designFromFiles({ 'optikit-design.yml': YAML }));

  it('reads fibers with their properties, endpoints in design-key space', () => {
    expect(imported.fibers).toHaveLength(1);
    const [fiber] = imported.fibers;
    expect(fiber.id).toBe('patch');
    expect(fiber.from).toEqual({ key: 'laser', port: 'pigtail' });
    expect(fiber.to).toEqual({ key: 'collimator', port: 'fiber_in' });
    expect(fiber).toMatchObject({ coreUm: 50, na: 0.22, lengthM: 2, type: 'MM' });
  });

  it('a design without fibers imports an empty list, not undefined', () => {
    const bare = designToParts(
      designFromFiles({
        'optikit-design.yml':
          'optikit-version: v0.0.0-alpha.1\ndesign: {name: x, version: 0.1.0}\ncomponents: {}\n',
      }),
    );
    expect(bare.fibers).toEqual([]);
  });
});

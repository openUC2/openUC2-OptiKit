/**
 * WP-19: datum → record mapping. The generated trio must follow the library
 * conventions (frames with full offsets, axis-snapped ports, mesh-offset on
 * the template, semver'd module refs) — the committed fixture is validated
 * against optikit-core `library validate` like the WP-14 one.
 */

import { describe, expect, it } from 'vitest';
import {
  AXIS_SNAP_WARN_DEG,
  bindToRecords,
  recordsToFiles,
  snapToAxis,
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

describe('bindToRecords', () => {
  it('maps the authored datum into frames + axis-aligned ports', () => {
    const bound = bindToRecords(laserInput());
    expect(bound.warnings).toEqual([]);
    const optics = bound.component.optics as {
      frames: Record<string, Record<string, number>>;
      ports: Record<string, { frame: string; direction: string }>;
    };
    // The emission datum sits at the authored point, not the origin.
    expect(optics.frames.out).toEqual({ 'z-mm': 20 });
    expect(optics.ports.out).toEqual({ frame: 'out', direction: '+z' });
    expect(bound.component.id).toBe('user.source.laser-pointer');
    expect(bound.component.category).toBe('source');
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
    input.datums = [
      {
        id: 'd1', name: 'front', kind: 'reflective',
        pointMm: [0, 0, 0], direction: [0.1, 0, -1], areaDiameterMm: 25,
      },
    ];
    const bound = bindToRecords(input);
    expect(bound.warnings.join()).toMatch(/off the -z axis/);
    const fragment = (bound.component.optics as { fragment: { surfaces: unknown[] } }).fragment;
    expect(fragment.surfaces).toHaveLength(1);
  });

  it('emits the library-PR file layout', () => {
    const files = recordsToFiles(bindToRecords(laserInput()));
    expect(Object.keys(files).sort()).toEqual([
      'components/user.source.laser-pointer/component.yml',
      'modules/user.cube.laser-pointer/module.yml',
      'templates/user.tpl.laser-pointer/template.yml',
    ]);
    expect(files['components/user.source.laser-pointer/component.yml']).toContain('z-mm: 20');
  });
});

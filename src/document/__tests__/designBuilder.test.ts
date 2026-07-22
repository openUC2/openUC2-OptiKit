import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { buildDesign, gridRotation } from '../designBuilder';
import { optikitIdFor, placed, RECORDS, threeModuleRow } from './helpers';

import goldenYml from './fixtures/golden-three-module-row.yml?raw';

describe('gridRotation — the pinned yaw/roll/pitch → 24-rotation mapping table', () => {
  it('maps each 90° yaw step (beam east/south/west/north)', () => {
    // rotation 0 = beam along grid east (+x world), matching the 2D tracer
    // and the fluo-scope laser's authored {z: +x, x: -z}.
    expect(gridRotation({ rotation: 0 })).toEqual({ z: '+x', x: '-z' });
    expect(gridRotation({ rotation: 90 })).toEqual({ z: '+y', x: '-z' });
    expect(gridRotation({ rotation: 180 })).toEqual({ z: '-x', x: '-z' });
    expect(gridRotation({ rotation: 270 })).toEqual({ z: '-y', x: '-z' });
  });

  it('maps topRotation (roll about three-Z): 90° points the beam up', () => {
    expect(gridRotation({ rotation: 0, topRotation: 90 })).toEqual({ z: '+z', x: '+x' });
  });

  it('maps tiltRotation (pitch about three-X): rolls the module about the beam', () => {
    expect(gridRotation({ rotation: 0, tiltRotation: 90 })).toEqual({ z: '+x', x: '-y' });
  });

  it('composes yaw with roll', () => {
    expect(gridRotation({ rotation: 90, topRotation: 90 })).toEqual({ z: '+z', x: '+y' });
  });

  it('rejects non-90° angles', () => {
    expect(() => gridRotation({ rotation: 45 })).toThrow(/multiple of 90/);
  });
});

describe('buildDesign', () => {
  it('is byte-identical across two runs (rule 10)', () => {
    const a = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    const b = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    expect(a.yaml).toBe(b.yaml);
  });

  it('matches the committed golden fixture byte for byte', () => {
    const { yaml } = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    expect(yaml).toBe(goldenYml);
  });

  // Regenerate with: UPDATE_GOLDEN=1 npm test (then review the diff).
  it.runIf(process.env.UPDATE_GOLDEN)('regenerates the golden fixture', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { yaml } = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    await writeFile(
      new URL('./fixtures/golden-three-module-row.yml', import.meta.url),
      yaml,
    );
  });

  it('sorts component ids and anchors everything to the lexically first', () => {
    const { yaml, mapped } = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    expect(mapped).toEqual([
      'camera-usb-daheng-c3',
      'laser-488nm-a1',
      'lens-pos-1x1-b2',
    ]);
    const doc = parse(yaml) as {
      components: Record<
        string,
        { pose: { translation: { anchor?: string; 'offset-grid': Record<string, number> } } }
      >;
    };
    const camera = doc.components['camera-usb-daheng-c3'];
    const laser = doc.components['laser-488nm-a1'];
    // The camera (anchor) carries its absolute grid offset; the laser is
    // relative to it: (0,0,0) − (2,0,0) = (−2, 0, 0).
    expect(camera.pose.translation.anchor).toBeUndefined();
    expect(camera.pose.translation['offset-grid']).toEqual({ x: 2, y: 0, z: 0 });
    expect(laser.pose.translation.anchor).toBe('camera-usb-daheng-c3');
    expect(laser.pose.translation['offset-grid']).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('inlines the record optics block verbatim (rule 12)', () => {
    const { yaml } = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    const doc = parse(yaml) as { components: Record<string, { optics: unknown }> };
    expect(doc.components['laser-488nm-a1'].optics).toEqual(
      RECORDS.get('openuc2.source.laser_488')!.optics,
    );
    expect(doc.components['lens-pos-1x1-b2'].optics).toEqual(
      RECORDS.get('openuc2.lens.achromat_25mm_f50')!.optics,
    );
  });

  it('lists unmapped modules as not-simulated and omits them from the design', () => {
    const placements = [...threeModuleRow(), placed('esp32-1x1', 'd4', 3, 0)];
    const { yaml, unmapped } = buildDesign(placements, optikitIdFor, RECORDS);
    expect(unmapped).toEqual([{ placementId: 'd4', moduleId: 'esp32-1x1' }]);
    expect(yaml).not.toContain('esp32');
  });

  it('reports a mapped module whose record is missing, with its optikitId', () => {
    const { unmapped } = buildDesign(threeModuleRow(), optikitIdFor, new Map());
    expect(unmapped).toHaveLength(3);
    expect(unmapped[0].optikitId).toBeDefined();
  });

  it('encodes layers as offset-grid z (the 55 mm axis)', () => {
    const placements = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('camera-usb-daheng', 'c3', 0, 0, { layer: 2 }),
    ];
    const { yaml } = buildDesign(placements, optikitIdFor, RECORDS);
    const doc = parse(yaml) as {
      components: Record<
        string,
        { pose: { translation: { 'offset-grid': Record<string, number> } } }
      >;
    };
    // Anchor = camera at layer 2 (absolute z: 2); laser relative z: −2.
    expect(doc.components['camera-usb-daheng-c3'].pose.translation['offset-grid'].z).toBe(2);
    expect(doc.components['laser-488nm-a1'].pose.translation['offset-grid'].z).toBe(-2);
  });
});

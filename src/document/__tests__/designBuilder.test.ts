import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { buildDesign, gridRotation, mountRotation } from '../designBuilder';
import { optikitIdFor, optikitRefFor, placed, RECORDS, threeModuleRow } from './helpers';

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

describe('mount rotations — the mirror fold lands in-plane and yaw steers it', () => {
  // Without a mount, the flat_45 record's fold (record-local +x) images to
  // world −Z at EVERY yaw — the beam dives into the table and dies at the
  // mirror in the 2D view. The x:90 mount turns it onto +Y (grid south), the
  // legacy 2D engine's east→south fold at rotation 0.
  it('x:90 maps each yaw step to an in-plane fold', () => {
    expect(gridRotation({ rotation: 0 }, 'x:90')).toEqual({ z: '+x', x: '+y' });
    expect(gridRotation({ rotation: 90 }, 'x:90')).toEqual({ z: '+y', x: '-x' });
    expect(gridRotation({ rotation: 180 }, 'x:90')).toEqual({ z: '-x', x: '-y' });
    expect(gridRotation({ rotation: 270 }, 'x:90')).toEqual({ z: '-y', x: '+x' });
  });

  it('without a mount the fold points down at every yaw (the pinned defect)', () => {
    for (const rotation of [0, 90, 180, 270]) {
      expect(gridRotation({ rotation }).x).toBe('-z');
    }
  });

  it('the x:90 mount equals a 270° tiltRotation at zero yaw (same slot in the chain)', () => {
    expect(gridRotation({ rotation: 0 }, 'x:90')).toEqual(
      gridRotation({ rotation: 0, tiltRotation: 270 }),
    );
  });

  it('composes multi-step mounts left to right', () => {
    // x:180 lifts the fold to +Z (a periscope's lower mirror).
    expect(gridRotation({ rotation: 0 }, 'x:180')).toEqual({ z: '+x', x: '+z' });
    // Two quarter turns about x equal one half turn.
    expect(gridRotation({ rotation: 0 }, 'x:90,x:90')).toEqual(
      gridRotation({ rotation: 0 }, 'x:180'),
    );
  });

  it('rejects malformed and non-90° mounts', () => {
    expect(() => mountRotation('w:90')).toThrow(/optikitMount step/);
    expect(() => mountRotation('x')).toThrow(/optikitMount step/);
    expect(() => mountRotation('x:45')).toThrow(/multiple of 90/);
  });

  it('empty or absent mounts are the identity', () => {
    expect(gridRotation({ rotation: 0 }, '')).toEqual(gridRotation({ rotation: 0 }));
    expect(gridRotation({ rotation: 0 }, undefined)).toEqual(gridRotation({ rotation: 0 }));
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

  it('applies the module mount to a mirror placement and yaw steers the fold', () => {
    const placements = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('mirror-1x1', 'b2', 2, 0),
      placed('mirror-1x1', 'c3', 2, 2, { rotation: 90 }),
    ];
    const { yaml } = buildDesign(placements, optikitRefFor, RECORDS);
    const doc = parse(yaml) as {
      components: Record<string, { pose: { rotation: { grid: { z: string; x: string } } } }>;
    };
    expect(doc.components['mirror-1x1-b2'].pose.rotation.grid).toEqual({ z: '+x', x: '+y' });
    expect(doc.components['mirror-1x1-c3'].pose.rotation.grid).toEqual({ z: '+y', x: '-x' });
    // The unmounted laser is untouched by the mount mechanism.
    expect(doc.components['laser-488nm-a1'].pose.rotation.grid).toEqual({ z: '+x', x: '-z' });
  });

  it('maps the dichroic and beamsplitter with the mirror mount convention', () => {
    const placements = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('filter-dichroic', 'b2', 1, 0),
      placed('beamsplitter-1x1', 'c3', 2, 0),
      placed('filter-bandpass', 'd4', 3, 0),
    ];
    const { yaml, unmapped } = buildDesign(placements, optikitRefFor, RECORDS);
    expect(unmapped).toEqual([]);
    const doc = parse(yaml) as {
      components: Record<string, { pose: { rotation: { grid: { z: string; x: string } } } }>;
    };
    // Fold records land in-plane (x:90); the pass-through filter keeps R0.
    expect(doc.components['filter-dichroic-b2'].pose.rotation.grid).toEqual({ z: '+x', x: '+y' });
    expect(doc.components['beamsplitter-1x1-c3'].pose.rotation.grid).toEqual({ z: '+x', x: '+y' });
    expect(doc.components['filter-bandpass-d4'].pose.rotation.grid).toEqual({ z: '+x', x: '-z' });
  });

  it('bare-string refs (no mount) build identically to the pre-mount output', () => {
    const viaStrings = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    const viaRefs = buildDesign(threeModuleRow(), optikitRefFor, RECORDS);
    expect(viaRefs.yaml).toBe(viaStrings.yaml);
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

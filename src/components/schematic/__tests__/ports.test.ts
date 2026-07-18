/**
 * Schematic port/axis derivation from the retained source design (feedback
 * round 1: imported parts rendered with the wrong orientation because pins
 * and glyphs assumed the +x palette convention instead of the real
 * optics.ports).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocCategory, DocPart } from '../../../document';
import { useSourceDesignStore } from '../../../document/sourceDesignStore';
import { beamAxesOf, opticalAxisOf, portsOf, resolvePortRef } from '../ports';

const FLUO_YAML = readFileSync(
  join(__dirname, '..', '..', '..', 'model', 'dsn', '__tests__', 'fixtures', 'fluo-scope.dsn.yml'),
  'utf8',
);

function makePart(key: string, over: Partial<DocPart> = {}): DocPart {
  return {
    id: `p-${key}`,
    ref: key,
    category: 'other',
    libraryRef: `glb-${key}`,
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1] },
    gridPose: { cell: [0, 0, 0], offsetMm: [0, 0, 0], rot24: { z: '+z', x: '+x' }, offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0 },
    dofs: [],
    params: {},
    ...over,
  } as DocPart;
}

beforeEach(() => {
  useSourceDesignStore.getState().setSource(FLUO_YAML, {
    'p-laser': 'laser',
    'p-dichroic': 'dichroic',
    'p-objective': 'objective',
    'p-camera': 'camera',
  });
});

describe('portsOf with a retained source design', () => {
  it('places the objective pins on its real ±z axis with datum offsets', () => {
    const ports = portsOf(makePart('objective'));
    const byName = Object.fromEntries(ports.map(p => [p.name, p]));
    expect(byName.front.localDir).toEqual([0, 0, -1]);
    expect(byName.front.localMm).toEqual([0, 0, -22]); // optical frame + stand-off
    expect(byName.back.localDir).toEqual([0, 0, 1]);
    expect(byName.back.localMm).toEqual([0, 0, 27]); // exit frame z=5 + stand-off
    expect(byName.front.kind).toBe('input');
    expect(byName.back.kind).toBe('output');
  });

  it('exposes the dichroic fold ports on their own axes', () => {
    const dirs = Object.fromEntries(
      portsOf(makePart('dichroic')).map(p => [p.name, p.localDir]),
    );
    expect(dirs.front).toEqual([-1, 0, 0]);
    expect(dirs.reflected).toEqual([0, 0, -1]);
    expect(dirs.transmitted).toEqual([0, 0, 1]);
  });
});

describe('opticalAxisOf', () => {
  it('derives the beam axis from the real ports (vertical stack = +z)', () => {
    expect(opticalAxisOf(makePart('objective'))).toEqual([0, 0, 1]); // −front
    expect(opticalAxisOf(makePart('laser'))).toEqual([0, 0, 1]); // out
    expect(opticalAxisOf(makePart('camera'))).toEqual([0, 0, 1]); // −sensor
    expect(opticalAxisOf(makePart('dichroic'))).toEqual([1, 0, 0]); // −front(−x)
  });

  it('derives the palette axis from the catalog (no legacy +x code path)', () => {
    useSourceDesignStore.getState().clear();
    expect(opticalAxisOf(makePart('anything'))).toEqual([1, 0, 0]); // THROUGH default
  });
});

// ── WP-29: one convention — palette parts use record-style catalog ports ──────

describe('palette catalog ports (WP-29)', () => {
  beforeEach(() => useSourceDesignStore.getState().clear());

  const palette = (libraryRef: string, category: DocCategory) =>
    makePart(libraryRef, { libraryRef, category });

  it('every palette category has an axis equal to its record exit direction', () => {
    // [libraryRef, category, expected axis]
    const cases: [string, DocCategory, [number, number, number]][] = [
      ['lens-pos-1x1', 'lens', [1, 0, 0]],
      ['filter-bandpass', 'filter', [1, 0, 0]],
      ['torch-1x1', 'source', [1, 0, 0]],
      ['laser-488nm', 'source', [1, 0, 0]],
      ['camera-usb', 'detector', [1, 0, 0]],
      ['mirror-1x1', 'mirror', [1, 0, 0]],
      ['beamsplitter-1x1', 'beamsplitter', [1, 0, 0]],
    ];
    for (const [ref, category, axis] of cases) {
      expect(opticalAxisOf(palette(ref, category)), ref).toEqual(axis);
    }
  });

  it('the 45° palette mirror folds 90° toward -y — matching the 2D sim engine', () => {
    const axes = beamAxesOf(palette('mirror-1x1', 'mirror'));
    expect(axes.entry).toEqual([1, 0, 0]);
    expect(axes.exit).toEqual([0, -1, 0]);
    expect(axes.foldDeg).toBeCloseTo(90, 6);
  });

  it('the retro mirror folds 180° — flat_0 behavior', () => {
    const axes = beamAxesOf(palette('kinematicmirror-90-1x1', 'mirror'));
    expect(axes.foldDeg).toBeCloseTo(180, 6);
  });

  it('splitters expose transmitted + reflected arms; fold = the reflected arm', () => {
    const part = palette('beamsplitter-1x1', 'beamsplitter');
    const names = portsOf(part).map(p => p.name).sort();
    expect(names).toEqual(['front', 'reflected', 'transmitted']);
    expect(beamAxesOf(part).foldDeg).toBeCloseTo(90, 6);
  });

  it('straight-through parts have no fold', () => {
    expect(beamAxesOf(palette('lens-pos-1x1', 'lens')).foldDeg).toBeNull();
    expect(beamAxesOf(palette('torch-1x1', 'source')).foldDeg).toBeNull();
    expect(beamAxesOf(palette('camera-usb', 'detector')).foldDeg).toBeNull();
  });
});

describe('imported fold angles from real ports (WP-29)', () => {
  it('the fluo-scope dichroic (front −x, reflected −z) folds 90° out of plane', () => {
    useSourceDesignStore.getState().setSource(FLUO_YAML, { 'p-dichroic': 'dichroic' });
    const axes = beamAxesOf(makePart('dichroic'));
    expect(axes.entry).toEqual([1, 0, 0]);
    expect(axes.foldDeg).toBeCloseTo(90, 6);
  });
});

describe('resolvePortRef', () => {
  it('anchors traversal refs (front>back) at the entry port', () => {
    const part = makePart('objective', {
      worldPose: { positionMm: [0, 0, 50], rotation: [0, 0, 0, 1] },
    });
    expect(resolvePortRef([part], 'p-objective.front>back')).toEqual([0, 0, 28]);
    expect(resolvePortRef([part], 'p-objective.back')).toEqual([0, 0, 77]);
  });
});

// ── WP-39/WP-40: continuous directions, anchors, galvo ───────────────────────

import { dirVecOf, anchorFrameMm } from '../ports';
import {
  entriesFromIndex,
  registerLibraryModules,
} from '../../../document/libraryPalette';
import type { IndexModule } from '../../../model/libraryIndex';

describe('dirVecOf (WP-39: vector directions)', () => {
  it('resolves axis literals and normalizes vectors', () => {
    expect(dirVecOf('-y')).toEqual([0, -1, 0]);
    const v = dirVecOf([0, 2, 0]);
    expect(v).toEqual([0, 1, 0]);
    const tilted = dirVecOf([Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)]);
    expect(tilted[0]).toBeCloseTo(0.5, 6);
  });
});

describe('anchorFrameMm (WP-39: the beam starts at the datum)', () => {
  it('returns the objective entry frame offset from the retained source', () => {
    // fluo objective front sits at its optical frame (z=0 → localMm has the
    // pin stand-off; the FRAME itself is the anchor).
    expect(anchorFrameMm(makePart('objective'))).toEqual([0, 0, 0]);
  });

  it('follows the laser out frame', () => {
    const anchor = anchorFrameMm(makePart('laser'));
    expect(anchor.length).toBe(3);
  });
});

const GALVO_MODULE: IndexModule = {
  id: 'user.cube.galvo',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'galvo mirror',
  tags: [],
  category: 'mirror',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'user.mirror.galvo@^0.1', resolved: '0.1.0', vendor: null, efl_mm: null },
  template: {
    ref: 'user.tpl.galvo@^0.1', id: 'user.tpl.galvo', resolved: '0.1.0',
    class: 'adaptive', actuatable: true,
    dof: [{ name: 'tilt', kind: 'rotation', axis: 'y', unit: 'deg', range: [-15, 15], actuatable: true }],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-x', position_mm: [0, 0, 0], after_surface: null },
    { name: 'reflected', direction: '-y', position_mm: [0, 0, 0], after_surface: 0 },
  ],
  electronics: null,
};

describe('galvo groundwork (WP-40: rotation DOF swings the arm)', () => {
  it('a rotation-DOF value of θ swings the exit arm by 2θ', () => {
    registerLibraryModules(entriesFromIndex([GALVO_MODULE], 'http://x'));
    const still = beamAxesOf(
      makePart('galvo', { libraryRef: 'user.cube.galvo', category: 'mirror' }),
    );
    expect(still.foldDeg).toBeCloseTo(90, 5);
    const tilted = beamAxesOf(
      makePart('galvo', {
        libraryRef: 'user.cube.galvo',
        category: 'mirror',
        dofs: [{ name: 'tilt', range: null, unit: 'deg', value: 15 }],
      }),
    );
    // θ = 15° → the reflected arm swings 30°: fold 90° → 120° (or 60°,
    // sense set by the fold-plane normal).
    expect(Math.abs((tilted.foldDeg ?? 0) - 90)).toBeCloseTo(30, 5);
  });
});

describe('actuated-DOF beam swing (WP-42)', () => {
  it('a two-rotation-DOF galvo sums the tilts into the schematic arm swing', () => {
    const galvo: IndexModule = {
      ...GALVO_MODULE,
      id: 'user.cube.galvo2',
      template: {
        ...GALVO_MODULE.template,
        dof: [
          { name: 'tilt_x', kind: 'rotation', axis: 'x', unit: 'deg', range: [-15, 15], actuatable: true, pivot_frame: 'pivot_x', surface: 0, can_object: 0x6070 },
          { name: 'tilt_y', kind: 'rotation', axis: 'y', unit: 'deg', range: [-15, 15], actuatable: true, pivot_frame: 'pivot_y', surface: 1, can_object: 0x6071 },
        ],
      },
    };
    registerLibraryModules(entriesFromIndex([galvo], 'http://x'));
    const base = beamAxesOf(
      makePart('g2', { libraryRef: 'user.cube.galvo2', category: 'mirror' }),
    );
    expect(base.foldDeg).toBeCloseTo(90, 5);
    // tilt_x=10 → arm swings 20°; adding tilt_y=5 → 30° total.
    const one = beamAxesOf(makePart('g2', {
      libraryRef: 'user.cube.galvo2', category: 'mirror',
      dofs: [{ name: 'tilt_x', range: null, unit: 'deg', value: 10 }],
    }));
    expect(Math.abs((one.foldDeg ?? 0) - 90)).toBeCloseTo(20, 4);
    const both = beamAxesOf(makePart('g2', {
      libraryRef: 'user.cube.galvo2', category: 'mirror',
      dofs: [
        { name: 'tilt_x', range: null, unit: 'deg', value: 10 },
        { name: 'tilt_y', range: null, unit: 'deg', value: 5 },
      ],
    }));
    expect(Math.abs((both.foldDeg ?? 0) - 90)).toBeCloseTo(30, 4);
  });
});

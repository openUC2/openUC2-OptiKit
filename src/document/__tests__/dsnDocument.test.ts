/**
 * WP-96: the document is DSN-first.
 *
 * These lock the three things the refactor is FOR: the stored pose is the
 * schema's own spelling, undo is a real stack with brackets, and the legacy
 * `PlacedModule` layout format still round-trips byte-for-byte (it is a file
 * format now, not state).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPart,
  captureUndo,
  commitUndo,
  getPart,
  listDsnParts,
  listParts,
  movePartWorld,
  redo,
  removePart,
  renamePart,
  rotatePart,
  setPartOrientation,
  undo,
} from '../OptikitDocument';
import { resetDocument, useDocumentStore } from '../documentStore';
import { entriesFromIndex, registerLibraryModules } from '../libraryPalette';
import { partFromPlacedModule, placedModuleFromPart, rotationTripleOf } from '../legacyLayout';
import { gridPoseOfPart, worldPoseOfPart } from '../mapping';
import { useAppStore } from '../../stores/appStore';
import type { IndexModule } from '../../model/libraryIndex';
import type { PlacedModule } from '../../types';
import type { DsnPart } from '../types';

const LENS: IndexModule = {
  id: 'openuc2.cube.lens_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'lens',
  tags: [],
  category: 'lens',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'c@^1', resolved: '1.0.0', vendor: null, efl_mm: 50 },
  template: {
    ref: 't@^1', id: 't', resolved: '1.0.0', class: null,
    actuatable: false, dof: [], states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
  electronics: null,
} as unknown as IndexModule;

/** WP-101: the same lens in a FIXED (T1) cube — 27 of 33 served modules are. */
const FIXED: IndexModule = {
  ...LENS,
  id: 'openuc2.cube.lens_fixed_1x1',
  template: { ...LENS.template, class: 'fixed' },
} as unknown as IndexModule;

beforeEach(() => {
  resetDocument();
  useAppStore.setState({ modules: [] });
  registerLibraryModules(entriesFromIndex([LENS, FIXED], 'http://x'));
});

describe('the stored part IS the .dsn spelling', () => {
  it('stores cell + offset-mm and rot24 + offset-deg, not a store-frame triple', () => {
    const id = addPart(LENS.id, [105, -50, 55])!;
    const [part] = listDsnParts();
    expect(part.id).toBe(id);
    expect(part.libraryRef).toBe(LENS.id);
    // 105 mm = cell 2 (100 mm) + 5 mm residual, in the DOCUMENT frame.
    expect(part.cell).toEqual([2, -1, 1]);
    expect(part.offsetMm[0]).toBeCloseTo(5);
    expect(part.rot24).toEqual({ z: '+x', x: '-z' }); // record ±z → document +x
    expect(part.offsetDeg).toEqual({ x: 0, y: 0, z: 0 });
    // No legacy vocabulary survives on the stored object.
    expect(Object.keys(part)).not.toContain('rotation');
    expect(Object.keys(part)).not.toContain('position');
    expect(part.params).not.toHaveProperty('__doc');
  });

  // WP-101: the add path used to keep the full sub-cell residual while the
  // MOVE path constrained it, so a dropped T1 cube landed off-grid and the
  // first pointer move of a drag silently straightened it.
  it('a T1 drop lands on the cell centre, like a T1 drag does', () => {
    const id = addPart(FIXED.id, [105, -50, 55])!;
    const part = getPart(id)!;
    expect(part.gridPose.cell).toEqual([2, -1, 1]);
    expect(part.gridPose.offsetMm).toEqual([0, 0, 0]);
    expect(part.worldPose.positionMm[0]).toBeCloseTo(100);
    expect(part.worldPose.positionMm[1]).toBeCloseTo(-50);
    expect(part.worldPose.positionMm[2]).toBeCloseTo(55);
    // And a drag to the same spot agrees — the two paths no longer disagree.
    movePartWorld(id, [105, -50, 55]);
    expect(getPart(id)!.gridPose.offsetMm).toEqual([0, 0, 0]);
  });

  it('{exact} keeps an imported pose verbatim', () => {
    const id = addPart(FIXED.id, [105, -50, 55], { exact: true })!;
    expect(getPart(id)!.gridPose.offsetMm[0]).toBeCloseTo(5);
    expect(getPart(id)!.worldPose.positionMm[0]).toBeCloseTo(105);
  });

  it('resolves the world pose as p = S·cell + δ', () => {
    const id = addPart(LENS.id, [105, -50, 55])!;
    const world = getPart(id)!.worldPose.positionMm;
    expect(world[0]).toBeCloseTo(105);
    expect(world[1]).toBeCloseTo(-50);
    expect(world[2]).toBeCloseTo(55);
  });

  it('the grid pose is the stored pose (no decomposition)', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    rotatePart(id, 55); // snap off → discrete + residual
    const stored = listDsnParts()[0];
    expect(gridPoseOfPart(stored)).toEqual({
      cell: stored.cell,
      rot24: stored.rot24,
      offsetMm: stored.offsetMm,
      offsetDeg: stored.offsetDeg,
      residualYawDeg: stored.offsetDeg.z,
    });
  });

  it('a free yaw keeps its residual and reads back as the same angle', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    rotatePart(id, 55);
    const part = getPart(id)!;
    expect(part.worldPose.yawDeg).toBeCloseTo(55);
    expect(Math.abs(part.gridPose.offsetDeg.z)).toBeGreaterThan(0);
  });

  it('an identical rot24 always yields an identical yaw readout', () => {
    // The legacy euler triple was ambiguous — two triples, same R24, two yaw
    // readouts. rot24 is the stored form now, so this cannot happen.
    const a = addPart(LENS.id, [0, 0, 0])!;
    const b = addPart(LENS.id, [50, 0, 0])!;
    setPartOrientation(a, { z: '+y', x: '+z' });
    setPartOrientation(b, { z: '+y', x: '+z' });
    expect(getPart(a)!.worldPose.yawDeg).toBe(getPart(b)!.worldPose.yawDeg);
  });
});

describe('undo is a real stack', () => {
  it('one command is one step, and redo replays it', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    renamePart(id, 'L1');
    expect(getPart(id)!.ref).toBe('L1');
    undo();
    expect(getPart(id)!.ref).not.toBe('L1');
    redo();
    expect(getPart(id)!.ref).toBe('L1');
  });

  it('a bracket collapses a whole interaction into ONE step', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    const before = useDocumentStore.getState().past.length;
    const token = captureUndo();
    movePartWorld(id, [10, 0, 0]);
    movePartWorld(id, [20, 0, 0]);
    movePartWorld(id, [30, 0, 0]);
    commitUndo(token);
    expect(useDocumentStore.getState().past.length).toBe(before + 1);
    undo();
    expect(getPart(id)!.worldPose.positionMm[0]).toBeCloseTo(0);
  });

  it('a bracket that changed nothing records no step', () => {
    addPart(LENS.id, [0, 0, 0]);
    const before = useDocumentStore.getState().past.length;
    const token = captureUndo();
    commitUndo(token);
    expect(useDocumentStore.getState().past.length).toBe(before);
  });

  it('undo restores a removed part', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    removePart(id);
    expect(listParts()).toHaveLength(0);
    undo();
    expect(listParts().map(p => p.id)).toEqual([id]);
  });
});

describe('the legacy layout format still round-trips', () => {
  const roundTrip = (part: DsnPart): DsnPart =>
    partFromPlacedModule(placedModuleFromPart(part));

  it('cell, residuals, orientation, DOFs and params survive both directions', () => {
    const part: DsnPart = {
      id: 'p1',
      ref: 'L1',
      libraryRef: LENS.id,
      cell: [2, -3, 1],
      offsetMm: [5, -2.5, 0],
      rot24: { z: '+x', x: '-z' },
      offsetDeg: { x: 0, y: 0, z: -35 },
      dofValues: { dz: 1.25 },
      params: { enabled: false, wavelengthUm: 0.488 },
    };
    expect(roundTrip(part)).toEqual(part);
  });

  it('reads a pre-WP-96 PlacedModule, freeYawDeg migration included', () => {
    const legacy: PlacedModule = {
      id: 'old',
      moduleId: LENS.id,
      position: { x: 2, y: 3 }, // store y grows south → document y = -3
      layer: 1,
      rotation: 90,
      params: { __doc: { offsetMm: [1, 2, 3], freeYawDeg: 20 }, groupId: 'g1' },
      customText: 'M1',
    };
    const part = partFromPlacedModule(legacy);
    expect(part.cell).toEqual([2, -3, 1]);
    expect(part.offsetMm).toEqual([1, 2, 3]);
    expect(part.ref).toBe('M1');
    expect(part.params).toEqual({ groupId: 'g1' }); // __doc is unwrapped
    expect(part.offsetDeg.z).toBeCloseTo(-20); // freeYawDeg migrated (doc sign)
  });

  it('writes the rotation triple the layout JSON expects', () => {
    // {z:+x, x:-z} is the "record ±z optics laid into the document plane"
    // orientation every placed optic gets — the old store spelled it as a
    // 90° yaw.
    const triple = rotationTripleOf({ z: '+x', x: '-z' });
    expect(triple).toHaveLength(3);
    expect(triple.every(v => v % 90 === 0)).toBe(true);
  });

  it('a placed part exports and re-imports at the same world pose', () => {
    const id = addPart(LENS.id, [105, -50, 55])!;
    rotatePart(id, 55);
    const before = worldPoseOfPart(listDsnParts()[0]);
    const after = worldPoseOfPart(roundTrip(listDsnParts()[0]));
    expect(after.positionMm[0]).toBeCloseTo(before.positionMm[0]);
    expect(after.positionMm[1]).toBeCloseTo(before.positionMm[1]);
    expect(after.positionMm[2]).toBeCloseTo(before.positionMm[2]);
    expect(after.yawDeg).toBeCloseTo(before.yawDeg);
  });
});

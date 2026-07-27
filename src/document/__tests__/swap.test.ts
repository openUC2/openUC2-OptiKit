/**
 * WP-66: in-place module swap — pose/ref survive, paths survive exactly when
 * the new record declares a matching port name, DOF values re-clamp into the
 * new template's range (orphans are removed), and the whole swap is ONE undo
 * step.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  entriesFromIndex,
  listLibraryEntries,
  registerLibraryModules,
} from '../libraryPalette';
import {
  addPart,
  getPart,
  listPaths,
  renamePart,
  setDofValue,
  setPath,
  undo,
} from '../OptikitDocument';
import { swapPartModule } from '../swap';
import { makePortRef } from '../types';
import { usePathsStore } from '../pathsStore';
import { useAppStore } from '../../stores/appStore';
import type { IndexModule } from '../../model/libraryIndex';

const BASE: IndexModule = {
  id: 'test.cube.mirror_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'flat mirror',
  tags: [],
  category: 'mirror',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'test.mirror.flat@^1', resolved: '1.0.0', vendor: null, efl_mm: null },
  template: {
    ref: 'test.tpl.mirror@^0.1',
    id: 'test.tpl.mirror',
    resolved: '0.1.0',
    class: 'fixed',
    actuatable: false,
    dof: [],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'reflected', direction: '+x', position_mm: [0, 0, 0], after_surface: 0 },
  ],
  electronics: null,
};

const MIRROR_1X1 = BASE;

// Same port names (front/reflected) — a chain through them must survive.
const MIRROR_45: IndexModule = { ...BASE, id: 'test.cube.mirror_45' };

// Through lens: front/back — 'reflected' chains cannot survive a swap here.
const LENS_DZ: IndexModule = {
  ...BASE,
  id: 'test.cube.lens_dz',
  category: 'lens',
  template: {
    ...BASE.template!,
    class: 'adaptive',
    dof: [
      { name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-7.5, 7.5] },
    ],
  },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
};

// Same DOF name, tighter range — values must re-clamp on swap.
const LENS_TIGHT: IndexModule = {
  ...LENS_DZ,
  id: 'test.cube.lens_tight',
  template: {
    ...LENS_DZ.template!,
    dof: [
      { name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-2, 2] },
    ],
  },
};

describe('swapPartModule (WP-66)', () => {
  beforeEach(() => {
    useAppStore.setState({
      placedModules: [],
      modules: [],
      history: [],
      historyIndex: -1,
      selectedItemId: null,
      selectedItemType: null,
    });
    usePathsStore.getState().clear();
    registerLibraryModules(
      entriesFromIndex([MIRROR_1X1, MIRROR_45, LENS_DZ, LENS_TIGHT], 'http://x'),
    );
  });

  it('lists the registered entries as swap candidates', () => {
    expect(listLibraryEntries().map(e => e.moduleId)).toEqual([
      MIRROR_1X1.id, MIRROR_45.id, LENS_DZ.id, LENS_TIGHT.id,
    ]);
  });

  it('keeps pose and ref exactly; only libraryRef changes', () => {
    const id = addPart(MIRROR_1X1.id, [50, 0, 0])!;
    renamePart(id, 'M1');
    const before = getPart(id)!;

    const result = swapPartModule(id, MIRROR_45.id);
    expect(result).not.toBeNull();

    const after = getPart(id)!;
    expect(after.libraryRef).toBe(MIRROR_45.id);
    expect(after.ref).toBe('M1');
    expect(after.worldPose.positionMm).toEqual(before.worldPose.positionMm);
    expect(after.worldPose.rotation).toEqual(before.worldPose.rotation);
    expect(after.gridPose).toEqual(before.gridPose);
  });

  it('returns null for unknown parts, unknown modules, and no-op swaps', () => {
    const id = addPart(MIRROR_1X1.id, [0, 0, 0])!;
    expect(swapPartModule('nope', MIRROR_45.id)).toBeNull();
    expect(swapPartModule(id, 'not.registered')).toBeNull();
    expect(swapPartModule(id, MIRROR_1X1.id)).toBeNull();
  });

  it('keeps a chain when the new record declares the same port names', () => {
    const mirror = addPart(MIRROR_1X1.id, [0, 0, 0])!;
    const lens = addPart(LENS_DZ.id, [50, 0, 0])!;
    setPath('path-1', [makePortRef(mirror, 'reflected'), makePortRef(lens, 'front')]);

    const result = swapPartModule(mirror, MIRROR_45.id)!;
    expect(result.droppedPaths).toEqual([]);
    expect(listPaths()).toEqual([
      { name: 'path-1', chain: [`${mirror}.reflected`, `${lens}.front`] },
    ]);
  });

  it('drops the WHOLE chain (with a warning report) when a port goes missing', () => {
    const mirror = addPart(MIRROR_1X1.id, [0, 0, 0])!;
    const lens = addPart(LENS_DZ.id, [50, 0, 0])!;
    setPath('path-1', [makePortRef(mirror, 'reflected'), makePortRef(lens, 'front')]);
    setPath('path-2', [makePortRef(mirror, 'front'), makePortRef(lens, 'front')]);

    // lens_dz has front/back — 'reflected' has no home, path-1 must go whole.
    const result = swapPartModule(mirror, LENS_DZ.id)!;
    expect(result.droppedPaths).toEqual(['path-1']);
    // path-2 only used 'front', which the lens declares too — it survives.
    expect(listPaths().map(p => p.name)).toEqual(['path-2']);
  });

  it('re-clamps DOF values into the new template range', () => {
    const id = addPart(LENS_DZ.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 5); // legal in [-7.5, 7.5]

    const result = swapPartModule(id, LENS_TIGHT.id)!;
    expect(result.clampedDofs).toEqual(['dz']);
    expect(result.removedDofs).toEqual([]);
    const dz = getPart(id)!.dofs.find(d => d.name === 'dz');
    expect(dz?.value).toBe(2); // clamped into [-2, 2]
  });

  it('removes DOF values the new template does not declare', () => {
    const id = addPart(LENS_DZ.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 5);

    const result = swapPartModule(id, MIRROR_45.id)!; // mirror declares no DOFs
    expect(result.removedDofs).toEqual(['dz']);
    expect(getPart(id)!.dofs).toEqual([]);
  });

  it('is ONE undo step: undo() restores the original module and DOF value', () => {
    const id = addPart(LENS_DZ.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 5);

    swapPartModule(id, MIRROR_45.id);
    expect(getPart(id)!.libraryRef).toBe(MIRROR_45.id);

    undo();
    const restored = getPart(id)!;
    expect(restored.libraryRef).toBe(LENS_DZ.id);
    expect(restored.dofs.find(d => d.name === 'dz')?.value).toBe(5);
  });
});

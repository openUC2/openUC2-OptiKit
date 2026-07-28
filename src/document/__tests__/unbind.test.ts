/**
 * WP-76: the unbind verb — a placed cube module becomes a free UNBOUND
 * primitive backed by the module's own component, at the exact same pose, in
 * one undo step. Template-bound DOF values drop (and are reported); chains
 * survive when the component declares the same port names; an unresolvable
 * component refuses with the archive hint.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  entriesFromComponents,
  entriesFromIndex,
  libraryEntryOf,
  registerLibraryModules,
} from '../libraryPalette';
import {
  addPart,
  getPart,
  listPaths,
  setDofValue,
  setPath,
  undo,
} from '../OptikitDocument';
import { unbindPart } from '../unbind';
import { makePortRef } from '../types';
import { usePathsStore } from '../pathsStore';
import { useAppStore } from '../../stores/appStore';
import type { IndexComponent, IndexModule } from '../../model/libraryIndex';

const MIRROR_MODULE: IndexModule = {
  id: 'test.cube.mirror_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'flat mirror cube',
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
    class: 'adaptive',
    actuatable: false,
    dof: [
      { name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-7.5, 7.5] },
    ],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'reflected', direction: '+x', position_mm: [0, 0, 0], after_surface: 0 },
  ],
  electronics: null,
};

// The component the module binds — same port names, so chains survive.
const MIRROR_COMPONENT: IndexComponent = {
  id: 'test.mirror.flat',
  version: '1.0.0',
  kind: 'optical_component',
  category: 'mirror',
  description: 'flat mirror',
  tags: [],
  vendor: { name: '', mpn: '', url: '' },
  efl_mm: null,
  n_surfaces: 1,
  review: false,
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'reflected', direction: '+x', position_mm: [0, 0, 0], after_surface: 0 },
  ],
};

// A module whose component the index does NOT resolve (archived, WP-68).
const ORPHAN_MODULE: IndexModule = {
  ...MIRROR_MODULE,
  id: 'test.cube.orphan',
  component: { ref: 'test.mirror.archived@^1', resolved: null, vendor: null, efl_mm: null },
};

function registerAll(components: IndexComponent[]) {
  const modules = [MIRROR_MODULE, ORPHAN_MODULE];
  registerLibraryModules([
    ...entriesFromIndex(modules, 'http://x'),
    ...entriesFromComponents(components, modules, 'http://x'),
  ]);
}

describe('unbindPart (WP-76)', () => {
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
    registerAll([MIRROR_COMPONENT]);
  });

  it('registers a bound component as a hidden (lookup-only) palette entry', () => {
    const entry = libraryEntryOf(MIRROR_COMPONENT.id);
    expect(entry).toBeDefined();
    expect(entry!.unbound).toBe(true);
    expect(entry!.paletteHidden).toBe(true);
  });

  it('re-points the part at the component, keeping the exact pose and cell', () => {
    const id = addPart(MIRROR_MODULE.id, [50, 0, 0])!;
    const before = getPart(id)!;

    const outcome = unbindPart(id);
    expect(outcome.ok).toBe(true);

    const after = getPart(id)!;
    expect(after.libraryRef).toBe(MIRROR_COMPONENT.id);
    expect(after.worldPose.positionMm).toEqual(before.worldPose.positionMm);
    expect(after.worldPose.rotation).toEqual(before.worldPose.rotation);
    expect(after.gridPose).toEqual(before.gridPose);
    // The part now reads as a WP-60 unbound primitive.
    expect(libraryEntryOf(after.libraryRef)!.unbound).toBe(true);
  });

  it('drops template-bound DOF values and reports them', () => {
    const id = addPart(MIRROR_MODULE.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 3);

    const outcome = unbindPart(id);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.removedDofs).toEqual(['dz']);
    expect(getPart(id)!.dofs).toEqual([]);
  });

  it('keeps a chain through the part (the port names come from the component)', () => {
    const mirror = addPart(MIRROR_MODULE.id, [0, 0, 0])!;
    const other = addPart(MIRROR_MODULE.id, [50, 0, 0])!;
    setPath('path-1', [makePortRef(mirror, 'reflected'), makePortRef(other, 'front')]);

    const outcome = unbindPart(mirror);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.droppedPaths).toEqual([]);
    expect(listPaths()).toEqual([
      { name: 'path-1', chain: [`${mirror}.reflected`, `${other}.front`] },
    ]);
  });

  it('is ONE undo step: undo() restores the module and its DOF value', () => {
    const id = addPart(MIRROR_MODULE.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 3);

    expect(unbindPart(id).ok).toBe(true);
    expect(getPart(id)!.libraryRef).toBe(MIRROR_COMPONENT.id);

    undo();
    const restored = getPart(id)!;
    expect(restored.libraryRef).toBe(MIRROR_MODULE.id);
    expect(restored.dofs.find(d => d.name === 'dz')?.value).toBe(3);
  });

  it('refuses with the archive hint when the component does not resolve', () => {
    const id = addPart(ORPHAN_MODULE.id, [0, 0, 0])!;
    const outcome = unbindPart(id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/archived/);
    expect(getPart(id)!.libraryRef).toBe(ORPHAN_MODULE.id); // untouched
  });

  it('refuses on an already-unbound part and on unknown parts', () => {
    const id = addPart(MIRROR_COMPONENT.id, [0, 0, 0])!;
    const outcome = unbindPart(id);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toMatch(/already a free primitive/);
    expect(unbindPart('nope').ok).toBe(false);
  });
});

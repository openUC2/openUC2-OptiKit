/**
 * WP-78: copy/paste/duplicate — the copy carries libraryRef, ref
 * (uniquified), params, DOF values and orientation; NOT chains, NOT group
 * tags. One undo per paste.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { entriesFromIndex, registerLibraryModules } from '../libraryPalette';
import {
  addPart,
  getPart,
  listParts,
  listPaths,
  renamePart,
  rotatePart,
  setDofValue,
  setPartParam,
  setPath,
  undo,
} from '../OptikitDocument';
import { copyPart, duplicatePart, pastePart, uniquifiedRef } from '../clipboard';
import { makePortRef } from '../types';
import { usePathsStore } from '../pathsStore';
import { useAppStore } from '../../stores/appStore';
import { resetDocument } from '../documentStore';
import type { IndexModule } from '../../model/libraryIndex';

const LENS: IndexModule = {
  id: 'test.cube.lens_dz',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'through lens',
  tags: [],
  category: 'lens',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'test.lens.x@^1', resolved: '1.0.0', vendor: null, efl_mm: 50 },
  template: {
    ref: 'test.tpl.lens@^0.1',
    id: 'test.tpl.lens',
    resolved: '0.1.0',
    class: 'adaptive',
    actuatable: false,
    dof: [{ name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-7.5, 7.5] }],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
  electronics: null,
};

describe('clipboard (WP-78)', () => {
  beforeEach(() => {
    resetDocument();
    useAppStore.setState({ modules: [] });
    usePathsStore.getState().clear();
    registerLibraryModules(entriesFromIndex([LENS], 'http://x'));
  });

  it('pastes libraryRef, params, DOF values and orientation — not chains', () => {
    const id = addPart(LENS.id, [50, 0, 0])!;
    renamePart(id, 'L1');
    rotatePart(id, 90);
    setDofValue(id, 'dz', 3.5);
    setPartParam(id, 'aperture', 20);
    setPath('path-1', [makePortRef(id, 'front'), makePortRef(id, 'back')]);

    const clip = copyPart(id)!;
    const pasted = pastePart(clip, [100, 0, 0])!;
    const copy = getPart(pasted)!;

    expect(copy.libraryRef).toBe(LENS.id);
    expect(copy.ref).toBe('L2'); // uniquified against L1
    expect(copy.params.aperture).toBe(20);
    expect(copy.dofs.find(d => d.name === 'dz')?.value).toBe(3.5);
    expect(copy.worldPose.yawDeg).toBeCloseTo(getPart(id)!.worldPose.yawDeg, 6);
    expect(copy.worldPose.positionMm[0]).toBeCloseTo(100, 6);
    // The chain still names only the ORIGINAL part — a paste is unwired.
    expect(listPaths()).toHaveLength(1);
    expect(listPaths()[0].chain.every(ref => ref.startsWith(`${id}.`))).toBe(true);
  });

  it('drops group tags on copy', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    setPartParam(id, 'groupId', 'grp-1');
    setPartParam(id, 'groupRef', 'test.group.x');
    const clip = copyPart(id)!;
    expect(clip.params.groupId).toBeUndefined();
    expect(clip.params.groupRef).toBeUndefined();
  });

  it('one undo removes the whole paste', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    setDofValue(id, 'dz', 2);
    const before = listParts().length;
    pastePart(copyPart(id)!, [50, 0, 0]);
    expect(listParts().length).toBe(before + 1);
    undo();
    expect(listParts().length).toBe(before);
  });

  it('duplicate lands one offset over with everything aboard', () => {
    const id = addPart(LENS.id, [0, 0, 0])!;
    renamePart(id, 'lens');
    setDofValue(id, 'dz', -1.5);
    const dup = duplicatePart(id, [50, 0, 0])!;
    const copy = getPart(dup)!;
    expect(copy.ref).toBe('lens-2');
    expect(copy.worldPose.positionMm[0]).toBeCloseTo(50, 6);
    expect(copy.dofs.find(d => d.name === 'dz')?.value).toBe(-1.5);
  });

  it('uniquifiedRef counts past every existing sibling', () => {
    const a = addPart(LENS.id, [0, 0, 0])!;
    renamePart(a, 'M1');
    const b = addPart(LENS.id, [50, 0, 0])!;
    renamePart(b, 'M2');
    expect(uniquifiedRef('M1')).toBe('M3');
    expect(uniquifiedRef('fresh')).toBe('fresh');
  });
});

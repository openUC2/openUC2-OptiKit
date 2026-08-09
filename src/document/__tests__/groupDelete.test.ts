/**
 * WP-150 — deleting a grouped part deletes the arrangement.
 *
 * Round 24: "we cannot delete an entire group once it's in the editor."
 * Every delete road removed exactly the selected part, so a 20-member
 * miniFRAME had to be dismantled one cube at a time. Half an arrangement is
 * not a thing anyone asked for — unless the group is UNLOCKED for member
 * editing, which is precisely the state that says "I am working on members".
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPart,
  listParts,
  redo,
  removePartOrGroup,
  setPartParam,
  undo,
  type LibraryPaletteEntry,
} from '..';
import { registerLibraryModules } from '../libraryPalette';
import { resetDocument } from '../documentStore';
import { useGroupEditStore } from '../groupStore';
import { useAppStore } from '../../stores/appStore';

const CUBE = 'openuc2.cube.mirror_1x1';
const INSTANCE = 'grp-test-1';

const entry = (): LibraryPaletteEntry =>
  ({
    moduleId: CUBE,
    componentId: null,
    name: 'mirror',
    description: '',
    category: 'other',
    templateClass: 'fixed',
    mount: 'cube',
    templateId: null,
    states: [],
    dofs: [],
    footprintGrid: [1, 1, 1],
    thumbnailUrl: null,
    glbUrl: null,
    meshFrame: '',
    meshPoseGrid: null,
    portsFrame: 'record',
    mirrorRectMm: null,
    ports: [],
    eflMm: null,
    wavelengthsUm: [],
    beamDiameterMm: null,
    symbolUrl: null,
    programmable: null,
    priceEur: null,
    review: false,
    source: 'registry',
    unbound: false,
    fragmentSurfaces: [],
    carrier: false,
    bays: {},
  }) as LibraryPaletteEntry;

/** Three cubes, all tagged as one group instance. */
function placeGroup(): string[] {
  const ids: string[] = [];
  for (const x of [0, 50, 100]) {
    const id = addPart(CUBE, [x, 0, 0]);
    if (!id) throw new Error('placement failed');
    setPartParam(id, 'groupId', INSTANCE);
    setPartParam(id, 'groupRef', 'openuc2.group.test');
    ids.push(id);
  }
  return ids;
}

describe('deleting a grouped part', () => {
  beforeEach(() => {
    resetDocument();
    useAppStore.setState({ modules: [] });
    useGroupEditStore.setState({ unlocked: {} });
    registerLibraryModules([entry()]);
  });

  it('takes the whole arrangement with it', () => {
    const ids = placeGroup();
    const removed = removePartOrGroup(ids[1]);
    expect(removed).toHaveLength(3);
    expect(listParts()).toHaveLength(0);
  });

  it('is ONE undo step, not three', () => {
    placeGroup();
    removePartOrGroup(listParts()[0].id);
    expect(listParts()).toHaveLength(0);
    undo();
    expect(listParts()).toHaveLength(3);
    redo();
    expect(listParts()).toHaveLength(0);
  });

  it('removes only the member when the group is UNLOCKED for editing', () => {
    const ids = placeGroup();
    useGroupEditStore.setState({ unlocked: { [INSTANCE]: true } });
    expect(removePartOrGroup(ids[0])).toEqual([ids[0]]);
    expect(listParts()).toHaveLength(2);
  });

  it('an ungrouped part still deletes alone', () => {
    const solo = addPart(CUBE, [0, 0, 0]);
    placeGroup();
    expect(removePartOrGroup(solo!)).toEqual([solo]);
    expect(listParts()).toHaveLength(3);
  });
});

/**
 * WP-44/45: group placement through the document facade — members land as
 * tagged parts, the instance drags rigidly, ungrouping releases it, and a
 * drop inside a carrier bay snaps to the bay origin.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import {
  entriesFromIndex,
  groupEntriesFromIndex,
  registerLibraryGroups,
  registerLibraryModules,
} from '../libraryPalette';
import {
  addGroup,
  addPart,
  getPart,
  groupInstanceOf,
  listParts,
  movePartWorld,
  ungroupInstance,
} from '../OptikitDocument';
import { useGroupEditStore } from '../groupStore';
import type { IndexGroup, IndexModule } from '../../model/libraryIndex';

const CUBE_MODULE: IndexModule = {
  id: 'openuc2.cube.cube_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'cube',
  tags: [],
  category: 'other',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'x@^0.1', resolved: '0.1.0', vendor: null, efl_mm: null },
  template: {
    ref: 't@^0.1', id: 't', resolved: '0.1.0', class: 'fixed',
    actuatable: false, dof: [], states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [],
  electronics: null,
};

const FRAME_MODULE: IndexModule = {
  ...CUBE_MODULE,
  id: 'openuc2.cube.frame',
  footprint_grid: [5, 5, 3],
  template: {
    ...CUBE_MODULE.template,
    carrier: true,
    bays: { miniframe: { origin_cell: [1, 1, 0], size: [3, 3, 2], axis: '+z' } },
  },
};

const PAIR_GROUP: IndexGroup = {
  id: 'user.group.pair',
  version: '0.1.0',
  kind: 'cube_group',
  description: 'two cubes side by side',
  tags: [],
  review: false,
  envelope_grid: [2, 1, 1],
  members: [
    { key: 'a', module: 'openuc2.cube.cube_1x1', cell: [0, 0, 0], rot90: 0, overhang: false },
    { key: 'b', module: 'openuc2.cube.cube_1x1', cell: [1, 0, 0], rot90: 0, overhang: false },
  ],
  structure: { plates: {}, joints: '', joint_cells: [], joint_module: '' },
  interface: {},
};

beforeEach(() => {
  useAppStore.setState({ placedModules: [], modules: [] });
  registerLibraryModules(entriesFromIndex([CUBE_MODULE, FRAME_MODULE], 'http://x'));
  registerLibraryGroups(groupEntriesFromIndex([PAIR_GROUP]));
  useGroupEditStore.setState({ unlocked: {} });
});

describe('addGroup', () => {
  it('places every member tagged with one instance id', () => {
    const result = addGroup('user.group.pair', [0, 0, 0])!;
    expect(result.partIds).toHaveLength(2);
    for (const id of result.partIds) {
      expect(groupInstanceOf(id)).toBe(result.instanceId);
    }
    const xs = result.partIds.map(id => getPart(id)!.worldPose.positionMm[0]).sort((p, q) => p - q);
    expect(xs).toEqual([0, 50]); // one cell apart
  });

  it('drags the whole instance rigidly, member-edit unlocks it', () => {
    const result = addGroup('user.group.pair', [0, 0, 0])!;
    const [a, b] = result.partIds;
    movePartWorld(a, [100, 0, 0]);
    expect(getPart(a)!.worldPose.positionMm[0]).toBe(100);
    expect(getPart(b)!.worldPose.positionMm[0]).toBe(150); // moved along

    useGroupEditStore.getState().toggleUnlocked(result.instanceId);
    movePartWorld(a, [200, 0, 0]);
    expect(getPart(a)!.worldPose.positionMm[0]).toBe(200);
    expect(getPart(b)!.worldPose.positionMm[0]).toBe(150); // stayed put
  });

  it('ungrouping releases the members', () => {
    const result = addGroup('user.group.pair', [0, 0, 0])!;
    const [a, b] = result.partIds;
    ungroupInstance(result.instanceId);
    expect(groupInstanceOf(a)).toBeNull();
    movePartWorld(a, [100, 0, 0]);
    expect(getPart(b)!.worldPose.positionMm[0]).toBe(50); // no longer dragged along
  });

  it('a drop inside a carrier bay snaps to the bay origin (WP-45)', () => {
    addPart('openuc2.cube.frame', [0, 0, 0]);
    // Drop at cell [2,2,0] — inside the frame's miniframe bay ([1,1,0]+3x3x2).
    const result = addGroup('user.group.pair', [100, 100, 0])!;
    expect(result.snappedToBay).toMatchObject({ bay: 'miniframe' });
    expect(result.bayOverflow).toBe(false);
    const xs = result.partIds
      .map(id => getPart(id)!.worldPose.positionMm)
      .sort((p, q) => p[0] - q[0]);
    // Snapped to the bay origin cell [1,1,0] → 50 mm in x and y.
    expect(xs[0][0]).toBe(50);
    expect(xs[0][1]).toBe(50);
  });

  it('a drop outside the bay does not snap', () => {
    addPart('openuc2.cube.frame', [0, 0, 0]);
    const result = addGroup('user.group.pair', [-200, -200, 0])!;
    expect(result.snappedToBay).toBeNull();
  });

  it('overflow is reported when the group exceeds the bay', () => {
    addPart('openuc2.cube.frame', [0, 0, 0]);
    registerLibraryGroups(
      groupEntriesFromIndex([{ ...PAIR_GROUP, envelope_grid: [4, 4, 3] }]),
    );
    const result = addGroup('user.group.pair', [100, 100, 0])!;
    expect(result.bayOverflow).toBe(true);
  });
});

describe('group survives the document round trip', () => {
  it('membership rides on part params (export/import carries it)', () => {
    const result = addGroup('user.group.pair', [0, 0, 0])!;
    const parts = listParts().filter(p => p.params.groupId === result.instanceId);
    expect(parts).toHaveLength(2);
    expect(parts[0].params.groupRef).toBe('user.group.pair');
  });
});

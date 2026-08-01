/**
 * WP-71: ad-hoc grouping — the instance mechanism (WP-44) without a library
 * record, and the bridge back: a cluster worth keeping becomes a cube_group
 * whose member cells are RELATIVE to the arrangement's own origin.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { entriesFromIndex, registerLibraryModules } from '../libraryPalette';
import {
  addPart,
  getPart,
  listSelectedPartIds,
  renamePart,
  setSelectedParts,
  togglePartSelection,
  undo,
} from '../OptikitDocument';
import {
  groupNameOf,
  groupParts,
  groupRecordYaml,
  isAdhocGroup,
  partsOfGroupInstance,
  renameGroup,
  ungroupParts,
} from '../adhocGroup';
import { useAppStore } from '../../stores/appStore';
import { resetDocument, useDocumentStore } from '../documentStore';
import type { IndexModule } from '../../model/libraryIndex';

const MIRROR: IndexModule = {
  id: 'test.cube.mirror_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'mirror',
  tags: [],
  category: 'mirror',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'test.mirror.flat@^1', resolved: '1.0.0', vendor: null, efl_mm: null },
  template: {
    ref: 'test.tpl.mirror@^0.1', id: 'test.tpl.mirror', resolved: '0.1.0',
    class: 'fixed', actuatable: false, dof: [], states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [{ name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null }],
  electronics: null,
};
const LENS: IndexModule = { ...MIRROR, id: 'test.cube.lens_1x1', category: 'lens' };

const GRID = 50; // UC2 pitch in x/y

describe('ad-hoc grouping (WP-71)', () => {
  beforeEach(() => {
    resetDocument();
    useAppStore.setState({ modules: [] });
    registerLibraryModules(entriesFromIndex([MIRROR, LENS], 'http://x'));
  });

  const placeThree = () => {
    const a = addPart(MIRROR.id, [0, 0, 0])!;
    const b = addPart(LENS.id, [GRID, 0, 0])!;
    const c = addPart(MIRROR.id, [GRID, GRID, 0])!;
    renamePart(a, 'M1');
    renamePart(b, 'L1');
    renamePart(c, 'M2');
    return [a, b, c];
  };

  // --- selection ---------------------------------------------------------

  it('toggles selection like shift-click, keeping a primary', () => {
    const [a, b] = placeThree();
    // WP-96: placing a part selects it — the set and the primary now stay in
    // step (the legacy store set only the primary, leaving the set empty).
    setSelectedParts([]);
    togglePartSelection(a);
    togglePartSelection(b);
    expect(listSelectedPartIds()).toEqual([a, b]);
    expect(useDocumentStore.getState().primaryId).toBe(b); // last = primary
    togglePartSelection(a);
    expect(listSelectedPartIds()).toEqual([b]);
  });

  // --- grouping ----------------------------------------------------------

  it('tags a selection with one instance id and a name', () => {
    const [a, b, c] = placeThree();
    const result = groupParts([a, b, c], 'periscope')!;
    expect(result.partIds).toHaveLength(3);
    for (const id of [a, b, c]) {
      const part = getPart(id)!;
      expect(part.params.groupId).toBe(result.instanceId);
      expect(groupNameOf(part)).toBe('periscope');
      expect(isAdhocGroup(part)).toBe(true);
    }
    expect(partsOfGroupInstance(result.instanceId)).toHaveLength(3);
  });

  it('refuses a group of fewer than two parts', () => {
    const [a] = placeThree();
    expect(groupParts([a], 'lonely')).toBeNull();
    expect(groupParts([], 'empty')).toBeNull();
  });

  it('is ONE undo step', () => {
    const [a, b] = placeThree();
    groupParts([a, b], 'pair');
    expect(getPart(a)!.params.groupId).toBeDefined();
    undo();
    expect(getPart(a)!.params.groupId).toBeUndefined();
  });

  it('renames in place and ungroups the whole instance', () => {
    const [a, b, c] = placeThree();
    const { instanceId } = groupParts([a, b, c], 'periscope')!;
    expect(renameGroup(instanceId, 'relay arm')).toBe(3);
    expect(groupNameOf(getPart(a)!)).toBe('relay arm');

    // Ungrouping from ONE member frees every member of that instance.
    expect(ungroupParts([b])).toBe(3);
    for (const id of [a, b, c]) {
      expect(getPart(id)!.params.groupId).toBeUndefined();
      expect(getPart(id)!.params.groupRef).toBeUndefined();
    }
  });

  it('moves a part from one group to another rather than double-tagging', () => {
    const [a, b, c] = placeThree();
    const first = groupParts([a, b], 'first')!;
    const second = groupParts([b, c], 'second')!;
    expect(getPart(b)!.params.groupId).toBe(second.instanceId);
    expect(partsOfGroupInstance(first.instanceId).map(p => p.id)).toEqual([a]);
  });

  // --- graduating to a library record -------------------------------------

  it('emits a cube_group with cells relative to the arrangement origin', () => {
    const a = addPart(MIRROR.id, [GRID, GRID, 0])!;   // cell [1, 1, 0]
    const b = addPart(LENS.id, [2 * GRID, GRID, 0])!; // cell [2, 1, 0]
    renamePart(a, 'M1');
    renamePart(b, 'L1');
    const { instanceId } = groupParts([a, b], 'relay arm')!;

    const draft = groupRecordYaml(instanceId, { namespace: 'user' })!;
    expect(draft.id).toBe('user.group.relay_arm');
    expect(draft.unresolved).toEqual([]);
    // Relative cells: the cluster's own origin is [0, 0, 0], not [1, 1, 0].
    expect(draft.yaml).toContain('cell: [0, 0, 0]');
    expect(draft.yaml).toContain('cell: [1, 0, 0]');
    expect(draft.yaml).toContain('envelope-grid: [2, 1, 1]');
    expect(draft.yaml).toContain('kind: cube_group');
    expect(draft.yaml).toContain(`module: ${MIRROR.id}@^0.1`);
    // Honest about being a draft.
    expect(draft.yaml).toContain('review:');
  });

  it('reports members that cannot be referenced by a record', () => {
    // An unbound symbol (WP-60) has no module id to reference.
    registerLibraryModules([
      ...entriesFromIndex([MIRROR], 'http://x'),
      {
        moduleId: 'test.lens.bare', componentId: 'test.lens.bare', name: 'bare',
        description: '', category: 'lens', templateClass: null, states: [], dofs: [],
        footprintGrid: [1, 1, 1], thumbnailUrl: null, glbUrl: null, ports: [],
        eflMm: null, wavelengthsUm: [], symbolUrl: null, programmable: null,
        priceEur: null, review: false, source: 'registry', unbound: true,
        fragmentSurfaces: [], carrier: false, bays: {},
      },
    ]);
    const a = addPart(MIRROR.id, [0, 0, 0])!;
    const b = addPart('test.lens.bare', [GRID, 0, 0])!;
    renamePart(b, 'bare lens');
    const { instanceId } = groupParts([a, b], 'mixed')!;
    const draft = groupRecordYaml(instanceId)!;
    expect(draft.unresolved).toEqual(['bare lens']);
  });

  it('returns null for an unknown instance', () => {
    expect(groupRecordYaml('nope')).toBeNull();
  });

  it('setSelectedParts de-duplicates and clears', () => {
    const [a, b] = placeThree();
    setSelectedParts([a, b, a]);
    expect(listSelectedPartIds()).toEqual([a, b]);
    setSelectedParts([]);
    expect(listSelectedPartIds()).toEqual([]);
    expect(useDocumentStore.getState().primaryId).toBeNull();
  });
});

/**
 * WP-146 — a hand-placed design gets its joints.
 *
 * Round 23: "I still cannot see the puzzle pieces anywhere." They exist as
 * `openuc2.cube.puzzle_1x1`, but were placed ONLY by `addGroup`, from a group
 * record's declared `joint_cells` — so a design assembled cube by cube never
 * got any structure at all.
 *
 * The hardware sets the rule: a 5 mm piece lives in the interface gap, so
 * every cube needs one above it and the bottom layer needs one below.
 * Pieces tile in x/y into a plate, which is why one piece per occupied CELL
 * is exactly right.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { addPart, addStructureJoints, listParts, type LibraryPaletteEntry } from '..';
import { registerLibraryModules } from '../libraryPalette';
import { resetDocument } from '../documentStore';
import { useAppStore } from '../../stores/appStore';

const entry = (over: Partial<LibraryPaletteEntry>): LibraryPaletteEntry =>
  ({
    moduleId: 'x',
    componentId: null,
    name: 'x',
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
    symbolUrl: null,
    programmable: null,
    priceEur: null,
    review: false,
    source: 'registry',
    unbound: false,
    fragmentSurfaces: [],
    carrier: false,
    bays: {},
    ...over,
  }) as LibraryPaletteEntry;

const CUBE = 'openuc2.cube.mirror_1x1';
const PUZZLE = 'openuc2.cube.puzzle_1x1';

const jointCells = () =>
  listParts()
    .filter(p => p.libraryRef === PUZZLE)
    .map(p => p.gridPose.cell.join(','))
    .sort();

describe('deriving the layer joints', () => {
  beforeEach(() => {
    resetDocument();
    useAppStore.setState({ modules: [] });
    registerLibraryModules([
      entry({ moduleId: CUBE, name: 'mirror' }),
      entry({ moduleId: PUZZLE, name: 'puzzle' }),
    ]);
  });

  it('puts one joint above a lone cube and one under it', () => {
    addPart(CUBE, [0, 0, 0]);
    const { added } = addStructureJoints();
    expect(added).toBe(2);
    expect(jointCells()).toEqual(['0,0,-1', '0,0,0']);
  });

  it('tiles in x/y — one piece per occupied cell, not one per design', () => {
    addPart(CUBE, [0, 0, 0]);
    addPart(CUBE, [50, 0, 0]);
    addPart(CUBE, [0, 50, 0]);
    addStructureJoints();
    // 3 cells × (above + below) = 6.
    expect(jointCells()).toEqual([
      '0,0,-1', '0,0,0', '0,1,-1', '0,1,0', '1,0,-1', '1,0,0',
    ]);
  });

  it('stacks in z: the shared gap gets ONE piece, not two', () => {
    addPart(CUBE, [0, 0, 0]);
    addPart(CUBE, [0, 0, 55]); // layer 1, directly above
    addStructureJoints();
    // under the stack (−1), the shared gap (0), and the top (1).
    expect(jointCells()).toEqual(['0,0,-1', '0,0,0', '0,0,1']);
  });

  it('is idempotent — a second run adds nothing', () => {
    addPart(CUBE, [0, 0, 0]);
    expect(addStructureJoints().added).toBe(2);
    expect(addStructureJoints().added).toBe(0);
    expect(jointCells()).toHaveLength(2);
  });

  it('does nothing without cubes, and never joints the joints', () => {
    expect(addStructureJoints().added).toBe(0);
    addPart(PUZZLE, [0, 0, 0]);
    expect(addStructureJoints().added).toBe(0);
  });
});

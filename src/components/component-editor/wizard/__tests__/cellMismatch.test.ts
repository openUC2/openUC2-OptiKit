/**
 * WP-113.1 / WP-120 — the cell-measure check, in ONE basis.
 *
 * Since WP-120 the frontend measures meshes in file-native axes, exactly
 * like optikit-core's glb_bounding_box — so the check is axis-aware again.
 * The ERROR is reserved for a mesh that is no cell in ANY orientation;
 * a permuted-axes fit (the two-glTF-conventions case) is an advisory note,
 * mirroring mesh.py's W_MESH_AXES_PERMUTED.
 */

import { describe, expect, it } from 'vitest';
import { axesPermutedNote, cellMismatch, offCentreNote } from '../wizardTypes';

describe('cellMismatch (WP-120: one basis)', () => {
  it('accepts a true cell, with real-world slop', () => {
    expect(cellMismatch([50, 50, 55])).toBeNull();
    expect(cellMismatch([49.2, 50.8, 56.1])).toBeNull();
  });

  it('accepts the shipping mirror cube in its native measurement', () => {
    // openuc2.tpl.mirror_1x1 measures 49.8 × 49.8 × 54.4 in file axes —
    // BOTH here and in `library validate`, now that the y/z viewer swap is
    // gone. One set of numbers per mesh, whichever tool prints them.
    expect(cellMismatch([49.8, 49.8, 54.4])).toBeNull();
    expect(axesPermutedNote([49.8, 49.8, 54.4])).toBeNull();
  });

  it('rejects wrong units (a metre export is 1000× off)', () => {
    expect(cellMismatch([0.05, 0.05, 0.055])).toMatch(/wrong units/);
  });

  it('rejects an insert exported instead of the cube', () => {
    expect(cellMismatch([22, 22, 30])).toMatch(/50 × 50 × 55/);
  });

  it('a permuted-axes fit is a NOTE, not a wall (the other glTF convention)', () => {
    // 55 on the wrong axis: a wrapper-node / pre-rotated export.
    expect(cellMismatch([49.8, 54.4, 49.8])).toBeNull();
    expect(axesPermutedNote([49.8, 54.4, 49.8])).toMatch(/mesh-frame/);
  });

  it('says nothing before a mesh is measured', () => {
    expect(cellMismatch(null)).toBeNull();
    expect(axesPermutedNote(null)).toBeNull();
  });
});

describe('offCentreNote', () => {
  it('flags a corner-origin export and points at fit-to-cube', () => {
    expect(offCentreNote([25, 25, 27.5])).toMatch(/fit to cube/i);
  });

  it('stays quiet for a centred mesh — and never blocks either way', () => {
    expect(offCentreNote([0, 0, 0])).toBeNull();
    expect(offCentreNote(null)).toBeNull();
  });
});

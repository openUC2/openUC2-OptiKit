/**
 * WP-113.1 — the cell-measure check at import: a whole-cube mesh must
 * measure one 50 × 50 × 55 mm cell (mirrors optikit-core's mesh.py rule,
 * CELL_TOL_MM = 3). Catching it in the wizard beats catching it when the
 * module renders on its side.
 *
 * The check is ORIENTATION-INDEPENDENT on purpose — see the regression at
 * the bottom, which is the whole reason this file exists in this shape.
 */

import { describe, expect, it } from 'vitest';
import { cellMismatch, offCentreNote } from '../wizardTypes';

describe('cellMismatch (WP-113)', () => {
  it('accepts a true cell, with real-world slop', () => {
    expect(cellMismatch([50, 50, 55])).toBeNull();
    expect(cellMismatch([50.8, 49.2, 56.1])).toBeNull();
  });

  it('rejects wrong units (a metre export is 1000× off)', () => {
    expect(cellMismatch([0.05, 0.05, 0.055])).toMatch(/wrong units/);
  });

  it('rejects an insert exported instead of the cube', () => {
    expect(cellMismatch([22, 22, 30])).toMatch(/50 × 50 × 55/);
  });

  it('says nothing before a mesh is measured', () => {
    expect(cellMismatch(null)).toBeNull();
  });

  /**
   * REGRESSION: `openuc2.tpl.mirror_1x1` — a curated, shipping cube and this
   * road's own acceptance case — measures 49.8 × 54.4 × 49.8 through the
   * frontend's viewer basis (BindScene reports `[s.x, s.z, s.y]`) while
   * optikit-core reads the file's native 49.8 × 49.8 × 54.4. An axis-by-axis
   * test refused the file over that convention mismatch alone.
   */
  it('accepts the shipping mirror cube whatever axis carries the 55 mm', () => {
    expect(cellMismatch([49.8, 54.4, 49.8])).toBeNull(); // frontend basis
    expect(cellMismatch([49.8, 49.8, 54.4])).toBeNull(); // optikit-core basis
    expect(cellMismatch([54.4, 49.8, 49.8])).toBeNull(); // any other permutation
  });
});

describe('offCentreNote (WP-113)', () => {
  it('flags a corner-origin export and points at fit-to-cube', () => {
    expect(offCentreNote([25, 25, 27.5])).toMatch(/fit to cube/i);
  });

  it('stays quiet for a centred mesh — and never blocks either way', () => {
    expect(offCentreNote([0, 0, 0])).toBeNull();
    expect(offCentreNote(null)).toBeNull();
  });
});

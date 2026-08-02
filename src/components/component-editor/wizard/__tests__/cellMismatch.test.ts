/**
 * WP-113.1 — the cell-measure check at import: a whole-cube mesh must
 * measure one 50 × 50 × 55 mm cell (mirrors optikit-core's mesh.py rule,
 * CELL_TOL_MM = 3). Catching it in the wizard beats catching it when the
 * module renders on its side.
 */

import { describe, expect, it } from 'vitest';
import { cellMismatch } from '../wizardTypes';

describe('cellMismatch (WP-113)', () => {
  it('accepts a true cell, with real-world slop', () => {
    expect(cellMismatch([50, 50, 55], [0, 0, 0])).toBeNull();
    expect(cellMismatch([50.8, 49.2, 56.1], [1.2, 0, -0.4])).toBeNull();
  });

  it('rejects wrong units (a metre export is 1000× off)', () => {
    const msg = cellMismatch([0.05, 0.05, 0.055], [0, 0, 0]);
    expect(msg).toMatch(/wrong file, or wrong units/);
  });

  it('rejects an insert exported instead of the cube', () => {
    expect(cellMismatch([22, 22, 30], [0, 0, 0])).toMatch(/50 × 50 × 55/);
  });

  it('flags a corner-origin export and points at fit-to-cube', () => {
    const msg = cellMismatch([50, 50, 55], [25, 25, 27.5]);
    expect(msg).toMatch(/fit to cube/i);
  });

  it('says nothing before a mesh is measured', () => {
    expect(cellMismatch(null, null)).toBeNull();
  });
});

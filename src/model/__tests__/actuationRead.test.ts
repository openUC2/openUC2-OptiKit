/**
 * WP-86: the READ direction of the WP-26 device link. Firmwares disagree on
 * how they wrap an axis position, so the parser is forgiving — but when it
 * finds no number it must say so rather than invent a measurement, because
 * an invented number would be written into the design as if measured.
 */

import { describe, expect, it } from 'vitest';
import { parseAxisPosition, readTask } from '../actuation';
import type { LibraryDof } from '../../document/libraryPalette';

const DZ: LibraryDof = {
  name: 'dz', kind: 'translation', axis: 'z', unit: 'mm',
  range: [-7.5, 7.5], actuatable: true,
};
const TILT: LibraryDof = {
  name: 'tilt_x', kind: 'rotation', axis: 'x', unit: 'deg',
  range: [-5, 5], actuatable: true,
};

describe('readTask', () => {
  it('mirrors the write side: motors vs galvos', () => {
    expect(readTask(DZ)).toBe('/motor_get');
    expect(readTask(TILT)).toBe('/galvo_get');
  });
});

describe('parseAxisPosition', () => {
  it('accepts a bare number and a numeric string', () => {
    expect(parseAxisPosition(2.1, DZ)).toBe(2.1);
    expect(parseAxisPosition(' 2.1 ', DZ)).toBe(2.1);
  });

  it('accepts the common wrappers', () => {
    expect(parseAxisPosition({ position: 2.1 }, DZ)).toBe(2.1);
    expect(parseAxisPosition({ value: 2.1 }, DZ)).toBe(2.1);
    expect(parseAxisPosition({ steps: -3 }, DZ)).toBe(-3);
  });

  it('prefers the DOF name, then its axis, over generic keys', () => {
    expect(parseAxisPosition({ dz: 1.5, position: 9.9 }, DZ)).toBe(1.5);
    expect(parseAxisPosition({ z: 1.5, position: 9.9 }, DZ)).toBe(1.5);
    // A per-axis map keyed by the rotation DOF's own name.
    expect(parseAxisPosition({ tilt_x: 3, tilt_y: 4 }, TILT)).toBe(3);
  });

  it('unwraps a single-key wrapper and nested known keys', () => {
    expect(parseAxisPosition({ motor: { position: 4.2 } }, DZ)).toBe(4.2);
    expect(parseAxisPosition({ position: { z: 4.2 } }, DZ)).toBe(4.2);
  });

  it('returns null rather than guessing', () => {
    expect(parseAxisPosition({ status: 'ok' }, DZ)).toBeNull();
    expect(parseAxisPosition('moving', DZ)).toBeNull();
    expect(parseAxisPosition(null, DZ)).toBeNull();
    expect(parseAxisPosition({ position: Number.NaN }, DZ)).toBeNull();
    expect(parseAxisPosition({ position: Infinity }, DZ)).toBeNull();
    // A multi-key payload we do not understand: a number in there is NOT a
    // measurement (writing a guess into the design is the failure mode).
    expect(parseAxisPosition({ error: 'stalled', code: 3 }, DZ)).toBeNull();
  });
});

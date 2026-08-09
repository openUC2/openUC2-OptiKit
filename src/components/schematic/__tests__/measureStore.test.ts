/**
 * Measure tool store: pick pairs become measurements, leaving the tool
 * clears the sheet, and the label spells total + per-axis deltas.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { measureLabel, useMeasureStore } from '../measureStore';

const P = (x: number, y: number, z: number, label: string | null = null) => ({
  mm: [x, y, z] as [number, number, number],
  label,
});

describe('measure tool store', () => {
  beforeEach(() => useMeasureStore.getState().setActive(false));

  it('two picks make one measurement; the draft clears between pairs', () => {
    const s = useMeasureStore.getState;
    s().setActive(true);
    s().pick(P(0, 0, 0, 'lens-z'));
    expect(s().draftA?.label).toBe('lens-z');
    s().pick(P(50, 0, 0));
    expect(s().draftA).toBeNull();
    expect(s().measurements).toHaveLength(1);
    s().pick(P(0, 0, 55, 'mirror-45.reflected'));
    s().pick(P(100, 0, 55));
    expect(s().measurements).toHaveLength(2);
  });

  it('leaving the tool clears measurements, draft and cursor', () => {
    const s = useMeasureStore.getState;
    s().setActive(true);
    s().pick(P(0, 0, 0));
    s().pick(P(10, 0, 0));
    s().pick(P(20, 0, 0));
    s().setCursor(P(30, 0, 0));
    s().setActive(false);
    expect(s().measurements).toHaveLength(0);
    expect(s().draftA).toBeNull();
    expect(s().cursor).toBeNull();
  });

  it('label: single axis stays bare, diagonals spell the deltas', () => {
    expect(measureLabel([0, 0, 0], [100, 0, 0])).toBe('100.0 mm');
    expect(measureLabel([0, 0, 0], [100, 0, 55])).toBe('114.1 mm (Δx 100.0, Δz 55.0)');
    expect(measureLabel([10, 5, 0], [10, 5, 0])).toBe('0.0 mm');
  });
});

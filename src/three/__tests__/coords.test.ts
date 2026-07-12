/** Coordinate helper tests (vitest — run with `npm test`). */

import { describe, expect, it } from 'vitest';
import { moduleWorldPosition, snapGridXZ, snapLayerY, snapRotation } from '../coords';
import type { PlacedModule } from '../../types';

const m: PlacedModule = {
  id: 'test-1',
  moduleId: 'cube-1x1',
  position: { x: 2, y: 3 },
  rotation: 0,
  layer: 1,
};

describe('moduleWorldPosition', () => {
  it('maps grid (2,3) layer 1 to [100, 60, 150]', () => {
    expect(moduleWorldPosition(m)).toEqual([100, 60, 150]);
  });

  it('places the origin module on the baseplate', () => {
    expect(moduleWorldPosition({ ...m, id: 'test-2', position: { x: 0, y: 0 }, layer: 0 }))
      .toEqual([0, 5, 0]);
  });
});

describe('snapGridXZ', () => {
  it('snaps world XZ to grid cells', () => {
    expect(snapGridXZ(110, 145)).toEqual({ x: 2, y: 3 });
  });
});

describe('snapLayerY', () => {
  it('snaps world Y to layer indices, clamped at 0', () => {
    expect(snapLayerY(60)).toBe(1);
    expect(snapLayerY(5)).toBe(0);
    expect(snapLayerY(-99)).toBe(0);
  });
});

describe('snapRotation', () => {
  it('snaps degrees to the nearest 90° in [0, 360)', () => {
    expect(snapRotation(0)).toBe(0);
    expect(snapRotation(91)).toBe(90);
    expect(snapRotation(360)).toBe(0);
    expect(snapRotation(-10)).toBe(0);
    expect(snapRotation(270)).toBe(270);
    expect(snapRotation(359)).toBe(0);
  });
});

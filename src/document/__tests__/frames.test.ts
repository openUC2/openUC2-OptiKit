import { describe, expect, it } from 'vitest';

import {
  FRAME_Y_OFFSET_MM,
  optikitPointsToThree,
  optikitToThree,
  threeToOptikit,
} from '../frames';

describe('the E6 frame map', () => {
  it('renders a layer-0 module optical axis at y = 30 mm (the pinned constant)', () => {
    // A layer-0 component's optikit origin sits on its optical axis at
    // w.z = 0; the GLB cubes put that axis at three.y = 30.
    expect(FRAME_Y_OFFSET_MM).toBe(30);
    expect(optikitToThree([0, 0, 0])).toEqual([0, 30, 0]);
  });

  it('maps grid east/south/layer exactly (three.x = w.x, three.y = w.z + c, three.z = w.y)', () => {
    // Grid (x: 1, y: 3), layer 2 → w = (50, 150, 110); axis renders at
    // 2·55 + 30 = 140 (Rays3D convention: layer·55 + 30).
    expect(optikitToThree([50, 150, 110])).toEqual([50, 140, 150]);
  });

  it('round-trips exactly', () => {
    const w: [number, number, number] = [12.5, -7.25, 61.875];
    expect(threeToOptikit(optikitToThree(w))).toEqual(w);
  });

  it('bulk-remaps flat point arrays in the same layout', () => {
    const remapped = optikitPointsToThree([0, 0, 0, 50, 150, 110]);
    expect(Array.from(remapped)).toEqual([0, 30, 0, 50, 140, 150]);
  });
});

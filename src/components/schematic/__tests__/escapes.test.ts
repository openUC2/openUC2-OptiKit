/**
 * WP-52: a core escape point → a rendered escape marker (from part, the empty
 * cell the ray heads toward, and the human hint the ERC list + notification use).
 */

import { describe, expect, it } from 'vitest';
import { toEscapeMarkers } from '../serviceStore';
import type { ChainEscape } from '../../../api/coreClient';

// A mirror at cell [1,0,0] (x = 50 mm) whose reflected beam leaves heading -y
// (south); the empty cell one grid step south is [1,-1,0].
const mirrorEscape: ChainEscape = {
  source: 'laser-488nm.out',
  from_comp: 'mirror_1x1',
  from_port: 'reflected',
  origin_mm: [50, 0, 0],
  direction: [0, -1, 0],
  reason: 'no port faces this ray',
};

describe('toEscapeMarkers', () => {
  it('names the empty cell one grid step along the ray', () => {
    const [m] = toEscapeMarkers([mirrorEscape], { mirror_1x1: 'part-7' });
    expect(m.cell).toEqual([1, -1, 0]);
    expect(m.fromPartId).toBe('part-7');
    expect(m.fromLabel).toBe('mirror_1x1.reflected');
    expect(m.hint).toBe('mirror_1x1.reflected → -y — no part at cell [1, -1, 0]');
  });

  it('leaves fromPartId null when the element is not in the design map', () => {
    const [m] = toEscapeMarkers([mirrorEscape], {});
    expect(m.fromPartId).toBeNull();
    expect(m.cell).toEqual([1, -1, 0]); // hint still works
  });

  it('labels a source-direct escape with no exit port', () => {
    const [m] = toEscapeMarkers(
      [{ ...mirrorEscape, from_comp: 'laser-488nm', from_port: '', direction: [0, 0, 1] }],
      {},
    );
    expect(m.fromLabel).toBe('laser-488nm');
    // +z step at 55 mm z-pitch → cell z = 1.
    expect(m.cell).toEqual([1, 0, 1]);
  });
});

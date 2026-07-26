/**
 * Fibers (WP-46) and source runtime state (WP-47) in the document layer.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useFibersStore, defaultFiber, fibersOfPart } from '../fibersStore';

describe('fibersStore', () => {
  beforeEach(() => useFibersStore.getState().clear());

  it('lays a patch cord with multimode defaults', () => {
    const id = useFibersStore.getState().addFiber('p1.out', 'p2.fiber_in');
    const [fiber] = useFibersStore.getState().fibers;
    expect(fiber.id).toBe(id);
    expect(fiber.from).toBe('p1.out');
    expect(fiber.to).toBe('p2.fiber_in');
    // A patch cord is multimode unless told otherwise.
    expect(fiber.type).toBe('MM');
    expect(fiber.na).toBe(0.22);
  });

  it('edits properties without touching the endpoints', () => {
    const id = useFibersStore.getState().addFiber('p1.out', 'p2.in');
    useFibersStore.getState().updateFiber(id, { lengthM: 5, type: 'SM', na: null });
    const [fiber] = useFibersStore.getState().fibers;
    expect(fiber.lengthM).toBe(5);
    expect(fiber.type).toBe('SM');
    expect(fiber.na).toBeNull();
    expect(fiber.from).toBe('p1.out');
  });

  it('drops cords when either endpoint part goes away', () => {
    useFibersStore.getState().addFiber('p1.out', 'p2.in');
    useFibersStore.getState().addFiber('p3.out', 'p4.in');
    useFibersStore.getState().prunePart('p2');
    expect(useFibersStore.getState().fibers.map(f => f.from)).toEqual(['p3.out']);
  });

  it('finds the cords landing on one part, from either side', () => {
    useFibersStore.getState().addFiber('p1.out', 'p2.in');
    useFibersStore.getState().addFiber('p3.out', 'p1.aux');
    const fibers = useFibersStore.getState().fibers;
    expect(fibersOfPart('p1', fibers)).toHaveLength(2);
    expect(fibersOfPart('p2', fibers)).toHaveLength(1);
    // A part id must not match a prefix of another ('p1' vs 'p12').
    expect(fibersOfPart('p', fibers)).toHaveLength(0);
  });

  it('defaultFiber is a plain value (no store needed)', () => {
    const fiber = defaultFiber('f1', 'a.out', 'b.in');
    expect(fiber).toMatchObject({ id: 'f1', coreUm: 50, lengthM: 1, type: 'MM' });
  });
});

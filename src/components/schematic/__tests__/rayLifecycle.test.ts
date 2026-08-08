/**
 * WP-141 — a traced result is about ONE design, and says so.
 *
 * Round 23 reported three faces of one bug: deleting a beam path left its
 * rays drawn (and its row in the panel), re-routing a path silently reused
 * the OLD traversals, and the only exit was a grey overlay. Results are
 * keyed by path name and stamped with the chain they were traced over, so
 * "gone" and "re-routed" are the same test — and both DROP the result.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useServiceStore } from '../serviceStore';
import { usePathsStore } from '../../../document/pathsStore';
import type { PortRef } from '../../../document';

const result = (chain: string) => ({
  raysWorld: [
    [
      [0, 0, 0],
      [10, 0, 0],
    ],
  ] as [number, number, number][][],
  spot: null,
  paraxial: null,
  photonBudget: null,
  warnings: [],
  error: null,
  multiSpot: null,
  chain,
});

const CHAIN_A = ['laser.out', 'lens.front'] as PortRef[];
const CHAIN_B = ['laser.out', 'mirror.front'] as PortRef[];

function seed(name: string, chain: PortRef[]): void {
  // The store keys chains BY NAME — a re-route keeps the key and swaps the
  // value, which is exactly the case a name-only check cannot see.
  usePathsStore.setState({ paths: { [name]: chain } });
  useServiceStore.setState({
    simByPath: { [name]: result(JSON.stringify(chain)) },
    simRevision: 1,
  });
}

describe('traced rays follow the paths they were traced from', () => {
  beforeEach(() => {
    usePathsStore.setState({ paths: {} });
    useServiceStore.setState({ simByPath: {}, simRevision: null, escapes: [] });
  });

  it('deleting a path drops its rays — not greys them', () => {
    seed('from-laser-488', CHAIN_A);
    usePathsStore.setState({ paths: {} });
    expect(useServiceStore.getState().simByPath).toEqual({});
    // Nothing traced left ⇒ nothing to call stale.
    expect(useServiceStore.getState().simRevision).toBeNull();
  });

  it('RE-ROUTING a path drops its rays, even though the name is unchanged', () => {
    seed('from-laser-488', CHAIN_A);
    usePathsStore.setState({ paths: { 'from-laser-488': CHAIN_B } });
    expect(useServiceStore.getState().simByPath['from-laser-488']).toBeUndefined();
  });

  it('an unrelated path edit leaves a matching result alone', () => {
    seed('keep-me', CHAIN_A);
    usePathsStore.setState({ paths: { 'keep-me': CHAIN_A, 'a-new-one': CHAIN_B } });
    expect(useServiceStore.getState().simByPath['keep-me']).toBeDefined();
    expect(useServiceStore.getState().simRevision).toBe(1);
  });

  it('clearSim throws everything away, including escapes', () => {
    seed('from-laser-488', CHAIN_A);
    useServiceStore.setState({
      escapes: [{ partId: 'p1', at: 'laser.out', reason: 'x' }] as never,
    });
    useServiceStore.getState().clearSim();
    const state = useServiceStore.getState();
    expect(state.simByPath).toEqual({});
    expect(state.simRevision).toBeNull();
    expect(state.escapes).toEqual([]);
  });
});

/**
 * Fiber links (WP-46): light from one port to another with NO geometric
 * constraint — the two parts may sit anywhere, at any angle. Stored beside
 * the paths (the "netlist") until the whole document moves onto the .dsn
 * model, and persisted so patch cords survive a reload.
 *
 * A fiber is NOT a beam path: paths describe how the beam propagates through
 * free space (and the compiler enforces facing/kink tolerances); a fiber
 * simply teleports the light, and contributes its own length to the optical
 * path instead of the distance between the connectors.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortRef } from './types';

export type FiberType = 'SM' | 'MM';

export interface DocFiber {
  /** Stable id, also the name in the exported `.dsn` `fibers:` block. */
  id: string;
  from: PortRef;
  to: PortRef;
  /** Core diameter in µm (null = unspecified). */
  coreUm: number | null;
  /** Numerical aperture (null = unspecified; a MM fiber then warns in core). */
  na: number | null;
  lengthM: number;
  type: FiberType;
}

/** A new patch cord with sensible multimode defaults. */
export function defaultFiber(id: string, from: PortRef, to: PortRef): DocFiber {
  return { id, from, to, coreUm: 50, na: 0.22, lengthM: 1, type: 'MM' };
}

interface FibersState {
  fibers: DocFiber[];
  addFiber: (from: PortRef, to: PortRef) => string;
  updateFiber: (id: string, patch: Partial<Omit<DocFiber, 'id'>>) => void;
  removeFiber: (id: string) => void;
  /** Drop fibers touching a part that no longer exists. */
  prunePart: (partId: string) => void;
  clear: () => void;
}

let counter = 0;

export const useFibersStore = create<FibersState>()(
  persist(
    set => ({
      fibers: [],
      addFiber: (from, to) => {
        const id = `fiber-${++counter}-${Math.random().toString(36).slice(2, 7)}`;
        set(s => ({ fibers: [...s.fibers, defaultFiber(id, from, to)] }));
        return id;
      },
      updateFiber: (id, patch) =>
        set(s => ({
          fibers: s.fibers.map(f => (f.id === id ? { ...f, ...patch } : f)),
        })),
      removeFiber: id => set(s => ({ fibers: s.fibers.filter(f => f.id !== id) })),
      prunePart: partId =>
        set(s => ({
          fibers: s.fibers.filter(
            f => !f.from.startsWith(`${partId}.`) && !f.to.startsWith(`${partId}.`),
          ),
        })),
      clear: () => set({ fibers: [] }),
    }),
    { name: 'optikit-doc-fibers' },
  ),
);

export function listFibers(): DocFiber[] {
  return useFibersStore.getState().fibers;
}

export function addFiber(from: PortRef, to: PortRef): string {
  return useFibersStore.getState().addFiber(from, to);
}

export function updateFiber(id: string, patch: Partial<Omit<DocFiber, 'id'>>): void {
  useFibersStore.getState().updateFiber(id, patch);
}

export function removeFiber(id: string): void {
  useFibersStore.getState().removeFiber(id);
}

/** Fibers attached to either side of a port (WP-46 panel + scene). */
export function fibersOfPart(partId: string, fibers = listFibers()): DocFiber[] {
  return fibers.filter(
    f => f.from.startsWith(`${partId}.`) || f.to.startsWith(`${partId}.`),
  );
}

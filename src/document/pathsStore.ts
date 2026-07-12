/**
 * Document-level optical paths (the "netlist"), stored separately from the
 * legacy appStore until the whole document moves onto the .dsn model.
 * Persisted to localStorage so chains survive reloads alongside the layout.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortRef } from './types';

interface PathsState {
  paths: Record<string, PortRef[]>;
  setPath: (name: string, chain: PortRef[]) => void;
  removePath: (name: string) => void;
  /** Drop references to parts that no longer exist. */
  prunePart: (partId: string) => void;
  clear: () => void;
}

export const usePathsStore = create<PathsState>()(
  persist(
    set => ({
      paths: {},
      setPath: (name, chain) =>
        set(s => {
          const paths = { ...s.paths };
          if (chain.length === 0) delete paths[name];
          else paths[name] = chain;
          return { paths };
        }),
      removePath: name =>
        set(s => {
          const paths = { ...s.paths };
          delete paths[name];
          return { paths };
        }),
      prunePart: partId =>
        set(s => {
          const paths: Record<string, PortRef[]> = {};
          for (const [name, chain] of Object.entries(s.paths)) {
            const kept = chain.filter(ref => !ref.startsWith(`${partId}.`));
            if (kept.length > 0) paths[name] = kept;
          }
          return { paths };
        }),
      clear: () => set({ paths: {} }),
    }),
    { name: 'optikit-doc-paths' },
  ),
);

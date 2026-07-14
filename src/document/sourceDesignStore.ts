/**
 * Retained source design: the last imported `.dsn` document, verbatim.
 *
 * The legacy store only represents what the editor can manipulate (poses,
 * paths, DOF values). Everything else a `.dsn` carries — `optics` fragments,
 * frames/ports, `template`/`dof` declarations, `category`, location
 * components — would be lost on a store round trip. The service round trip
 * (WP-15) needs those blocks, so the importer parks the imported YAML here
 * and `serviceExport` overlays the live document state onto it when calling
 * the optikit-core service.
 *
 * `keyByPartId` links store part ids to design component keys; parts placed
 * after the import are not in it (they export as bare components).
 * `provenance` is stamped when the user accepts optimization deltas and is
 * merged into every subsequent export.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SourceProvenance {
  optimized_by: string;
  run: string;
  merit: Record<string, unknown>;
}

interface SourceDesignState {
  /** Raw YAML text of the imported optikit-design.yml (null = never imported). */
  yamlText: string | null;
  /** Store part id → design component key, established at import. */
  keyByPartId: Record<string, string>;
  provenance: SourceProvenance | null;
  setSource: (yamlText: string, keyByPartId: Record<string, string>) => void;
  setProvenance: (p: SourceProvenance) => void;
  clear: () => void;
}

export const useSourceDesignStore = create<SourceDesignState>()(
  persist(
    set => ({
      yamlText: null,
      keyByPartId: {},
      provenance: null,
      setSource: (yamlText, keyByPartId) =>
        set({ yamlText, keyByPartId, provenance: null }),
      setProvenance: provenance => set({ provenance }),
      clear: () => set({ yamlText: null, keyByPartId: {}, provenance: null }),
    }),
    { name: 'optikit-source-design' },
  ),
);

/** Design component key for a store part id (undefined for post-import parts). */
export function componentKeyOf(partId: string): string | undefined {
  return useSourceDesignStore.getState().keyByPartId[partId];
}

/** Store part id for a design component key (reverse lookup). */
export function partIdOfComponent(key: string): string | undefined {
  const map = useSourceDesignStore.getState().keyByPartId;
  return Object.keys(map).find(id => map[id] === key);
}

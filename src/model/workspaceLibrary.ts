/**
 * Workspace component library: locally persisted `user.*` records authored in
 * the component editor. These merge into the library browser next to the
 * published index; "Download record YAML" is the road from here to a
 * library PR in optikit-core.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComponentRecord } from './dsn/generated/library-component';

interface WorkspaceLibraryState {
  /** id → full record (latest saved version wins). */
  records: Record<string, ComponentRecord>;
  /** id → small data-URL snapshot of the bound geometry (WP-31). */
  thumbnails: Record<string, string>;
  save: (record: ComponentRecord) => void;
  saveThumbnail: (id: string, dataUrl: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useWorkspaceLibrary = create<WorkspaceLibraryState>()(
  persist(
    set => ({
      records: {},
      thumbnails: {},
      save: record =>
        set(s => ({ records: { ...s.records, [record.id]: record } })),
      saveThumbnail: (id, dataUrl) =>
        set(s => ({ thumbnails: { ...s.thumbnails, [id]: dataUrl } })),
      remove: id =>
        set(s => {
          const records = { ...s.records };
          const thumbnails = { ...s.thumbnails };
          delete records[id];
          delete thumbnails[id];
          return { records, thumbnails };
        }),
      clear: () => set({ records: {}, thumbnails: {} }),
    }),
    { name: 'optikit-workspace-components' },
  ),
);

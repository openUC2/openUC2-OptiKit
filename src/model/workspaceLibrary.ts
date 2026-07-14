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
  save: (record: ComponentRecord) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useWorkspaceLibrary = create<WorkspaceLibraryState>()(
  persist(
    set => ({
      records: {},
      save: record =>
        set(s => ({ records: { ...s.records, [record.id]: record } })),
      remove: id =>
        set(s => {
          const records = { ...s.records };
          delete records[id];
          return { records };
        }),
      clear: () => set({ records: {} }),
    }),
    { name: 'optikit-workspace-components' },
  ),
);

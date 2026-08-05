/**
 * Workspace component library: locally persisted `user.*` records authored in
 * the component editor. These merge into the library browser next to the
 * published index; "Download record YAML" is the road from here to a
 * library PR in optikit-core.
 *
 * WP-127: a draft keeps its BINDING too. Saving here used to store the
 * component record alone, so a draft the user had just bound to a cube came
 * back from the palette as a bare, unbound primitive — no cube, no
 * as-mounted ports, no mesh. The template/module pair (the same records the
 * library publish would write) now rides along, and the bound mesh — already
 * in IndexedDB, keyed by record id — is served to the palette as an object
 * URL so a draft cube renders like a published one.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComponentRecord } from './dsn/generated/library-component';
import { bumpLibraryIndex } from './libraryIndex';
import { deleteBindMesh, loadBindMesh } from './bindMeshStore';

/** The mechanics half of a draft, in the records' own YAML spelling. */
export interface WorkspaceBinding {
  template: Record<string, unknown>;
  module: Record<string, unknown>;
}

interface WorkspaceLibraryState {
  /** id → full record (latest saved version wins). */
  records: Record<string, ComponentRecord>;
  /** id → small data-URL snapshot of the bound geometry (WP-31). */
  thumbnails: Record<string, string>;
  /** WP-127: component id → its template/module pair, when bound. */
  bindings: Record<string, WorkspaceBinding>;
  /** WP-127: component id → object URL for the bound mesh. NOT persisted —
   * object URLs die with the page; `hydrateMeshUrl` rebuilds them. */
  meshUrls: Record<string, string>;
  save: (record: ComponentRecord) => void;
  saveThumbnail: (id: string, dataUrl: string) => void;
  /** WP-127: store (or clear, with null) the draft's mechanics pair. */
  saveBinding: (id: string, binding: WorkspaceBinding | null) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useWorkspaceLibrary = create<WorkspaceLibraryState>()(
  persist(
    set => ({
      records: {},
      thumbnails: {},
      bindings: {},
      meshUrls: {},
      save: record => {
        set(s => ({ records: { ...s.records, [record.id]: record } }));
        // WP-34: freshly saved parts appear in the palette without a reload.
        bumpLibraryIndex();
      },
      saveThumbnail: (id, dataUrl) =>
        set(s => ({ thumbnails: { ...s.thumbnails, [id]: dataUrl } })),
      saveBinding: (id, binding) => {
        set(s => {
          const bindings = { ...s.bindings };
          if (binding) bindings[id] = binding;
          else delete bindings[id];
          return { bindings };
        });
        bumpLibraryIndex();
      },
      remove: id => {
        // WP-105: the bound STP/GLB lives in IndexedDB keyed by record id.
        // Deleting the record without it left the mesh orphaned forever —
        // invisible, unreachable, and counted against the storage quota.
        void deleteBindMesh(id).catch(() => undefined);
        set(s => {
          const records = { ...s.records };
          const thumbnails = { ...s.thumbnails };
          const bindings = { ...s.bindings };
          const meshUrls = { ...s.meshUrls };
          if (meshUrls[id]) URL.revokeObjectURL(meshUrls[id]);
          delete records[id];
          delete thumbnails[id];
          delete bindings[id];
          delete meshUrls[id];
          return { records, thumbnails, bindings, meshUrls };
        });
      },
      clear: () => set({ records: {}, thumbnails: {}, bindings: {} }),
    }),
    {
      name: 'optikit-workspace-components',
      // Object URLs are per-page-load; persisting them would resurrect dead
      // blob: links that render as a "mesh failed" ghost.
      partialize: s => ({
        records: s.records,
        thumbnails: s.thumbnails,
        bindings: s.bindings,
      }),
    },
  ),
);

/** Ids whose mesh lookup already ran (found or not) — one IndexedDB round
 * trip per draft per page load, no matter how often the palette re-registers. */
const meshLookupsRun = new Set<string>();

/**
 * WP-127: make a bound draft's mesh reachable as a URL, so the assembly can
 * render it exactly like a published module's GLB. Idempotent and safe to
 * call from a render effect; bumps the library index when a URL appears.
 */
export async function hydrateMeshUrl(id: string): Promise<void> {
  if (meshLookupsRun.has(id) || useWorkspaceLibrary.getState().meshUrls[id]) return;
  meshLookupsRun.add(id);
  const mesh = await loadBindMesh(id).catch(() => null);
  if (!mesh?.glb?.byteLength) return;
  const blob = new Blob([mesh.glb.slice() as unknown as BlobPart], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  useWorkspaceLibrary.setState(s => ({ meshUrls: { ...s.meshUrls, [id]: url } }));
  bumpLibraryIndex();
}

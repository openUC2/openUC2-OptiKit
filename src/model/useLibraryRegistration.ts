/**
 * WP-92: palette/module registration as a hook ANY page can mount.
 *
 * Registration (index + workspace + unbound entries → `registerLibraryModules`)
 * used to live only inside PartLibrary, which only the schematic mounts — so a
 * holder accepted from the ASSEMBLY page bumped the index but nothing
 * re-registered the new T3 module: `renderInfoOf`/`libraryEntryOf` stayed
 * stale and the fresh cube rendered as a "no template" ghost until a page
 * with the palette happened to mount. Mounting this hook from AssemblyPage
 * (and PartLibrary itself) keeps every view's palette registry live.
 */

import { useEffect, useMemo } from 'react';
import {
  entriesFromComponents,
  entriesFromIndex,
  entriesFromWorkspace,
  groupEntriesFromIndex,
  registerLibraryGroups,
  registerLibraryModules,
} from '../document';
import { useAppStore } from '../stores/appStore';
import { assetsBaseUrl, useLibraryIndex, type IndexComponent } from './libraryIndex';
import type { LibraryPaletteEntry } from '../document/libraryPalette';
import type { ComponentRecord } from './dsn/generated/library-component';
import { mergeRepoIndexes, useMountedRepos } from './communityRepos';
import { useWorkspaceLibrary } from './workspaceLibrary';
import { useBundleLibrary } from './dsn/bundleImport';

/**
 * WP-98 follow-up: fill a HOLLOW registry entry's gaps from what else we know.
 *
 * A module can reach the index while its component/template records did not
 * (a partially copied library, a stale index build). Such an entry has no
 * fragment, no EFL, no mesh — the part then simulates as E_NO_OPTICS and
 * renders as a ghost even though the SAME data sits in the index components,
 * the user's workspace drafts, or an imported bundle. Join order: the entry's
 * own facts win; then the index component; then the workspace record; and a
 * bundle entry with the same module id donates whatever is still missing
 * (mesh, docs, template class).
 */
export function enrichEntry(
  entry: LibraryPaletteEntry,
  indexComponents: IndexComponent[],
  workspaceRecords: Record<string, ComponentRecord>,
  bundleByModule: Map<string, LibraryPaletteEntry>,
): LibraryPaletteEntry {
  let out = entry;
  const componentId = entry.componentId;
  if (componentId && entry.fragmentSurfaces.length === 0) {
    const ic = indexComponents.find(c => c.id === componentId);
    const ws = workspaceRecords[componentId];
    const wsOptics = ws?.optics as
      | { fragment?: { surfaces?: Record<string, unknown>[] } | null }
      | undefined;
    const fragment = ic?.fragment_surfaces ?? wsOptics?.fragment?.surfaces ?? [];
    const eflMm =
      entry.eflMm ??
      ic?.efl_mm ??
      (typeof ws?.effective_focal_length_mm === 'number'
        ? ws.effective_focal_length_mm
        : null);
    const wavelengthsUm =
      entry.wavelengthsUm.length > 0
        ? entry.wavelengthsUm
        : (ic?.wavelengths_um ??
          (ws as { source?: { wavelengths_um?: number[] } } | undefined)?.source
            ?.wavelengths_um ??
          []);
    if (fragment.length > 0 || eflMm !== entry.eflMm || wavelengthsUm !== entry.wavelengthsUm) {
      out = { ...out, fragmentSurfaces: fragment, eflMm, wavelengthsUm };
    }
  }
  const bundle = bundleByModule.get(entry.moduleId);
  if (bundle) {
    out = {
      ...out,
      glbUrl: out.glbUrl ?? bundle.glbUrl,
      templateClass: out.templateClass ?? bundle.templateClass,
      docs: out.docs ?? bundle.docs,
      ports: out.ports.length > 0 ? out.ports : bundle.ports,
      fragmentSurfaces:
        out.fragmentSurfaces.length > 0 ? out.fragmentSurfaces : bundle.fragmentSurfaces,
      eflMm: out.eflMm ?? bundle.eflMm,
    };
  }
  return out;
}

export function useLibraryRegistration() {
  const libraryIndex = useLibraryIndex();
  const workspaceRecords = useWorkspaceLibrary(s => s.records);
  const workspaceThumbs = useWorkspaceLibrary(s => s.thumbnails);
  // WP-98: modules a .dsn bundle registered for this session.
  const bundleEntries = useBundleLibrary(s => s.entries);
  const modules = useAppStore(s => s.modules);
  // WP-58: libraries mounted from community GitHub repos. Precedence is
  // builtin < mounted < local drafts, so a fork can ADD parts but never
  // silently override a curated openuc2.* id (clashes are surfaced by the
  // palette UI).
  const mountedRepos = useMountedRepos();
  const merged = useMemo(
    () => mergeRepoIndexes(libraryIndex.modules, libraryIndex.groups, mountedRepos),
    [libraryIndex.modules, libraryIndex.groups, mountedRepos],
  );

  useEffect(() => {
    const bundleByModule = new Map(bundleEntries.map(e => [e.moduleId, e]));
    // WP-99: resolve mesh/thumbnail assets against the index we actually
    // loaded, not against getCoreUrl(). They agree by default, but overriding
    // the index URL (the :8010 habit) used to leave every GLB pointing at
    // :8000 — a second, silent no-mesh path that draws the same ghost.
    const assetsBase = assetsBaseUrl(libraryIndex.url);
    const registry = entriesFromIndex(merged.modules, assetsBase).map(e =>
      enrichEntry(e, libraryIndex.components, workspaceRecords, bundleByModule),
    );
    const registryIds = new Set(registry.map(e => e.moduleId));
    const workspace = entriesFromWorkspace(workspaceRecords, workspaceThumbs)
      .filter(e => !registryIds.has(e.moduleId));
    const workspaceIds = new Set(workspace.map(e => e.moduleId));
    // WP-60: published symbols NO module binds place directly — grouped
    // "<category> · unbound". Local drafts with the same id keep precedence.
    const unbound = entriesFromComponents(
      libraryIndex.components,
      merged.modules,
      assetsBase,
      libraryIndex.housings,
    )
      .filter(e => !registryIds.has(e.moduleId) && !workspaceIds.has(e.moduleId))
      // WP-103: the WP-98b hollow-entry repair used to run on registry
      // entries only, so a BARE optic never got its gaps filled — exactly the
      // parts most likely to be half-published.
      .map(e => enrichEntry(e, libraryIndex.components, workspaceRecords, bundleByModule));
    // WP-98: bundle modules come LAST — a zip can never shadow the registry
    // or the user's own drafts.
    const known = new Set([
      ...registryIds,
      ...workspaceIds,
      ...unbound.map(e => e.moduleId),
    ]);
    const bundle = bundleEntries.filter(e => !known.has(e.moduleId));
    registerLibraryModules([...registry, ...workspace, ...unbound, ...bundle]);
    // WP-44: groups (the OPM arrangements) register alongside the modules.
    registerLibraryGroups(groupEntriesFromIndex(merged.groups));
  }, [merged, libraryIndex.components, libraryIndex.housings, libraryIndex.url, workspaceRecords, workspaceThumbs, bundleEntries, modules]);

  return { libraryIndex, merged, mountedRepos };
}

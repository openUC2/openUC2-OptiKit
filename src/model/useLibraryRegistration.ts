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
import { useLibraryIndex } from './libraryIndex';
import { mergeRepoIndexes, useMountedRepos } from './communityRepos';
import { useWorkspaceLibrary } from './workspaceLibrary';
import { useBundleLibrary } from './dsn/bundleImport';
import { getCoreUrl } from '../api/coreClient';

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
    const registry = entriesFromIndex(merged.modules, getCoreUrl());
    const registryIds = new Set(registry.map(e => e.moduleId));
    const workspace = entriesFromWorkspace(workspaceRecords, workspaceThumbs)
      .filter(e => !registryIds.has(e.moduleId));
    const workspaceIds = new Set(workspace.map(e => e.moduleId));
    // WP-60: published symbols NO module binds place directly — grouped
    // "<category> · unbound". Local drafts with the same id keep precedence.
    const unbound = entriesFromComponents(
      libraryIndex.components,
      merged.modules,
      getCoreUrl(),
      libraryIndex.housings,
    ).filter(e => !registryIds.has(e.moduleId) && !workspaceIds.has(e.moduleId));
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
  }, [merged, libraryIndex.components, libraryIndex.housings, workspaceRecords, workspaceThumbs, bundleEntries, modules]);

  return { libraryIndex, merged, mountedRepos };
}

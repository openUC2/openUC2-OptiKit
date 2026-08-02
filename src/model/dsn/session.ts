/**
 * Store-facing side of the .dsn import/export: applies an ImportedDesign to the
 * live document and produces the export bundle. All mutations go through the
 * src/document facade (never appStore directly).
 */

import {
  addFiber,
  addPart,
  captureUndo,
  commitUndo,
  categoryOf,
  entriesFromWorkspace,
  getSnapshot,
  libraryEntryOf,
  listLibraryEntries,
  makePortRef,
  registerLibraryModules,
  removePart,
  renamePart,
  setDofValue,
  setPartOrientation,
  setPath,
  listParts,
  listPaths,
  updateFiber,
  useFibersStore,
  useSourceDesignStore,
} from '../../document';
import { useAppStore } from '../../stores/appStore';
import { usePathsStore } from '../../document/pathsStore';
import { useWorkspaceLibrary } from '../workspaceLibrary';
import { recordToYaml } from '../componentRecord';
import type { DsnFiles } from './io';
import { designFromFiles, zipDsn, DESIGN_DECL_FILE } from './io';
import { designToParts } from './convert';
import { serviceFiles } from './serviceExport';
import { bundleFiles, registerBundleLibrary, useBundleLibrary } from './bundleImport';

/** Fold workspace + bundle entries into the live palette registration NOW —
 * the React registration hook repeats this idempotently on the next render. */
function syncRegistration(): void {
  const ws = useWorkspaceLibrary.getState();
  const existing = listLibraryEntries();
  const known = new Set(existing.map(e => e.moduleId));
  const fresh = [
    ...entriesFromWorkspace(ws.records, ws.thumbnails),
    ...useBundleLibrary.getState().entries,
  ].filter(e => !known.has(e.moduleId));
  if (fresh.length > 0) registerLibraryModules([...existing, ...fresh]);
}

/**
 * Serialize the current document to a .dsn file map. When a source design was
 * imported this is the merged document (its optics/template/dof blocks
 * survive the round trip); otherwise the plain snapshot.
 *
 * WP-98: the map also carries the `library/` records the design depends on
 * but the shared registry does not have — browser-local workspace components
 * and any session-bundle module trios that are actually placed — so an
 * exported zip is a SELF-CONTAINED setup bundle another user can import.
 */
export function exportDsnFiles(): DsnFiles {
  const files: DsnFiles = { ...serviceFiles() };
  const placedRefs = new Set<string>();
  const componentRefs = new Set<string>();
  for (const part of listParts()) {
    placedRefs.add(part.libraryRef);
    componentRefs.add(part.libraryRef);
    const componentId = libraryEntryOf(part.libraryRef)?.componentId;
    if (componentId) componentRefs.add(componentId);
  }
  for (const [id, record] of Object.entries(useWorkspaceLibrary.getState().records)) {
    if (componentRefs.has(id)) {
      files[`library/components/${id}/component.yml`] = recordToYaml(record);
    }
  }
  if (useBundleLibrary.getState().entries.some(e => placedRefs.has(e.moduleId))) {
    Object.assign(files, bundleFiles());
  }
  return files;
}

/** Export the current document as a downloadable .dsn zip. */
export async function exportDsnZip(): Promise<{ blob: Blob; filename: string }> {
  const snap = getSnapshot();
  const slug = (snap.meta.name || 'optikit-design').replace(/[^a-zA-Z0-9-_]+/g, '-');
  const blob = await zipDsn(exportDsnFiles(), `${slug}.dsn`);
  return { blob, filename: `${slug}.dsn.zip` };
}

export interface ImportReport {
  placed: number;
  skipped: string[];
  warnings: string[];
  /** WP-98: records the bundle's `library/` half registered before placing. */
  libraryComponents: number;
  libraryModules: number;
}

/**
 * Replace the current document with the design in the given .dsn file map.
 *
 * WP-98: a bundle's `library/` records register FIRST (components → workspace,
 * modules → the session bundle registry with their GLB and docs), so refs the
 * zip itself carries resolve instead of being substituted. Only refs known
 * nowhere fall back to a lookalike module (flagged in the report).
 */
export function importDsnFiles(files: DsnFiles): ImportReport {
  const bundle = registerBundleLibrary(files, {
    registeredIds: new Set(useAppStore.getState().modules.map(m => m.id)),
  });
  // Make the bundle's entries resolvable IN THIS TICK (the registration hook
  // re-registers canonically on the next render; both are idempotent).
  syncRegistration();

  const decl = designFromFiles(files);
  const imported = designToParts(decl);
  const store = useAppStore.getState();
  const skipped: string[] = [];
  const warnings = [...bundle.warnings, ...imported.warnings];
  const rawYaml =
    (files[DESIGN_DECL_FILE] ??
      Object.entries(files).find(([p]) => p.endsWith(`/${DESIGN_DECL_FILE}`))?.[1]) as
      | string
      | undefined;

  // WP-105: the WHOLE import is ONE undo step. Each placed part otherwise
  // costs ~5 history entries (removePart + addPart + setPartOrientation +
  // renamePart + setDofValue, each auto-pushing), so importing a 30-part
  // setup blew the 50-step cap and Ctrl-Z became a slow-motion replay of the
  // import instead of the way back out of it.
  const undoToken = captureUndo();

  // Clear the current document (parts + paths).
  for (const part of listParts()) removePart(part.id);
  for (const path of listPaths()) usePathsStore.getState().removePath(path.name);

  // Unknown library refs: prefer a wildcard module, else the first module of
  // the same optical category, so foreign designs stay visible/editable.
  const wildcard = store.modules.find(m => m.isWildCard)?.id;
  const byCategory = (category: string): string | undefined =>
    category
      ? store.modules.find(m => categoryOf(m.id, m) === category)?.id
      : undefined;
  const idByKey: Record<string, string> = {};
  for (const part of imported.parts) {
    const known = store.modules.some(m => m.id === part.libraryRef);
    const fallback = wildcard ?? byCategory(part.category) ?? store.modules[0]?.id;
    const moduleId = known ? part.libraryRef : fallback;
    if (!moduleId) {
      skipped.push(part.key);
      continue;
    }
    if (!known) {
      warnings.push(
        `'${part.key}': unknown library ref '${part.libraryRef}' — placed as '${moduleId}'`,
      );
    }
    // WP-101: an import reproduces the document's pose verbatim. Without the
    // opt-out, a substituted ref (unknown refs fall back to the first module
    // of the category, usually a T1 cube) would snap the part to a cell
    // centre and silently rewrite the design being imported.
    const id = addPart(moduleId, part.positionMm, { exact: true });
    if (!id) {
      skipped.push(part.key);
      continue;
    }
    idByKey[part.key] = id;
    setPartOrientation(id, part.rot24, part.offsetDeg);
    renamePart(id, part.key);
    for (const [dof, value] of Object.entries(part.dofValues)) {
      setDofValue(id, dof, value);
    }
  }

  for (const path of imported.paths) {
    const chain = path.chain
      .filter(({ key }) => idByKey[key])
      .map(({ key, port }) => makePortRef(idByKey[key], port));
    if (chain.length > 0) setPath(path.name, chain);
  }

  // WP-46: restore patch cords whose BOTH endpoints landed as placed parts.
  useFibersStore.getState().clear();
  for (const fiber of imported.fibers) {
    const fromId = idByKey[fiber.from.key];
    const toId = idByKey[fiber.to.key];
    if (!fromId || !toId) {
      warnings.push(`fiber '${fiber.id}': endpoint part missing — dropped`);
      continue;
    }
    const id = addFiber(
      makePortRef(fromId, fiber.from.port),
      makePortRef(toId, fiber.to.port),
    );
    updateFiber(id, {
      coreUm: fiber.coreUm,
      na: fiber.na,
      lengthM: fiber.lengthM,
      type: fiber.type,
    });
  }

  if (imported.meta.name || imported.meta.description) {
    store.updateSetupMetadata({
      name: imported.meta.name || store.setupMetadata.name,
      description: imported.meta.description || store.setupMetadata.description,
    });
  }

  // Park the verbatim design so service calls keep the blocks the store
  // cannot represent (optics, templates, DOF declarations, locations).
  if (rawYaml) {
    const keyByPartId = Object.fromEntries(
      Object.entries(idByKey).map(([key, id]) => [id, key]),
    );
    useSourceDesignStore.getState().setSource(rawYaml, keyByPartId);
  } else {
    useSourceDesignStore.getState().clear();
  }

  commitUndo(undoToken);

  return {
    placed: Object.keys(idByKey).length,
    skipped,
    warnings,
    libraryComponents: bundle.components,
    libraryModules: bundle.modules,
  };
}

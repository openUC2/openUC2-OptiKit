/**
 * Store-facing side of the .dsn import/export: applies an ImportedDesign to the
 * live document and produces the export bundle. All mutations go through the
 * src/document facade (never appStore directly).
 */

import {
  addFiber,
  addPart,
  categoryOf,
  getSnapshot,
  makePortRef,
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
import type { DsnFiles } from './io';
import { designFromFiles, zipDsn, DESIGN_DECL_FILE } from './io';
import { designToParts } from './convert';
import { serviceFiles } from './serviceExport';

/**
 * Serialize the current document to a .dsn file map. When a source design was
 * imported this is the merged document (its optics/template/dof blocks
 * survive the round trip); otherwise the plain snapshot.
 */
export function exportDsnFiles(): DsnFiles {
  return serviceFiles();
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
}

/**
 * Replace the current document with the design in the given .dsn file map.
 * Unknown library refs fall back to the first wildcard module definition so the
 * layout is still visible/editable (flagged in the report).
 */
export function importDsnFiles(files: DsnFiles): ImportReport {
  const decl = designFromFiles(files);
  const imported = designToParts(decl);
  const store = useAppStore.getState();
  const skipped: string[] = [];
  const warnings = [...imported.warnings];
  const rawYaml =
    (files[DESIGN_DECL_FILE] ??
      Object.entries(files).find(([p]) => p.endsWith(`/${DESIGN_DECL_FILE}`))?.[1]) as
      | string
      | undefined;

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
    const id = addPart(moduleId, part.positionMm);
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

  return { placed: Object.keys(idByKey).length, skipped, warnings };
}

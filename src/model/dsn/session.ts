/**
 * Store-facing side of the .dsn import/export: applies an ImportedDesign to the
 * live document and produces the export bundle. All mutations go through the
 * src/document facade (never appStore directly).
 */

import {
  addPart,
  getSnapshot,
  makePortRef,
  removePart,
  renamePart,
  setDofValue,
  setPartOrientation,
  setPath,
  listParts,
  listPaths,
} from '../../document';
import { useAppStore } from '../../stores/appStore';
import { usePathsStore } from '../../document/pathsStore';
import type { DsnFiles } from './io';
import { designFromFiles, serializeDesign, zipDsn, DESIGN_DECL_FILE } from './io';
import { designToParts, snapshotToDesign } from './convert';

/** Serialize the current document to a .dsn file map. */
export function exportDsnFiles(): DsnFiles {
  const { design } = snapshotToDesign(getSnapshot());
  return { [DESIGN_DECL_FILE]: serializeDesign(design) };
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

  // Clear the current document (parts + paths).
  for (const part of listParts()) removePart(part.id);
  for (const path of listPaths()) usePathsStore.getState().removePath(path.name);

  const wildcard = store.modules.find(m => m.isWildCard)?.id;
  const idByKey: Record<string, string> = {};
  for (const part of imported.parts) {
    const known = store.modules.some(m => m.id === part.libraryRef);
    const moduleId = known ? part.libraryRef : wildcard;
    if (!moduleId) {
      skipped.push(part.key);
      continue;
    }
    if (!known) {
      warnings.push(`'${part.key}': unknown library ref '${part.libraryRef}' — placed as wildcard`);
    }
    const id = addPart(moduleId, part.positionMm);
    if (!id) {
      skipped.push(part.key);
      continue;
    }
    idByKey[part.key] = id;
    setPartOrientation(id, part.rot24, part.residualYawDeg);
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

  if (imported.meta.name || imported.meta.description) {
    store.updateSetupMetadata({
      name: imported.meta.name || store.setupMetadata.name,
      description: imported.meta.description || store.setupMetadata.description,
    });
  }

  return { placed: Object.keys(idByKey).length, skipped, warnings };
}

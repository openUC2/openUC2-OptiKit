/**
 * WP-66: swap a placed part's backing library module IN PLACE.
 *
 * The pose stays EXACTLY (no defaultRotationFor re-application), the ref and
 * user params stay, and path chains survive where the new record declares a
 * port of the same name. A chain touching a port the new record does NOT
 * declare is removed whole — a chain with a hole is meaningless — and
 * reported so the UI can toast a warning. DOF values re-clamp into the new
 * template's declared range; values the new template does not declare are
 * removed. Everything lands in ONE undo step (note: the legacy undo history
 * covers parts only, so an undo restores the module id and DOF values but
 * not a dropped path — consistent with path edits everywhere else).
 */

import { libraryEntryOf } from './libraryPalette';
import {
  captureUndo,
  clearDofValue,
  commitUndo,
  getPart,
  listPaths,
  removePath,
  repointPartLibraryRef,
  setDofValue,
} from './OptikitDocument';
import { parsePortRef } from './types';

export interface SwapResult {
  /** Path names removed because the new record lacks a matching port. */
  droppedPaths: string[];
  /** DOF names whose value was clamped into the new template's range. */
  clampedDofs: string[];
  /** DOF values removed because the new template does not declare them. */
  removedDofs: string[];
}

/**
 * Re-point `partId` at `newModuleId` (a registered library palette entry).
 * Returns what was dropped/adjusted, or null when the part or entry is
 * unknown (or the swap is a no-op).
 */
export function swapPartModule(partId: string, newModuleId: string): SwapResult | null {
  const part = getPart(partId);
  const entry = libraryEntryOf(newModuleId);
  if (!part || !entry || part.libraryRef === newModuleId) return null;

  const token = captureUndo();
  repointPartLibraryRef(partId, newModuleId);

  // Paths: `<partId>.<port>` survives when the new record declares `port`.
  const portNames = new Set(entry.ports.map(p => p.name));
  const droppedPaths: string[] = [];
  for (const path of listPaths()) {
    const stale = path.chain.some(ref => {
      const parsed = parsePortRef(ref);
      return parsed.partId === partId && !portNames.has(parsed.port);
    });
    if (stale) {
      removePath(path.name);
      droppedPaths.push(path.name);
    }
  }

  // DOF values: clamp into the new declaration's range, drop orphans.
  const clampedDofs: string[] = [];
  const removedDofs: string[] = [];
  for (const dof of part.dofs) {
    const decl = entry.dofs.find(d => d.name === dof.name);
    if (!decl) {
      clearDofValue(partId, dof.name);
      removedDofs.push(dof.name);
      continue;
    }
    if (decl.range) {
      const clamped = Math.min(decl.range[1], Math.max(decl.range[0], dof.value));
      if (clamped !== dof.value) {
        setDofValue(partId, dof.name, clamped);
        clampedDofs.push(dof.name);
      }
    }
  }

  commitUndo(token);
  return { droppedPaths, clampedDofs, removedDofs };
}

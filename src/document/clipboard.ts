/**
 * WP-78: copy/paste/duplicate for placed parts — the document-model half.
 *
 * A copy carries the part's libraryRef, ref (uniquified on paste), user
 * params, DOF values and full orientation (rot24 + offset-deg residual) —
 * and deliberately NOT its chain membership: a chain names ports on a
 * specific part instance, so a pasted part is unwired. Group tags are
 * dropped too (pasting one member must not teleport a phantom group).
 * Every paste is ONE undo step.
 */

// WP-96: this used to copy the legacy store's raw euler triple verbatim,
// because two triples could realize the SAME R24 while the 2.5D yaw readout
// differed. The document now stores `rot24` itself and derives the yaw from
// it, so an orientation has exactly one spelling and copying it is lossless.
import {
  addPart,
  captureUndo,
  commitUndo,
  getPart,
  listParts,
  removePart,
  renamePart,
  setDofValue,
  setPartOrientation,
  setPartParam,
} from './OptikitDocument';
import type { Rot24 } from './rot24';
import type { Vec3 } from './types';

export interface PartClipboard {
  libraryRef: string;
  ref: string;
  params: Record<string, unknown>;
  dofValues: Record<string, number>;
  rot24: Rot24;
  offsetDeg: { x: number; y: number; z: number };
}

/** Snapshot `partId` for pasting; null for unknown parts. */
export function copyPart(partId: string): PartClipboard | null {
  const part = getPart(partId);
  if (!part) return null;
  const params = { ...part.params };
  // Group membership is an instance property, not part identity (WP-44).
  delete params.groupId;
  delete params.groupRef;
  return {
    libraryRef: part.libraryRef,
    ref: part.ref,
    params,
    dofValues: Object.fromEntries(part.dofs.map(d => [d.name, d.value])),
    rot24: { ...part.gridPose.rot24 },
    offsetDeg: { ...part.gridPose.offsetDeg },
  };
}

/**
 * `ref` uniquified against the live document: "M1" pastes as "M2" (the
 * trailing number counts up past every existing sibling), "laser" as
 * "laser-2".
 */
export function uniquifiedRef(ref: string): string {
  const existing = new Set(listParts().map(p => p.ref));
  if (!existing.has(ref)) return ref;
  const match = /^(.*?)(\d+)$/.exec(ref);
  const base = match ? match[1] : `${ref}-`;
  let n = match ? Number(match[2]) + 1 : 2;
  while (existing.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/**
 * Materialize a copied part at `positionMm` (document frame). Returns the
 * new part id, or null when the library ref no longer resolves. ONE undo
 * step; the paste is unwired (no chains) by construction.
 */
export function pastePart(clip: PartClipboard, positionMm: Vec3): string | null {
  const token = captureUndo();
  const id = addPart(clip.libraryRef, positionMm);
  if (id === null) return null;
  // addPart applied the palette's default rotation — overwrite with the
  // copied orientation (rot24 + residual, exactly as it was stored).
  setPartOrientation(id, clip.rot24, clip.offsetDeg);
  for (const [key, value] of Object.entries(clip.params)) {
    setPartParam(id, key, value);
  }
  for (const [name, value] of Object.entries(clip.dofValues)) {
    setDofValue(id, name, value);
  }
  renamePart(id, uniquifiedRef(clip.ref));
  commitUndo(token);
  return id;
}

/** Copy + paste one cell over (the Ctrl/Cmd+D verb). */
export function duplicatePart(partId: string, offsetMm: Vec3): string | null {
  const clip = copyPart(partId);
  const part = getPart(partId);
  if (!clip || !part) return null;
  const p = part.worldPose.positionMm;
  return pastePart(clip, [p[0] + offsetMm[0], p[1] + offsetMm[1], p[2] + offsetMm[2]]);
}

/** Delete as one undo step (the context menu's delete). */
export function removePartUndoable(partId: string): void {
  const token = captureUndo();
  removePart(partId);
  commitUndo(token);
}

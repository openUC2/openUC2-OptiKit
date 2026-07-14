/**
 * Sync discipline between the schematic and assembly views (WP-17).
 *
 * Both views edit the same OptikitDocument, so this is bookkeeping, not data
 * sync: we fingerprint the schematic-owned fields (world poses + optical
 * paths) and the assembly-owned fields (DOF values + module bindings)
 * separately, and remember each side's fingerprint at the moment of the last
 * explicit sync action (cubify accept / back-annotate). Comparing the live
 * fingerprints against those stamps yields the KiCad-style chip state:
 *
 *   unbuilt          — never cubified
 *   in-sync          — nothing changed since the last sync action
 *   schematic-ahead  — poses/paths changed → "Update assembly" (re-cubify)
 *   assembly-ahead   — DOF values/bindings changed → "Back-annotate"
 *   diverged         — both sides changed
 *
 * Sync actions are always explicit and reviewed — nothing here applies
 * anything automatically.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DocSnapshot } from '../../document';
import { getSnapshot } from '../../document';

export type SyncStatus =
  | 'unbuilt'
  | 'in-sync'
  | 'schematic-ahead'
  | 'assembly-ahead'
  | 'diverged';

/** djb2 — cheap, stable, good enough for change detection (not security). */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

const round3 = (v: number) => Math.round(v * 1e3) / 1e3;

/** Schematic-owned: where parts are and how the beam is chained. */
export function schematicFingerprint(snap: DocSnapshot = getSnapshot()): string {
  const parts = [...snap.parts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(p => [
      p.ref,
      p.worldPose.positionMm.map(round3),
      p.worldPose.rotation.map(round3),
    ]);
  const paths = [...snap.paths]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => [p.name, p.chain]);
  return hash(JSON.stringify({ parts, paths }));
}

/** Assembly-owned: DOF values and which module realizes each part. */
export function assemblyFingerprint(snap: DocSnapshot = getSnapshot()): string {
  const parts = [...snap.parts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(p => [
      p.ref,
      p.libraryRef,
      [...p.dofs]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(d => [d.name, round3(d.value)]),
    ]);
  return hash(JSON.stringify(parts));
}

interface SyncStamps {
  schematicHash: string;
  assemblyHash: string;
  /** ISO timestamp + which action stamped it (provenance for the tooltip). */
  at: string;
  action: 'cubify' | 'back-annotate';
}

interface SyncState {
  stamps: SyncStamps | null;
  /** Record "both sides agree as of now" after an explicit sync action. */
  markSynced: (action: SyncStamps['action']) => void;
  clear: () => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    set => ({
      stamps: null,
      markSynced: action =>
        set({
          stamps: {
            schematicHash: schematicFingerprint(),
            assemblyHash: assemblyFingerprint(),
            at: new Date().toISOString().slice(0, 19),
            action,
          },
        }),
      clear: () => set({ stamps: null }),
    }),
    { name: 'optikit-sync-stamps' },
  ),
);

export function syncStatusOf(
  stamps: SyncStamps | null,
  snap: DocSnapshot = getSnapshot(),
): SyncStatus {
  if (!stamps) return 'unbuilt';
  const schematicChanged = schematicFingerprint(snap) !== stamps.schematicHash;
  const assemblyChanged = assemblyFingerprint(snap) !== stamps.assemblyHash;
  if (schematicChanged && assemblyChanged) return 'diverged';
  if (schematicChanged) return 'schematic-ahead';
  if (assemblyChanged) return 'assembly-ahead';
  return 'in-sync';
}

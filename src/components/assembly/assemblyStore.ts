/**
 * UI state for the assembly ("board") view (WP-16): cubify results awaiting
 * review, DRC findings as markers, and the last-applied cubify stamp (the
 * WP-17 sync chip reads it). Design data flows through src/document +
 * serviceExport — never appStore.
 */

import { create } from 'zustand';
import {
  CoreServiceError,
  cubifyDesign,
  runDrc,
  type CubifyResponse,
} from '../../api/coreClient';
import { getDocRevision } from '../../document';
import { buildServiceDesign, serviceFiles } from '../../model/dsn/serviceExport';
import type { Marker } from '../schematic/MarkerList';

export interface CubifyReviewRow {
  componentKey: string;
  partId: string | null;
  cell: [number, number, number];
  offsetMm: [number, number, number];
  rot: string; // human-readable grid rotation, e.g. "z:+x x:-z" or "identity"
  offsetDeg: string; // residual rotation, '' when none
  findings: string[]; // codes hitting this component
  /** Differs from the last ACCEPTED cubify (drives the re-cubify diff view). */
  changed: boolean;
}

/** Signature for diffing a row against the last accepted state. */
function rowSignature(row: Omit<CubifyReviewRow, 'changed' | 'findings' | 'partId'>): string {
  return JSON.stringify([row.cell, row.offsetMm, row.rot, row.offsetDeg]);
}

interface AssemblyState {
  busy: boolean;
  error: { code: string; message: string } | null;
  /** Pending cubify result shown in the review dialog (null = none). */
  review: { rows: CubifyReviewRow[]; findings: Marker[]; revision: number } | null;
  /** Current DRC markers (from the last cubify apply or drc run). */
  markers: Marker[];
  /** Document revision of the last applied cubify (null = never) — WP-17 chip. */
  cubifiedRevision: number | null;
  /** componentKey → pose signature at the last ACCEPTED cubify (diff baseline). */
  acceptedSignatures: Record<string, string> | null;
  runCubify: () => Promise<void>;
  applyCubify: () => void;
  dismissCubify: () => void;
  refreshDrc: () => Promise<void>;
  /** Client-side marker for a clamped drag attempt (cleared on next DRC run). */
  reportClamp: (partId: string, dofKey: string, attempted: number, range: [number, number]) => void;
  /** Drop the clamp marker once the drag is back inside the range. */
  clearClamp: (dofKey: string) => void;
  clearError: () => void;
}

function toError(err: unknown): { code: string; message: string } {
  if (err instanceof CoreServiceError) return { code: err.code, message: err.message };
  return { code: 'E_CLIENT', message: String(err) };
}

function xyz(v: Record<string, number> | undefined): [number, number, number] {
  return [v?.x ?? 0, v?.y ?? 0, v?.z ?? 0];
}

function toMarkers(
  findings: { code: string; comp: string; axis: string; message: string }[],
  partIdByKey: Record<string, string>,
  idPrefix: string,
): Marker[] {
  return findings.map((f, i) => ({
    id: `${idPrefix}-${i}`,
    code: f.code,
    severity: f.code.startsWith('DRC_') ? ('error' as const) : ('warning' as const),
    where: f.axis ? `${f.comp}.${f.axis}` : f.comp,
    message: f.message,
    partId: partIdByKey[f.comp] ?? null,
  }));
}

export const useAssemblyStore = create<AssemblyState>((set, get) => ({
  busy: false,
  error: null,
  review: null,
  markers: [],
  cubifiedRevision: null,
  acceptedSignatures: null,
  clearError: () => set({ error: null }),

  runCubify: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const revision = getDocRevision();
      const { keyByPartId } = buildServiceDesign();
      const partIdByKey = Object.fromEntries(
        Object.entries(keyByPartId).map(([id, key]) => [key, id]),
      );
      const result: CubifyResponse = await cubifyDesign(serviceFiles());
      const baseline = get().acceptedSignatures;
      const rows: CubifyReviewRow[] = Object.entries(result.poses).map(([key, pose]) => {
        const grid = pose.rotation.grid ?? {};
        const rotParts = Object.entries(grid).map(([axis, dir]) => `${axis}:${dir}`);
        const deg = pose.rotation['offset-deg'] ?? {};
        const degParts = Object.entries(deg).map(
          ([axis, v]) => `${axis}:${(v as number).toFixed(2)}°`,
        );
        const row = {
          componentKey: key,
          partId: partIdByKey[key] ?? null,
          cell: xyz(pose.translation['offset-grid']),
          offsetMm: xyz(pose.translation['offset-mm'] as Record<string, number> | undefined),
          rot: rotParts.length > 0 ? rotParts.join(' ') : 'identity',
          offsetDeg: degParts.join(' '),
        };
        return {
          ...row,
          findings: result.findings.filter(f => f.comp === key).map(f => f.code),
          // First cubify: nothing to diff against, everything counts as new.
          changed: baseline ? baseline[key] !== rowSignature(row) : true,
        };
      });
      set({
        busy: false,
        review: {
          rows,
          findings: toMarkers(result.findings, partIdByKey, 'cubify'),
          revision,
        },
      });
    } catch (err) {
      set({ error: toError(err), busy: false });
    }
  },

  applyCubify: () => {
    const review = get().review;
    if (!review) return;
    // World poses are invariant under cubify (p = S·g + δ); applying records
    // the acceptance + makes its DRC findings the current marker set.
    const acceptedSignatures = Object.fromEntries(
      review.rows.map(r => [r.componentKey, rowSignature(r)]),
    );
    set({
      review: null,
      markers: review.findings,
      cubifiedRevision: review.revision,
      acceptedSignatures,
    });
    // The sync chip's "both sides agree as of now" stamp (WP-17).
    import('../sync/syncStore').then(m => m.useSyncStore.getState().markSynced('cubify'));
  },

  dismissCubify: () => set({ review: null }),

  refreshDrc: async () => {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const { keyByPartId } = buildServiceDesign();
      const partIdByKey = Object.fromEntries(
        Object.entries(keyByPartId).map(([id, key]) => [key, id]),
      );
      const result = await runDrc(serviceFiles());
      set({ busy: false, markers: toMarkers(result.findings, partIdByKey, 'drc') });
    } catch (err) {
      set({ error: toError(err), busy: false });
    }
  },

  reportClamp: (partId, dofKey, attempted, range) => {
    // Not a fault: the handle hit the end of the stage's declared travel and
    // stopped following the pointer. Says so, and clears once back in range.
    const limit = attempted > range[1] ? range[1] : range[0];
    const marker: Marker = {
      id: `clamp-${dofKey}`,
      code: 'DRC_RANGE',
      severity: 'warning',
      where: dofKey,
      message:
        `at its travel limit: the drag asked for ${attempted.toFixed(2)} mm, ` +
        `but this insert only travels ${range[0]} to ${range[1]} mm; ` +
        `holding at ${limit} mm`,
      partId,
    };
    set(s => ({ markers: [...s.markers.filter(m => m.id !== marker.id), marker] }));
  },

  clearClamp: dofKey =>
    set(s =>
      s.markers.some(m => m.id === `clamp-${dofKey}`)
        ? { markers: s.markers.filter(m => m.id !== `clamp-${dofKey}`) }
        : s,
    ),
}));

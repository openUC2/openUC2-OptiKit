/**
 * The design document (WP-96) — DSN-first.
 *
 * This store IS the design: a list of `DsnPart`s spelled the way the `.dsn`
 * spells them (cell + offset-mm, rot24 + offset-deg), plus the selection and
 * the undo history. Nothing here knows about `PlacedModule`, store-frame yaw,
 * or three.js — that vocabulary is gone from the editor's state and survives
 * only in `legacyLayout.ts`, which reads and writes the OLD interchange files.
 *
 * It is deliberately dumb: it holds state and applies primitive edits. Every
 * semantic (template constraints, group rigidity, default orientation) lives
 * in `OptikitDocument.ts`, the facade the editor imports.
 */

import { create } from 'zustand';
import type { DsnPart } from './types';

/** The undoable slice of the document. */
export interface DocumentSnapshot {
  parts: DsnPart[];
  selectedIds: string[];
  primaryId: string | null;
}

const HISTORY_LIMIT = 50;

interface DocumentState extends DocumentSnapshot {
  /** Undo stack (most recent last) and its redo counterpart. */
  past: DocumentSnapshot[];
  future: DocumentSnapshot[];

  // ── primitive edits (no history of their own; the facade brackets them) ──
  insertPart: (part: DsnPart) => void;
  updatePart: (partId: string, patch: Partial<DsnPart>) => void;
  deletePart: (partId: string) => void;
  replaceParts: (parts: DsnPart[]) => void;
  setSelection: (ids: string[]) => void;

  // ── history ─────────────────────────────────────────────────────────────
  snapshot: () => DocumentSnapshot;
  restore: (snap: DocumentSnapshot) => void;
  pushHistory: (snap: DocumentSnapshot) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  parts: [],
  selectedIds: [],
  primaryId: null,
  past: [],
  future: [],

  insertPart: part =>
    set(s => ({
      parts: [...s.parts, part],
      selectedIds: [part.id],
      primaryId: part.id,
    })),

  updatePart: (partId, patch) =>
    set(s => {
      const i = s.parts.findIndex(p => p.id === partId);
      if (i < 0) return s;
      const next = [...s.parts];
      next[i] = { ...next[i], ...patch };
      return { parts: next };
    }),

  deletePart: partId =>
    set(s => ({
      parts: s.parts.filter(p => p.id !== partId),
      selectedIds: s.selectedIds.filter(id => id !== partId),
      primaryId: s.primaryId === partId ? null : s.primaryId,
    })),

  replaceParts: parts =>
    set(s => ({
      parts,
      selectedIds: s.selectedIds.filter(id => parts.some(p => p.id === id)),
      primaryId: parts.some(p => p.id === s.primaryId) ? s.primaryId : null,
    })),

  setSelection: ids => {
    const unique = [...new Set(ids)];
    set({
      selectedIds: unique,
      primaryId: unique.length > 0 ? unique[unique.length - 1] : null,
    });
  },

  snapshot: () => {
    const s = get();
    return { parts: s.parts, selectedIds: s.selectedIds, primaryId: s.primaryId };
  },

  restore: snap =>
    set({ parts: snap.parts, selectedIds: snap.selectedIds, primaryId: snap.primaryId }),

  /** Record a pre-edit snapshot as one undo step; a new edit kills the redo leg. */
  pushHistory: snap =>
    set(s => ({
      past: [...s.past, snap].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set(s => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, { parts: s.parts, selectedIds: s.selectedIds, primaryId: s.primaryId }],
        parts: previous.parts,
        selectedIds: previous.selectedIds,
        primaryId: previous.primaryId,
      };
    }),

  redo: () =>
    set(s => {
      if (s.future.length === 0) return s;
      const next = s.future[s.future.length - 1];
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, { parts: s.parts, selectedIds: s.selectedIds, primaryId: s.primaryId }],
        parts: next.parts,
        selectedIds: next.selectedIds,
        primaryId: next.primaryId,
      };
    }),

  clearHistory: () => set({ past: [], future: [] }),

  reset: () => set({ parts: [], selectedIds: [], primaryId: null, past: [], future: [] }),
}));

/** Empty the document — a fresh design (and the tests' `beforeEach`). */
export function resetDocument(): void {
  useDocumentStore.getState().reset();
}

// DEV inspection handle (same convention as __assemblyScene): the store the
// APP is actually using, immune to vite's ?t= double-instance trap.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__docStore = useDocumentStore;
}

/**
 * Document revision counter: bumps whenever the *design* changes (parts or
 * paths), but not on UI-only state like selection. Service results (WP-15)
 * stamp the revision they were computed at; a mismatch marks them stale.
 */

import { create } from 'zustand';
import { useDocumentStore } from './documentStore';
import { usePathsStore } from './pathsStore';

interface RevisionState {
  revision: number;
}

export const useDocRevisionStore = create<RevisionState>(() => ({ revision: 0 }));

export function getDocRevision(): number {
  return useDocRevisionStore.getState().revision;
}

export function useDocRevision(): number {
  return useDocRevisionStore(s => s.revision);
}

// Singleton wiring: compare the underlying references so selection changes
// (which replace neither the parts array nor paths) do not count as edits.
let lastParts = useDocumentStore.getState().parts;
let lastPaths = usePathsStore.getState().paths;

useDocumentStore.subscribe(state => {
  if (state.parts !== lastParts) {
    lastParts = state.parts;
    useDocRevisionStore.setState(s => ({ revision: s.revision + 1 }));
  }
});
usePathsStore.subscribe(state => {
  if (state.paths !== lastPaths) {
    lastPaths = state.paths;
    useDocRevisionStore.setState(s => ({ revision: s.revision + 1 }));
  }
});

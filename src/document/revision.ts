/**
 * Document revision counter: bumps whenever the *design* changes (parts or
 * paths), but not on UI-only state like selection. Service results (WP-15)
 * stamp the revision they were computed at; a mismatch marks them stale.
 */

import { create } from 'zustand';
import { useAppStore } from '../stores/appStore';
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
// (which replace neither placedModules nor paths) do not count as edits.
let lastModules = useAppStore.getState().placedModules;
let lastPaths = usePathsStore.getState().paths;

useAppStore.subscribe(state => {
  if (state.placedModules !== lastModules) {
    lastModules = state.placedModules;
    useDocRevisionStore.setState(s => ({ revision: s.revision + 1 }));
  }
});
usePathsStore.subscribe(state => {
  if (state.paths !== lastPaths) {
    lastPaths = state.paths;
    useDocRevisionStore.setState(s => ({ revision: s.revision + 1 }));
  }
});

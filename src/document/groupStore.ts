/**
 * Group-instance edit state (WP-44). A placed group moves as ONE rigid unit
 * by default; "unlocking" an instance opens it for member-level editing
 * (drag a single cube, tweak its pose), the breadcrumb the property panel
 * shows. Pure UI state — membership itself lives on the parts
 * (`params.groupId`), so it survives export/import.
 */

import { create } from 'zustand';

interface GroupEditState {
  /** Instance ids currently opened for member-level editing. */
  unlocked: Record<string, boolean>;
  toggleUnlocked: (instanceId: string) => void;
  lock: (instanceId: string) => void;
}

export const useGroupEditStore = create<GroupEditState>(set => ({
  unlocked: {},
  toggleUnlocked: instanceId =>
    set(s => ({ unlocked: { ...s.unlocked, [instanceId]: !s.unlocked[instanceId] } })),
  lock: instanceId =>
    set(s => {
      const next = { ...s.unlocked };
      delete next[instanceId];
      return { unlocked: next };
    }),
}));

/** True when the instance moves as one rigid unit (the default). */
export function isGroupLocked(instanceId: string): boolean {
  return !useGroupEditStore.getState().unlocked[instanceId];
}

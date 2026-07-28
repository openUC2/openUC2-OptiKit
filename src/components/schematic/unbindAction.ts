/**
 * WP-76: run the unbind verb from any schematic surface (property panel,
 * Modules panel row menu) with one consistent toast. Notifications only —
 * the design mutation itself flows through src/document (the same exception
 * PartLibrary and ModulesPanel already use).
 */

import { unbindPart } from '../../document';
import { useAppStore } from '../../stores/appStore';

/** Unbind `partId` and toast the outcome. Returns true when it happened. */
export function runUnbind(partId: string): boolean {
  const outcome = unbindPart(partId);
  const notify = useAppStore.getState().addNotification;
  if (!outcome.ok) {
    notify({
      type: 'warning',
      title: 'cannot take the optic out',
      message: outcome.message,
      duration: 8000,
    });
    return false;
  }
  const notes: string[] = [];
  if (outcome.removedDofs.length > 0) {
    notes.push(`template DOF value(s) dropped: ${outcome.removedDofs.join(', ')}`);
  }
  if (outcome.droppedPaths.length > 0) {
    notes.push(`path(s) removed (port went missing): ${outcome.droppedPaths.join(', ')}`);
  }
  notify({
    type: outcome.droppedPaths.length > 0 ? 'warning' : 'success',
    title: 'optic taken out of the cube',
    message:
      `now ${outcome.componentId} — a free UNBOUND primitive at the same pose. ` +
      `Move it, then “generate a holder…” makes it a cube again (one undo per step).` +
      (notes.length > 0 ? ` · ${notes.join(' · ')}` : ''),
    duration: 8000,
  });
  return true;
}

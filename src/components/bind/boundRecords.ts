/**
 * WP-127 — ONE place that turns "the draft + the bind workbench" into the
 * record trio.
 *
 * This memo lived inside `MechanicsPanel`, so it was reachable only while
 * that panel was mounted. "Save to workspace library" (a button on the
 * optics tab) therefore stored the component record ALONE, and a draft the
 * user had just bound to a cube came back from the palette as an unbound
 * primitive — round 19's first report. Both callers now build the pair the
 * same way, from the same inputs.
 */

import { bindToRecords, type BoundRecords } from '../../model/bindRecord';
import type { RecordDraft } from '../../model/componentRecord';
import { useBindStore } from './bindStore';

type BindStore = ReturnType<typeof useBindStore.getState>;

/**
 * The template/module pair for a draft, or null when there is nothing to
 * bind yet (no name, and neither a pose nor datums — a pose IS a binding
 * since WP-118; datums are the legacy road's evidence).
 */
export function boundRecordsFor(
  draft: RecordDraft,
  store: BindStore,
  existingComponent: { id: string; version: string } | null,
): BoundRecords | null {
  if (!draft.name || (store.datums.length === 0 && !store.insertPose)) return null;
  return bindToRecords({
    namespace: draft.namespace,
    name: draft.name,
    category: draft.category,
    templateClass: store.templateClass,
    meshFile: store.meshFile || 'part.step',
    meshTransform: store.transform,
    // WP-109: the measured box, so the record's envelope is true.
    envelopeMm: store.meshSizeMm ?? undefined,
    datums: store.datums,
    existingComponent,
    wholeModule: store.wholeModule,
    housingOnly: store.housingOnly,
    meshFrame: store.meshFrameDetected,
    meshPoseGrid: store.meshPoseGrid,
    // WP-116: the F2 side, verbatim from the draft — the pose transforms it.
    insertPose: store.insertPose,
    recordFrames: Object.fromEntries(
      draft.frames.map(f => [f.name, [0, 0, f.zMm] as [number, number, number]]),
    ),
    recordPorts: draft.ports.map(p => ({
      name: p.name,
      frame: p.frame,
      direction: p.direction,
      afterSurface: p.afterSurface,
    })),
  });
}

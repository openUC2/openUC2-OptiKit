/**
 * WP-110 — WHAT the wizard will write, computed from the live state.
 *
 * One pure function so the terminal step, the anatomy progress panel and the
 * tests agree on the answer. The record construction itself is the existing
 * machinery (`bindToRecords` / `recordsToFiles`) — the wizard adds no second
 * way to author a trio.
 */

import {
  bindToRecords,
  recordsToFiles,
  type BindDatum,
  type InsertPose,
  type MeshTransform,
} from '../../../model/bindRecord';
import { recordToYaml, type RecordDraft } from '../../../model/componentRecord';
import type { ComponentRecord } from '../../../model/dsn/generated/library-component';
import type { Vec3 } from '../../../document';
import type { RoadId } from './wizardStore';

/** The slice of the bind store the output depends on (kept explicit so the
 * function stays pure and testable). */
export interface WizardBindState {
  glbBytes: Uint8Array | null;
  stepBytes: Uint8Array | null;
  meshFile: string;
  transform: MeshTransform;
  datums: BindDatum[];
  templateClass: 'fixed' | 'adaptive' | 'generative';
  wholeModule: boolean;
  housingOnly: boolean;
  meshSizeMm: Vec3 | null;
  /** WP-116: the F2→F3 pose the cube road authors. */
  insertPose?: InsertPose | null;
  /** WP-120: the detected mesh frame, declared on the template. */
  meshFrameDetected?: 'cube' | 'record' | null;
}

export interface WizardOutput {
  /** Library-layout path → YAML text or asset bytes. */
  files: Record<string, string | Uint8Array>;
  /** Record ids in trio order (component, template?, module?). */
  ids: string[];
  errors: string[];
  warnings: string[];
  /** No mechanics yet — only the component record exists. */
  componentOnly: boolean;
}

export function buildWizardOutput(
  road: RoadId,
  draft: RecordDraft,
  record: ComponentRecord | null,
  bind: WizardBindState,
): WizardOutput {
  if (!record) {
    return {
      files: {},
      ids: [],
      errors: ['the optical record is incomplete — go back to the step that names it'],
      warnings: [],
      componentOnly: true,
    };
  }
  const hasMechanics =
    Boolean(bind.glbBytes) &&
    (bind.datums.length > 0 || Boolean(bind.insertPose)) &&
    Boolean(draft.name);
  if (!hasMechanics) {
    return {
      files: { [`components/${record.id}/component.yml`]: recordToYaml(record) },
      ids: [record.id],
      errors: [],
      warnings:
        road === 'numbers'
          ? []
          : ['no mesh + datums yet — only the optical component record will be written'],
      componentOnly: true,
    };
  }
  const bound = bindToRecords({
    namespace: draft.namespace,
    name: draft.name,
    category: draft.category,
    templateClass: bind.templateClass,
    meshFile: bind.meshFile || 'part.step',
    meshTransform: bind.transform,
    envelopeMm: bind.meshSizeMm ?? undefined,
    datums: bind.datums,
    existingComponent: null,
    wholeModule: bind.wholeModule,
    housingOnly: bind.housingOnly,
    meshFrame: bind.meshFrameDetected ?? null,
    // WP-116: the F2 side verbatim; the pose does the transforming.
    insertPose: bind.insertPose ?? null,
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
  const files = recordsToFiles(bound, bind.meshFile || 'part.step', {
    step: bind.stepBytes,
    glb: bind.glbBytes,
    thumbnailPng: null,
  });
  // WP-116: the record ships VERBATIM (F2). The template carries the pose
  // and the posed frames — component and template agree BY CONSTRUCTION,
  // which is what WP-114's merge tried to patch at the wrong layer.
  files[`components/${record.id}/component.yml`] = recordToYaml(record);
  const ids = [
    record.id,
    bound.template.id as string,
    ...(bound.module ? [bound.module.id as string] : []),
  ];
  return {
    files,
    ids,
    errors: bound.errors,
    warnings: bound.warnings,
    componentOnly: false,
  };
}

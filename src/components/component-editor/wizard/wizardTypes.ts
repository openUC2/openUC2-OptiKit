/**
 * WP-110 — shared wizard types (kept free of components so the road files
 * satisfy react-refresh's one-kind-of-export rule).
 */

import type { PartMount, TemplateClass } from '../../../document';
import type { DatumKind } from '../../../model/bindRecord';
import type { RecordDraft } from '../../../model/componentRecord';
import type { ComponentRecord } from '../../../model/dsn/generated/library-component';
import type { RoadId } from './wizardStore';
import type { WizardOutput } from './wizardOutput';

/** What every step component receives from the shell. */
export interface WizardCtx {
  draft: RecordDraft;
  setDraft: (draft: RecordDraft) => void;
  /** The validated component record (null while the draft is incomplete). */
  record: ComponentRecord | null;
  /** validateDraft() output for the current draft. */
  errors: string[];
}

/** The live bind-store slice `blocked` predicates read. */
export interface WizardBindView {
  glbBytes: Uint8Array | null;
  datums: { kind: string }[];
  meshSizeMm: [number, number, number] | null;
}

export interface WizardStepDef {
  key: string;
  label: string;
  /** The per-step explanation — a paragraph, not a tooltip: the explanation
   * is the point, so it gets room. */
  help: string;
  Body: React.ComponentType<{ ctx: WizardCtx }>;
  /** null = may advance; otherwise the sentence saying what is missing. */
  blocked?: (ctx: WizardCtx, bind: WizardBindView) => string | null;
}

export interface RoadDef {
  id: RoadId;
  title: string;
  /** Seed category for the fresh draft this road starts with. */
  seed: () => RecordDraft;
  /** Bind-store mount defaults the road fixes (the wizard owns this). */
  applyBindDefaults: () => void;
  steps: WizardStepDef[];
  /** The anatomy layers as this road will produce them. */
  anatomy: (
    ctx: WizardCtx,
    output: WizardOutput,
  ) => {
    mount: PartMount;
    templateClass: TemplateClass | null;
    templateId: string | null;
    moduleId: string | null;
  };
  /** Terminal-step sentence: what the produced records ARE. */
  resultNote: (ctx: WizardCtx, output: WizardOutput) => string;
  /** WP-112.5: an optional "what next" button on the terminal step that
   * starts ANOTHER road with the current draft carried over. */
  signpost?: { label: string; road: RoadId };
}

/** WP-112: the datum the category's optics are measured from. */
const EXPECTED_DATUM: Record<string, { kind: DatumKind; what: string }> = {
  mirror: { kind: 'reflective', what: 'the reflective plane the beam folds at' },
  beamsplitter: { kind: 'reflective', what: 'the splitting plane' },
  dichroic: { kind: 'reflective', what: 'the dichroic coating plane' },
  source: { kind: 'source', what: 'the emission aperture the beam leaves from' },
  detector: { kind: 'sensor', what: 'the sensor plane' },
  lens: { kind: 'front', what: 'the front vertex of the lens' },
  filter: { kind: 'front', what: 'the front face' },
  sample: { kind: 'front', what: 'the sample plane' },
};

export function expectedDatumOf(category: string): { kind: DatumKind; what: string } {
  return EXPECTED_DATUM[category] ?? { kind: 'custom', what: 'the optical surface' };
}

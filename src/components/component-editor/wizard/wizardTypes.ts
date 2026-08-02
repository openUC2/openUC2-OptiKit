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
  meshBboxCenter: [number, number, number] | null;
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

// ── WP-113: the cell-measure check, at import ────────────────────────────────

/** UC2 cell + tolerance — mirrors optikit-core's library/mesh.py
 * (UC2_CELL_MM / CELL_TOL_MM), which `library validate` enforces later:
 * catching it in the wizard beats catching it when it renders on its side. */
export const UC2_CELL_MM: [number, number, number] = [50, 50, 55];
export const CELL_TOL_MM = 3.0;

/** null = the mesh measures a cell; otherwise the sentence saying how it
 * does not (wrong file, wrong units, or corner-origin export). */
export function cellMismatch(
  sizeMm: [number, number, number] | null,
  centerMm: [number, number, number] | null,
): string | null {
  if (!sizeMm) return null;
  const shown = sizeMm.map(v => v.toFixed(1)).join(' × ');
  const off = UC2_CELL_MM.map((c, i) => Math.abs(sizeMm[i] - c));
  if (Math.max(...off) > CELL_TOL_MM) {
    // The one failure with no legitimate reading — often wrong units (m vs
    // mm exports come in 1000× off) or an insert exported instead of the cube.
    return (
      `this mesh measures ${shown} mm, but a whole cube module must measure one ` +
      `50 × 50 × 55 mm cell (±${CELL_TOL_MM} mm) — wrong file, or wrong units`
    );
  }
  if (centerMm && Math.max(...centerMm.map(Math.abs)) > CELL_TOL_MM) {
    return (
      `the mesh is centred at (${centerMm.map(v => v.toFixed(1)).join(', ')}) mm, not on ` +
      'the part origin — a corner-origin export places offset by half a cell. ' +
      'Use “fit to cube” to centre it.'
    );
  }
  return null;
}

/** WP-111.5: a generated INSERT must FIT inside one cell (any orientation).
 * A returned mesh that cannot is a bridge misconfiguration — much cheaper to
 * catch here than in the assembly. */
export function insertFit(sizeMm: [number, number, number] | null): string | null {
  if (!sizeMm) return null;
  const m = [...sizeMm].sort((a, b) => a - b);
  const c = [...UC2_CELL_MM].sort((a, b) => a - b);
  if (m.every((v, i) => v <= c[i] + CELL_TOL_MM)) return null;
  return (
    `the returned insert measures ${sizeMm.map(v => v.toFixed(1)).join(' × ')} mm, which does ` +
    `not fit a 50 × 50 × 55 mm cell in any orientation — a bridge misconfiguration ` +
    '(wrong units or wrong master model), not a part to publish'
  );
}

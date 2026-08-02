/**
 * WP-110 — the parts wizard's session state, PERSISTED.
 *
 * A wizard that loses work on a reload is worse than the form it replaced
 * (WP-105 flagged the parts-editor draft as one of the four stores that hold
 * real work and never persist; this is that fix, scoped to the wizard). What
 * persists under `optikit-parts-wizard`:
 *   - which road and which step;
 *   - the RecordDraft being authored;
 *   - the bind workbench's authored state (transform, datums, template
 *     class, mount mode, mesh file name) — the mesh BYTES live in IndexedDB
 *     under the WIZARD_MESH_KEY, because localStorage cannot hold a GLB.
 *
 * The store is session state, not design state: it never touches the
 * document boundary, and finishing or cancelling the wizard clears it.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RecordDraft } from '../../../model/componentRecord';
import type { BindDatum, MeshTransform } from '../../../model/bindRecord';
import { useBindStore } from '../../bind/bindStore';

/** The three roads of WP-110 §1 — named for what the user HAS. */
export type RoadId = 'numbers' | 'device' | 'cube';

/** IndexedDB key for the in-progress wizard mesh (bindMeshStore). */
export const WIZARD_MESH_KEY = '__wizard__';

/** The bind-workbench slice worth surviving a reload. */
export interface BindSnapshot {
  meshFile: string;
  transform: MeshTransform;
  datums: BindDatum[];
  templateClass: 'fixed' | 'adaptive' | 'generative';
  wholeModule: boolean;
  housingOnly: boolean;
}

interface WizardState {
  /** null = no wizard session (the tabs are the whole editor). */
  road: RoadId | null;
  step: number;
  draft: RecordDraft | null;
  bind: BindSnapshot | null;
  /** WP-111: front-vertex offset from the CUBE ORIGIN along the optical
   * axis, mm. 0 = cube centre (what GenerateDraftHolderDialog assumes). */
  vertexOffsetMm: number;
  /** WP-111 step 3: how the optic is held (T3 = the no-bridge fallback). */
  holdClass: 'fixed' | 'adaptive' | 'generative';
  /** WP-111 T2: the declared travel range along the beam, mm. */
  dzRangeMm: [number, number];

  start: (road: RoadId, draft: RecordDraft) => void;
  setStep: (step: number) => void;
  setDraft: (draft: RecordDraft) => void;
  setVertexOffsetMm: (mm: number) => void;
  setHoldClass: (c: 'fixed' | 'adaptive' | 'generative') => void;
  setDzRangeMm: (range: [number, number]) => void;
  /** Mirror the live bind store into the persisted snapshot. */
  snapshotBind: () => void;
  /** Push the persisted snapshot back into the live bind store (resume). */
  restoreBind: () => void;
  /** End the session (finished, cancelled, or handed to the full editor). */
  clear: () => void;
}

export const usePartWizard = create<WizardState>()(
  persist(
    (set, get) => ({
      road: null,
      step: 0,
      draft: null,
      bind: null,
      vertexOffsetMm: 0,
      holdClass: 'fixed',
      dzRangeMm: [-5, 5],

      start: (road, draft) =>
        set({
          road,
          step: 0,
          draft,
          bind: null,
          vertexOffsetMm: 0,
          holdClass: 'fixed',
          dzRangeMm: [-5, 5],
        }),
      setStep: step => set({ step }),
      setDraft: draft => set({ draft }),
      setVertexOffsetMm: vertexOffsetMm => set({ vertexOffsetMm }),
      setHoldClass: holdClass => set({ holdClass }),
      setDzRangeMm: dzRangeMm => set({ dzRangeMm }),

      snapshotBind: () => {
        const b = useBindStore.getState();
        set({
          bind: {
            meshFile: b.meshFile,
            transform: b.transform,
            datums: b.datums,
            templateClass: b.templateClass,
            wholeModule: b.wholeModule,
            housingOnly: b.housingOnly,
          },
        });
      },
      restoreBind: () => {
        const snap = get().bind;
        if (!snap) return;
        useBindStore.setState({
          meshFile: snap.meshFile,
          transform: snap.transform,
          datums: snap.datums,
          templateClass: snap.templateClass,
          wholeModule: snap.wholeModule,
          housingOnly: snap.housingOnly,
        });
      },
      clear: () =>
        set({
          road: null,
          step: 0,
          draft: null,
          bind: null,
          vertexOffsetMm: 0,
          holdClass: 'fixed',
          dzRangeMm: [-5, 5],
        }),
    }),
    { name: 'optikit-parts-wizard' },
  ),
);

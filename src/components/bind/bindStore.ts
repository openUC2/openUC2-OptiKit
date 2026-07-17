/**
 * UI state for the part-binding workbench (WP-19, reworked in WP-31).
 * The mesh transform places the part relative to the 50 mm cube origin;
 * datums live in the PART frame so they follow the part when it moves or
 * rotates (world = transform ∘ datum, see model/bindRecord.ts).
 */

import { create } from 'zustand';
import type { Vec3 } from '../../document';
import type { BindDatum, DatumKind, MeshTransform } from '../../model/bindRecord';

export type BindMode = 'translate' | 'rotate' | 'datum';
export type OrthoView = 'top' | 'front' | 'side';

interface BindState {
  /** Parsed GLB bytes of the loaded part (render copy). */
  glbBytes: Uint8Array | null;
  /** Original STEP bytes when the part came in as STEP (source of truth). */
  stepBytes: Uint8Array | null;
  meshFile: string;
  transform: MeshTransform;
  datums: BindDatum[];
  mode: BindMode;
  ghostCube: boolean;
  snap: boolean;
  nextKind: DatumKind;
  busy: boolean;
  error: string | null;
  /** Single perspective view or the linked 2×2 ortho layout (WP-31). */
  quadView: boolean;
  /** Mechanical template class of the pair being authored (WP-33). */
  templateClass: 'fixed' | 'adaptive' | 'generative';
  /** Existing optical component id to bind to ('' = use/generate the draft). */
  existingComponentId: string;
  /** Per-ortho-view flip: top→bottom, front→back, side(right)→left. */
  orthoFlip: Record<OrthoView, boolean>;
  /** Draw the optical model at the datum poses (WP-40). */
  showOptics: boolean;
  /** Galvo groundwork (WP-40): mirror-normal tilt, °; the arm swings by 2θ. */
  galvoTiltDeg: number;

  loadMesh: (file: string, glb: Uint8Array, step: Uint8Array | null) => void;
  setTransform: (t: MeshTransform) => void;
  setMode: (m: BindMode) => void;
  toggleGhostCube: () => void;
  toggleSnap: () => void;
  toggleQuadView: () => void;
  setTemplateClass: (c: 'fixed' | 'adaptive' | 'generative') => void;
  setExistingComponentId: (id: string) => void;
  toggleShowOptics: () => void;
  setGalvoTiltDeg: (deg: number) => void;
  flipOrtho: (view: OrthoView) => void;
  setNextKind: (k: DatumKind) => void;
  /** Part-frame point + direction (the scene converts the click hit). */
  addDatum: (pointMm: Vec3, direction: Vec3) => void;
  updateDatum: (id: string, patch: Partial<BindDatum>) => void;
  removeDatum: (id: string) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

const DEFAULT_NAMES: Record<DatumKind, string> = {
  source: 'out',
  sensor: 'sensor',
  reflective: 'front',
  front: 'front',
  back: 'back',
  custom: 'port',
};

let datumCounter = 0;

export const useBindStore = create<BindState>((set, get) => ({
  glbBytes: null,
  stepBytes: null,
  meshFile: '',
  transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
  datums: [],
  mode: 'translate',
  ghostCube: true,
  snap: true,
  nextKind: 'source',
  busy: false,
  error: null,
  quadView: false,
  orthoFlip: { top: false, front: false, side: false },
  templateClass: 'fixed',
  existingComponentId: '',
  showOptics: true,
  galvoTiltDeg: 0,

  loadMesh: (meshFile, glbBytes, stepBytes) =>
    set({
      meshFile,
      glbBytes,
      stepBytes,
      datums: [],
      transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
      error: null,
    }),
  setTransform: transform => set({ transform }),
  setMode: mode => set({ mode }),
  toggleGhostCube: () => set(s => ({ ghostCube: !s.ghostCube })),
  toggleSnap: () => set(s => ({ snap: !s.snap })),
  toggleQuadView: () => set(s => ({ quadView: !s.quadView })),
  setTemplateClass: templateClass => set({ templateClass }),
  setExistingComponentId: existingComponentId => set({ existingComponentId }),
  toggleShowOptics: () => set(s => ({ showOptics: !s.showOptics })),
  setGalvoTiltDeg: galvoTiltDeg => set({ galvoTiltDeg }),
  flipOrtho: view =>
    set(s => ({ orthoFlip: { ...s.orthoFlip, [view]: !s.orthoFlip[view] } })),
  setNextKind: nextKind => set({ nextKind }),

  addDatum: (pointMm, direction) => {
    const kind = get().nextKind;
    const base = DEFAULT_NAMES[kind];
    const existing = new Set(get().datums.map(d => d.name));
    let name = base;
    for (let n = 2; existing.has(name); n++) name = `${base}-${n}`;
    datumCounter += 1;
    set(s => ({
      datums: [
        ...s.datums,
        { id: `datum-${datumCounter}`, name, kind, pointMm, direction, areaDiameterMm: null },
      ],
    }));
  },
  updateDatum: (id, patch) =>
    set(s => ({ datums: s.datums.map(d => (d.id === id ? { ...d, ...patch } : d)) })),
  removeDatum: id => set(s => ({ datums: s.datums.filter(d => d.id !== id) })),
  setBusy: busy => set({ busy }),
  setError: error => set({ error }),
  clear: () =>
    set({
      glbBytes: null, stepBytes: null, meshFile: '', datums: [],
      transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] }, error: null,
    }),
}));

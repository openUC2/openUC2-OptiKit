/**
 * UI state for the part-binding workbench (WP-19). Everything lives in the
 * cube frame: the mesh transform places the part relative to the 50 mm cube
 * origin, and datums are authored at their final coordinates.
 */

import { create } from 'zustand';
import type { Vec3 } from '../../document';
import type { BindDatum, DatumKind, MeshTransform } from '../../model/bindRecord';

export type BindMode = 'translate' | 'rotate' | 'datum';

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

  loadMesh: (file: string, glb: Uint8Array, step: Uint8Array | null) => void;
  setTransform: (t: MeshTransform) => void;
  setMode: (m: BindMode) => void;
  toggleGhostCube: () => void;
  toggleSnap: () => void;
  setNextKind: (k: DatumKind) => void;
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

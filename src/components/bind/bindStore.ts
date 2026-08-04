/**
 * UI state for the part-binding workbench (WP-19, reworked in WP-31).
 * The mesh transform places the part relative to the 50 mm cube origin;
 * datums live in the PART frame so they follow the part when it moves or
 * rotates (world = transform ∘ datum, see model/bindRecord.ts).
 */

import { create } from 'zustand';
import type { Vec3 } from '../../document';
import * as THREE from 'three';
import { insertPoseMatrix, type BindDatum, type DatumKind, type InsertPose, type MeshTransform } from '../../model/bindRecord';
import { decomposeRot24 } from '../../document/rot24';

/** WP-116: 'pose' — a click on the mesh sets the INSERT POSE's origin (the
 * record frame's position in the cube, F3); rotation comes from the 90°
 * steppers. The old 'datum' mode stays for the legacy housing road. */
export type BindMode = 'translate' | 'rotate' | 'datum' | 'optics' | 'pose';
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
  /** WP-114: draw the loaded STP/GLB. Off reveals the ghost cell and the
   * datums INSIDE a whole-cube export, which is otherwise opaque — the
   * reason "toggle ghost cube" looked like it did nothing. */
  showMesh: boolean;
  /** WP-116: the F2→F3 insert pose being authored (null = legacy datum
   * road). The wizard's cube road seeds identity on entry. */
  insertPose: InsertPose | null;
  /** WP-117: hide only the CUBE HALVES (the `PRT - CUBHLF` nodes of the
   * Inventor naming contract) so the INSERT is visible in place — the cube
   * is fixed, the insert is what the pose rotates. */
  hideCubeHalves: boolean;
  /** Galvo groundwork (WP-40): mirror-normal tilt, °; the arm swings by 2θ. */
  galvoTiltDeg: number;
  /** WP-42: per-placed-mirror actuation tilt (° about its own pivot), keyed by
   * datum id — sweeping one swings only that mirror's arm. */
  opticTilt: Record<string, number>;
  /** WP-41: the loaded mesh is the WHOLE cube module (not just an insert). */
  wholeModule: boolean;
  /** WP-67: the mesh is a bare HOUSING — not cube-mounted at all. Emits
   * component + housing template (footprint_grid: null), no module. */
  housingOnly: boolean;
  /** Bbox center of the loaded mesh in doc mm (reported by the scene), for
   * the "fit to cube" snap. */
  meshBboxCenter: Vec3 | null;
  /** WP-109/WP-120: the loaded mesh's measured size in FILE-NATIVE axes
   * (F3), matching optikit-core's glb_bounding_box exactly. */
  meshSizeMm: Vec3 | null;
  /** WP-120: which frame the loaded mesh is authored in — 'record' when an
   * Rx(±90°) wrapper node was detected (the pre-rotated exports), 'cube'
   * otherwise. Emitted as the template's mesh-frame declaration. */
  meshFrameDetected: 'cube' | 'record' | null;
  /** The optic instance (datum id) the placement gizmo drives, or null. */
  selectedOpticId: string | null;
  /** Placement gizmo mode in optics mode: move the optic or ROTATE it onto
   * the face (a 45° fold mirror needs the full rotation, not the ±15°
   * actuation preview). */
  opticsGizmoMode: 'translate' | 'rotate';

  loadMesh: (file: string, glb: Uint8Array, step: Uint8Array | null) => void;
  setTransform: (t: MeshTransform) => void;
  setMode: (m: BindMode) => void;
  toggleGhostCube: () => void;
  toggleSnap: () => void;
  toggleQuadView: () => void;
  setTemplateClass: (c: 'fixed' | 'adaptive' | 'generative') => void;
  setExistingComponentId: (id: string) => void;
  toggleShowOptics: () => void;
  toggleShowMesh: () => void;
  setInsertPose: (pose: InsertPose | null) => void;
  toggleHideCubeHalves: () => void;
  /** Compose a 90° world-axis step onto the insert pose and re-snap to the
   * nearest of the 24 (residual preserved through the decomposition). */
  rotateInsert90: (axis: 'x' | 'y' | 'z', sign: 1 | -1) => void;
  setInsertOffsetMm: (offsetMm: Vec3) => void;
  setInsertOffsetDeg: (offsetDeg: Vec3) => void;
  setGalvoTiltDeg: (deg: number) => void;
  setOpticTilt: (id: string, deg: number) => void;
  toggleWholeModule: () => void;
  setHousingOnly: (on: boolean) => void;
  reportMeshBbox: (centerMm: Vec3, sizeMm?: Vec3) => void;
  /** Center the mesh in the 50 mm cube (WP-41 bbox-fit). */
  fitToCube: () => void;
  selectOptic: (id: string | null) => void;
  setOpticsGizmoMode: (m: 'translate' | 'rotate') => void;
  /** Add a placeable optical primitive at the cube origin (WP-41). */
  addOptic: (kind: DatumKind) => void;
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
  showMesh: true,
  insertPose: null,
  hideCubeHalves: false,
  galvoTiltDeg: 0,
  opticTilt: {},
  wholeModule: false,
  housingOnly: false,
  meshBboxCenter: null,
  meshSizeMm: null,
  meshFrameDetected: null,
  selectedOpticId: null,
  opticsGizmoMode: 'translate',

  loadMesh: (meshFile, glbBytes, stepBytes) =>
    set({
      meshFile,
      glbBytes,
      stepBytes,
      showMesh: true,
      datums: [],
      transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
      meshBboxCenter: null,
      meshSizeMm: null,
      meshFrameDetected: null,
      selectedOpticId: null,
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
  toggleShowMesh: () => set(s => ({ showMesh: !s.showMesh })),
  setInsertPose: insertPose => set({ insertPose }),
  toggleHideCubeHalves: () => set(s => ({ hideCubeHalves: !s.hideCubeHalves })),
  rotateInsert90: (axis, sign) => {
    const pose = get().insertPose;
    if (!pose) return;
    const step = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
      (sign * Math.PI) / 2,
    );
    const composed = step.multiply(insertPoseMatrix(pose));
    const d = decomposeRot24(composed);
    // A 90° step composed onto a discrete pose is exactly discrete again —
    // round the decomposition's float dust away (±3e-15 rendered as
    // "-3.50835…e-15" in a clipped field reads like a real tilt).
    const clean = (v: number) => Math.round(v * 1e3) / 1e3 || 0;
    set({
      insertPose: {
        ...pose,
        rot24: d.rot24,
        offsetDeg: [clean(d.offsetDeg.x), clean(d.offsetDeg.y), clean(d.offsetDeg.z)],
      },
    });
  },
  setInsertOffsetMm: offsetMm => set(s => (s.insertPose ? { insertPose: { ...s.insertPose, offsetMm } } : {})),
  setInsertOffsetDeg: offsetDeg => set(s => (s.insertPose ? { insertPose: { ...s.insertPose, offsetDeg } } : {})),
  setGalvoTiltDeg: galvoTiltDeg => set({ galvoTiltDeg }),
  setOpticTilt: (id, deg) => set(s => ({ opticTilt: { ...s.opticTilt, [id]: deg } })),
  toggleWholeModule: () => set(s => ({ wholeModule: !s.wholeModule, housingOnly: false })),
  // The two special modes are exclusive: a housing is by definition not a
  // whole cube module.
  setHousingOnly: housingOnly => set(s => ({
    housingOnly,
    wholeModule: housingOnly ? false : s.wholeModule,
  })),
  reportMeshBbox: (meshBboxCenter, meshSizeMm) =>
    set(meshSizeMm ? { meshBboxCenter, meshSizeMm } : { meshBboxCenter }),
  fitToCube: () => {
    const c = get().meshBboxCenter;
    if (!c) return;
    // Center the module's bbox on the cube origin (translation only). The
    // centre is FILE-NATIVE (WP-120); the doc-frame translation p must
    // satisfy docToThree(p) = (-cx, -cy, -cz), i.e. p = (-cx, cz, -cy).
    set({ transform: { positionMm: [-c[0], c[2], -c[1]], rotationDeg: [0, 0, 0] } });
  },
  selectOptic: selectedOpticId => set({ selectedOpticId }),
  setOpticsGizmoMode: opticsGizmoMode => set({ opticsGizmoMode }),
  addOptic: kind => {
    const base = DEFAULT_NAMES[kind];
    const existing = new Set(get().datums.map(d => d.name));
    let name = base;
    for (let n = 2; existing.has(name); n++) name = `${base}-${n}`;
    datumCounter += 1;
    const id = `optic-${datumCounter}`;
    // Placed in the CUBE center facing +z; the gizmo moves it onto the face.
    set(s => ({
      datums: [
        ...s.datums,
        {
          id, name, kind,
          pointMm: [0, 0, 0], direction: [0, 0, 1],
          areaDiameterMm: kind === 'reflective' ? 25 : null,
          quaternion: [0, 0, 0, 1],
        },
      ],
      selectedOpticId: id,
      mode: 'optics',
    }));
  },
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
      transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
      meshBboxCenter: null, meshSizeMm: null, meshFrameDetected: null, selectedOpticId: null, error: null,
      wholeModule: false, housingOnly: false, showMesh: true, insertPose: null,
      hideCubeHalves: false,
    }),
}));

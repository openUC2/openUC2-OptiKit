/**
 * OptikitDocument — the single boundary between editor UI and the design model.
 *
 * Editor components (schematic view, assembly view, property panels) must import
 * ONLY from `src/document`, never `appStore` directly. Today the facade is backed
 * by the legacy appStore (`PlacedModule[]` — the flattened form of the `.dsn`
 * component tree); when the backing model becomes the `.dsn` document (WP-12+),
 * views keep working unchanged.
 *
 * Pose semantics and the store↔document frame mapping: see `mapping.ts`.
 */

import { useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import { MODULE_SIMULATION_MODELS } from '../types';
import type { ModuleDefinition, PlacedModule } from '../types';
import {
  DOC_PARAMS_KEY,
  ZERO_OFFSET_DEG,
  eulerTripleForRot24,
  getDocParams,
  gridPoseOf,
  rotateDocVec,
  splitDocYaw,
  splitWorldPosition,
  worldPoseOf,
} from './mapping';
import { defaultRotationFor, groupEntryOf, libraryEntryOf } from './libraryPalette';
import { useGroupEditStore } from './groupStore';
import type { Rot24 } from './rot24';
import { usePathsStore } from './pathsStore';
import { useFibersStore } from './fibersStore';
import { UC2_GRID_MM } from './types';
import type { DocCategory, DocDof, DocPart, DocPath, DocSnapshot, PortRef, Vec3 } from './types';

// ── category derivation ──────────────────────────────────────────────────────

const ELEMENT_TYPE_TO_CATEGORY: Record<string, DocCategory> = {
  laser: 'source',
  led: 'source',
  lens: 'lens',
  mirror: 'mirror',
  beamsplitter: 'beamsplitter',
  dichroic: 'dichroic',
  filter: 'filter',
  aperture: 'filter',
  detector: 'detector',
  fluorescent: 'sample',
  aquarium: 'sample',
  grating: 'other',
};

export function categoryOf(moduleId: string, def?: ModuleDefinition): DocCategory {
  // Library-registry modules carry their record category explicitly (WP-34).
  if (def?.docCategory) return def.docCategory as DocCategory;
  const sim = MODULE_SIMULATION_MODELS[moduleId];
  if (sim && sim.elementType !== 'compound') {
    return ELEMENT_TYPE_TO_CATEGORY[sim.elementType] ?? 'other';
  }
  if (sim?.elementType === 'compound') return 'source';
  const group = def?.group?.toLowerCase() ?? '';
  for (const [key, cat] of Object.entries(ELEMENT_TYPE_TO_CATEGORY)) {
    if (group.includes(key)) return cat;
  }
  if (group.includes('camera')) return 'detector';
  if (group.includes('light') || group.includes('illumination')) return 'source';
  if (group.includes('sample')) return 'sample';
  return 'other';
}

// ── part projection ──────────────────────────────────────────────────────────

function dofsOf(m: PlacedModule): DocDof[] {
  const values = getDocParams(m).dofValues ?? {};
  // Until library records declare DOFs (WP-12/WP-7), only explicitly set values
  // appear, with an open range.
  return Object.entries(values).map(([name, value]) => ({
    name,
    range: null,
    unit: 'mm',
    value,
  }));
}

function toDocPart(m: PlacedModule, defs: ModuleDefinition[]): DocPart {
  const def = defs.find(d => d.id === m.moduleId);
  const userParams = { ...(m.params ?? {}) };
  delete userParams[DOC_PARAMS_KEY];
  return {
    id: m.id,
    ref: m.customText || def?.name || m.moduleId,
    category: categoryOf(m.moduleId, def),
    worldPose: worldPoseOf(m),
    gridPose: gridPoseOf(m),
    libraryRef: m.moduleId,
    dofs: dofsOf(m),
    params: userParams,
  };
}

// ── read selectors (plain) ────────────────────────────────────────────────────

export function listParts(): DocPart[] {
  const s = useAppStore.getState();
  return s.placedModules.map(m => toDocPart(m, s.modules));
}

export function getPart(partId: string): DocPart | undefined {
  const s = useAppStore.getState();
  const m = s.placedModules.find(p => p.id === partId);
  return m ? toDocPart(m, s.modules) : undefined;
}

export function listPaths(): DocPath[] {
  return Object.entries(usePathsStore.getState().paths).map(([name, chain]) => ({
    name,
    chain,
  }));
}

export function getSnapshot(): DocSnapshot {
  const meta = useAppStore.getState().setupMetadata;
  return {
    parts: listParts(),
    paths: listPaths(),
    meta: { name: meta.name, description: meta.description },
  };
}

// ── commands ──────────────────────────────────────────────────────────────────

/** Place a new part; returns the new part id (or null if the module is unknown). */
export function addPart(
  libraryRef: string,
  positionMm: Vec3,
): string | null {
  const store = useAppStore.getState();
  const placement = splitWorldPosition(positionMm);
  const before = new Set(store.placedModules.map(m => m.id));
  store.placeModule(libraryRef, placement.position, placement.layer);
  const after = useAppStore.getState().placedModules;
  const created = after.find(m => !before.has(m.id));
  if (!created) return null;
  if (placement.offsetMm.some(v => v !== 0)) {
    setDocParams(created.id, { offsetMm: placement.offsetMm });
  }
  // Library records author their optics along ±z (schema convention); rotate
  // the placement so the entry beam runs along document +x and any fold arm
  // points -y — the WP-29 plane convention (like the golden designs do).
  const lib = libraryEntryOf(libraryRef);
  const rot = lib ? defaultRotationFor(lib.ports) : null;
  if (rot) setPartOrientation(created.id, rot);
  return created.id;
}

let groupCounter = 0;

export interface AddGroupResult {
  instanceId: string;
  partIds: string[];
  /** Set when the drop landed in a carrier bay and the group snapped to it. */
  snappedToBay: { carrierId: string; bay: string } | null;
  /** Set when the group's envelope exceeds the bay it docked into. */
  bayOverflow: boolean;
}

/**
 * Place a cube group (WP-44): every member — plus the structure's sandwich
 * plates and puzzle joints (WP-53) — lands as an ordinary part tagged with
 * one group-instance id, so cubify/DRC/BOM see real cubes while the editor
 * drags the arrangement as one rigid unit.
 *
 * WP-45: when the drop point falls inside a placed carrier's bay (the
 * FRAME's 3x3x2 miniFRAME slot), the group snaps to the bay origin.
 */
export function addGroup(groupId: string, positionMm: Vec3): AddGroupResult | null {
  const group = groupEntryOf(groupId);
  if (!group) return null;
  const instanceId = `grp-${Date.now().toString(36)}-${++groupCounter}`;
  const pitch = UC2_GRID_MM;

  // Drop cell (integer grid) the group's (0,0,0) member cell lands on.
  let origin: Vec3 = [
    Math.round(positionMm[0] / pitch[0]),
    Math.round(positionMm[1] / pitch[1]),
    Math.round(positionMm[2] / pitch[2]),
  ];

  // WP-45: bay docking — if the drop cell is inside a placed carrier's bay,
  // snap the group origin onto the bay origin.
  let snappedToBay: AddGroupResult['snappedToBay'] = null;
  let bayOverflow = false;
  for (const part of listParts()) {
    const lib = libraryEntryOf(part.libraryRef);
    if (!lib?.carrier || Object.keys(lib.bays).length === 0) continue;
    for (const [bayName, bay] of Object.entries(lib.bays)) {
      const bayOrigin: Vec3 = [
        part.gridPose.cell[0] + bay.originCell[0],
        part.gridPose.cell[1] + bay.originCell[1],
        part.gridPose.cell[2] + bay.originCell[2],
      ];
      const inside =
        origin[0] >= bayOrigin[0] && origin[0] < bayOrigin[0] + bay.size[0] &&
        origin[1] >= bayOrigin[1] && origin[1] < bayOrigin[1] + bay.size[1] &&
        origin[2] >= bayOrigin[2] && origin[2] < bayOrigin[2] + bay.size[2];
      if (!inside) continue;
      origin = bayOrigin;
      snappedToBay = { carrierId: part.id, bay: bayName };
      bayOverflow =
        group.envelopeGrid[0] > bay.size[0] ||
        group.envelopeGrid[1] > bay.size[1] ||
        group.envelopeGrid[2] > bay.size[2];
      break;
    }
    if (snappedToBay) break;
  }

  const partIds: string[] = [];
  const placeAt = (moduleId: string, cell: [number, number, number]): void => {
    const world: Vec3 = [
      (origin[0] + cell[0]) * pitch[0],
      (origin[1] + cell[1]) * pitch[1],
      (origin[2] + cell[2]) * pitch[2],
    ];
    const id = addPart(moduleId, world);
    if (id) {
      setPartParam(id, 'groupId', instanceId);
      setPartParam(id, 'groupRef', groupId);
      partIds.push(id);
    }
  };

  for (const member of group.members) placeAt(member.moduleId, member.cell);
  // Structure (WP-53): the bottom plate under layer 0, the top plate above
  // the highest layer, one puzzle piece per joint cell (it lives in the 5 mm
  // inter-layer gap above its cell's cube).
  const layers = group.members.filter(m => !m.overhang).map(m => m.cell[2]);
  const topLayer = layers.length > 0 ? Math.max(...layers) : 0;
  for (const plate of group.structure.plates) {
    const z = plate.face === 'bottom' ? -1 : topLayer + 1;
    placeAt(plate.moduleId, [plate.origin[0], plate.origin[1], z]);
  }
  if (group.structure.jointModuleId) {
    for (const cell of group.structure.jointCells) {
      placeAt(group.structure.jointModuleId, cell);
    }
  }

  return { instanceId, partIds, snappedToBay, bayOverflow };
}

/** Dissolve a group instance: members stay, the rigid-drag tag goes (WP-44). */
export function ungroupInstance(instanceId: string): void {
  for (const part of useAppStore
    .getState()
    .placedModules.filter(p => p.params?.groupId === instanceId)) {
    setPartParam(part.id, 'groupId', undefined);
    setPartParam(part.id, 'groupRef', undefined);
  }
  useGroupEditStore.getState().lock(instanceId);
}

/**
 * Constrain an intra-cube residual to what the part's mechanical template
 * class allows (WP-34): T1 fixed templates hold the record pose (δ = 0);
 * T2 adaptive templates only move along their declared DOF axes, clamped to
 * the declared range. Unclassified parts move freely.
 */
function constrainOffsetToTemplate(m: PlacedModule, offsetMm: Vec3): Vec3 {
  const lib = libraryEntryOf(m.moduleId);
  if (!lib?.templateClass) return offsetMm;
  if (lib.templateClass === 'fixed') return [0, 0, 0];
  if (lib.templateClass === 'adaptive' && lib.dofs.length > 0) {
    // Project the residual onto the world-frame images of the declared
    // translation axes (part-local), each clamped to its range.
    const constrained: Vec3 = [0, 0, 0];
    const rotation = worldPoseOf(m).rotation;
    for (const dof of lib.dofs) {
      if (dof.kind !== 'translation') continue;
      const local: Vec3 =
        dof.axis === 'x' ? [1, 0, 0] : dof.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const axis = rotateDocVec(rotation, local);
      let along =
        offsetMm[0] * axis[0] + offsetMm[1] * axis[1] + offsetMm[2] * axis[2];
      if (dof.range) along = Math.min(dof.range[1], Math.max(dof.range[0], along));
      constrained[0] += along * axis[0];
      constrained[1] += along * axis[1];
      constrained[2] += along * axis[2];
    }
    return constrained;
  }
  return offsetMm; // generative (T3): free inside the cube — the generator wraps it
}

/** Move a part to an absolute document-frame position in mm (continuous). */
export function movePartWorld(partId: string, positionMm: Vec3, opts?: { snap?: boolean }): void {
  // WP-44: a grouped part drags its whole instance rigidly unless the group
  // is unlocked for member editing (the delta fans out to every sibling).
  const groupId = groupInstanceOf(partId);
  if (groupId && !useGroupEditStore.getState().unlocked[groupId]) {
    const current = worldPoseOf(
      useAppStore.getState().placedModules.find(p => p.id === partId)!,
    ).positionMm;
    const delta: Vec3 = [
      positionMm[0] - current[0],
      positionMm[1] - current[1],
      positionMm[2] - current[2],
    ];
    for (const sibling of partsOfGroup(groupId)) {
      const pos = worldPoseOf(sibling).positionMm;
      movePartWorldSingle(
        sibling.id,
        [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]],
        opts,
      );
    }
    return;
  }
  movePartWorldSingle(partId, positionMm, opts);
}

function movePartWorldSingle(partId: string, positionMm: Vec3, opts?: { snap?: boolean }): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const placement = splitWorldPosition(positionMm);
  const offsetMm: Vec3 = opts?.snap
    ? [0, 0, 0]
    : constrainOffsetToTemplate(m, placement.offsetMm);
  if (m.position.x !== placement.position.x || m.position.y !== placement.position.y) {
    store.moveModule(partId, placement.position);
  }
  if (m.layer !== placement.layer) {
    store.moveModuleToLayer(partId, placement.layer);
  }
  setDocParams(partId, { offsetMm });
}

/** WP-44: the group-instance id a part belongs to (null = ungrouped). */
export function groupInstanceOf(partId: string): string | null {
  const m = useAppStore.getState().placedModules.find(p => p.id === partId);
  const gid = m?.params?.groupId;
  return typeof gid === 'string' && gid ? gid : null;
}

function partsOfGroup(instanceId: string) {
  return useAppStore
    .getState()
    .placedModules.filter(p => p.params?.groupId === instanceId);
}

/** Move a part to an integer grid cell (clears the continuous residual). */
export function movePartGrid(partId: string, cell: Vec3): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  store.moveModule(partId, { x: cell[0], y: -cell[1] });
  if (m.layer !== cell[2]) store.moveModuleToLayer(partId, cell[2]);
  setDocParams(partId, { offsetMm: [0, 0, 0] });
}

/**
 * Set the part's yaw (degrees CCW about document +z). Preserves any x/y tilt
 * residual; the yaw residual lands in offsetDeg.z (schema `offset-deg`).
 */
export function rotatePart(partId: string, yawDeg: number, opts?: { snap?: boolean }): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const { rotation, freeYawDeg } = splitDocYaw(yawDeg, opts?.snap ?? false);
  if (m.rotation !== rotation) store.rotateModule(partId, rotation);
  const prev = getDocParams(m).offsetDeg ?? ZERO_OFFSET_DEG;
  // Store free yaw is measured opposite to the document (see mapping.ts).
  setDocParams(partId, {
    offsetDeg: { x: prev.x, y: prev.y, z: -freeYawDeg },
    freeYawDeg: undefined,
  });
}

/**
 * Set the part's fine tilt residuals (degrees) about its local x (pitch) and
 * y (roll) axes — the offset-deg components the yaw ring can't reach (WP-28).
 * Omitted axes keep their value.
 */
export function tiltPart(partId: string, tilt: { x?: number; y?: number }): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const prev = getDocParams(m).offsetDeg ?? ZERO_OFFSET_DEG;
  setDocParams(partId, {
    offsetDeg: { x: tilt.x ?? prev.x, y: tilt.y ?? prev.y, z: prev.z },
    freeYawDeg: undefined,
  });
}

/**
 * Set a full axis-aligned orientation plus the offset-deg residual triple
 * (used by the .dsn importer). The residual follows the schema convention
 * R = R24 · ΔR with ΔR = Rz(z)·Rx(x)·Ry(y) in the part's local frame — since
 * WP-28 this is exact for tipped parts too.
 */
export function setPartOrientation(
  partId: string,
  rot24: Rot24,
  offsetDeg: { x?: number; y?: number; z?: number } = {},
): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const triple = eulerTripleForRot24(rot24);
  if (m.rotation !== triple.rotation) store.rotateModule(partId, triple.rotation);
  if ((m.tiltRotation ?? 0) !== triple.tiltRotation) {
    store.rotateModuleTilt(partId, triple.tiltRotation);
  }
  if ((m.topRotation ?? 0) !== triple.topRotation) {
    store.rotateModuleTop(partId, triple.topRotation);
  }
  setDocParams(partId, {
    offsetDeg: { x: offsetDeg.x ?? 0, y: offsetDeg.y ?? 0, z: offsetDeg.z ?? 0 },
    freeYawDeg: undefined,
  });
}

export function setDofValue(partId: string, dofName: string, value: number): void {
  const m = useAppStore.getState().placedModules.find(p => p.id === partId);
  if (!m) return;
  const dofValues = { ...(getDocParams(m).dofValues ?? {}), [dofName]: value };
  setDocParams(partId, { dofValues });
}

export function removePart(partId: string): void {
  useAppStore.getState().removeModule(partId);
  usePathsStore.getState().prunePart(partId);
  // WP-46: patch cords that terminated on this part go with it.
  useFibersStore.getState().prunePart(partId);
}

export function renamePart(partId: string, ref: string): void {
  useAppStore.getState().updateModuleCustomText(partId, ref);
}

/**
 * WP-61: re-point a placed part at a different library record — the
 * materialize step ("put it in a cube") swaps a bare symbol's ref for the
 * freshly written cube_module without touching pose, params or paths.
 * The revision bumps via the placedModules subscription.
 */
export function repointPartLibraryRef(partId: string, libraryRef: string): void {
  useAppStore.setState(s => ({
    placedModules: s.placedModules.map(m =>
      m.id === partId ? { ...m, moduleId: libraryRef } : m,
    ),
  }));
}

/** Set a user-level part parameter (round-trips through `.dsn` params) —
 * e.g. the selected T1 state (WP-34). */
export function setPartParam(partId: string, key: string, value: unknown): void {
  useAppStore.getState().updateModuleParams(partId, { [key]: value });
}

// ── source runtime state (WP-47) ──────────────────────────────────────────────
// Whether a source is emitting, and which of its record's lines is active.
// Round-trips through the `.dsn` as CompSpec.enabled / wavelength-um.

/** Is this source emitting? (Non-sources and unset sources read as on.) */
export function isSourceOn(part: DocPart): boolean {
  return part.params.enabled !== false;
}

/** The active line in µm, or null when the placement has not picked one. */
export function activeWavelengthUm(part: DocPart): number | null {
  const w = part.params.wavelengthUm;
  return typeof w === 'number' && w > 0 ? w : null;
}

export function setSourceOn(partId: string, on: boolean): void {
  setPartParam(partId, 'enabled', on);
}

export function setActiveWavelengthUm(partId: string, um: number | null): void {
  setPartParam(partId, 'wavelengthUm', um);
}

export function setPath(name: string, chain: PortRef[]): void {
  usePathsStore.getState().setPath(name, chain);
}

export function removePath(name: string): void {
  usePathsStore.getState().removePath(name);
}

export function selectPart(partId: string | null): void {
  useAppStore.getState().selectItem(partId, partId ? 'module' : null);
}

/**
 * Undo bracket for continuous interactions (e.g. an insert drag): capture the
 * pre-interaction state at pointer-down, commit once at pointer-up. The
 * legacy history applies `history[index-1]` on undo, so a committed step
 * pushes the pre-state AND the post-state — one undo then restores the
 * pre-interaction state, one redo re-applies the result.
 */
export interface UndoToken {
  snapshot: ReturnType<typeof storeSnapshot>;
}

function storeSnapshot() {
  const s = useAppStore.getState();
  return {
    placedModules: s.placedModules,
    annotations: s.annotations,
    layers: s.layers,
    activeLayerId: s.activeLayerId,
    selectedItems: s.selectedItems,
    selectedItemId: s.selectedItemId,
    selectedItemType: s.selectedItemType,
  };
}

export function captureUndo(): UndoToken {
  return { snapshot: storeSnapshot() };
}

export function commitUndo(token: UndoToken): void {
  const s = useAppStore.getState();
  s.pushToHistory(token.snapshot);
  s.pushToHistory(storeSnapshot());
}

export function undo(): void {
  useAppStore.getState().undo();
}

export function redo(): void {
  useAppStore.getState().redo();
}

export interface PartRenderInfo {
  glbUrl?: string;
  glbOffset?: [number, number, number];
}

/** Presentation assets for a library ref (GLB model), for the assembly view. */
export function renderInfoOf(libraryRef: string): PartRenderInfo {
  const def = useAppStore.getState().modules.find(m => m.id === libraryRef);
  return { glbUrl: def?.glbUrl, glbOffset: def?.glbOffset };
}

function setDocParams(partId: string, patch: Partial<ReturnType<typeof getDocParams>>): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  store.updateModuleParams(partId, { [DOC_PARAMS_KEY]: { ...getDocParams(m), ...patch } });
}

// ── React subscriptions ───────────────────────────────────────────────────────

/** Reactive list of parts (re-renders on any placed-module change). */
export function useDocParts(): DocPart[] {
  const placedModules = useAppStore(s => s.placedModules);
  const modules = useAppStore(s => s.modules);
  return useMemo(() => placedModules.map(m => toDocPart(m, modules)), [placedModules, modules]);
}

export function useDocPart(partId: string | null): DocPart | undefined {
  const parts = useDocParts();
  return partId ? parts.find(p => p.id === partId) : undefined;
}

export function useDocPaths(): DocPath[] {
  const paths = usePathsStore(s => s.paths);
  return useMemo(
    () => Object.entries(paths).map(([name, chain]) => ({ name, chain })),
    [paths],
  );
}

/** Reactive selected part id (module selections only). */
export function useSelectedPartId(): string | null {
  const id = useAppStore(s => s.selectedItemId);
  const type = useAppStore(s => s.selectedItemType);
  return type === 'module' ? id : null;
}

/** Subscribe outside React; returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  const a = useAppStore.subscribe(listener);
  const b = usePathsStore.subscribe(listener);
  return () => {
    a();
    b();
  };
}

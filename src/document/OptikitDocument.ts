/**
 * OptikitDocument — the single boundary between editor UI and the design model.
 *
 * Editor components (schematic view, assembly view, property panels) import
 * ONLY from `src/document`. Since WP-96 the backing model IS the `.dsn`
 * document: `useDocumentStore` holds `DsnPart[]` — cell + offset-mm, rot24 +
 * offset-deg — with the selection and the undo history. The legacy
 * `PlacedModule` shape is gone from the editor's state; it survives only in
 * `legacyLayout.ts`, which reads and writes the old interchange files.
 *
 * Pose semantics: `mapping.ts` (canonical half) and
 * `../optikit-core/DOCS/DSN-CONTRACT.md` §3.
 */

import { useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../stores/appStore';
import { MODULE_SIMULATION_MODELS } from '../types';
import type { ModuleDefinition } from '../types';
import {
  applyYawToRot24,
  gridPoseOfPart,
  rotateDocVec,
  splitWorldPosition,
  worldPoseOfPart,
} from './mapping';
import { useDocumentStore } from './documentStore';
import type { DocumentSnapshot } from './documentStore';
import { defaultRotationFor, groupEntryOf, libraryEntryOf, yawRotationFor } from './libraryPalette';
import { useGroupEditStore } from './groupStore';
import type { Rot24 } from './rot24';
import { usePathsStore } from './pathsStore';
import { useFibersStore } from './fibersStore';
import { UC2_GRID_MM, ZERO_OFFSET_DEG } from './types';
import type {
  DocCategory,
  DocDof,
  DocPart,
  DocPath,
  DocSnapshot,
  DsnPart,
  PortRef,
  Vec3,
} from './types';

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

function dofsOf(part: DsnPart): DocDof[] {
  // Until library records declare DOFs (WP-12/WP-7), only explicitly set values
  // appear, with an open range.
  return Object.entries(part.dofValues).map(([name, value]) => ({
    name,
    range: null,
    unit: 'mm',
    value,
  }));
}

function toDocPart(part: DsnPart, defs: ModuleDefinition[]): DocPart {
  const def = defs.find(d => d.id === part.libraryRef);
  return {
    id: part.id,
    ref: part.ref || def?.name || part.libraryRef,
    category: categoryOf(part.libraryRef, def),
    worldPose: worldPoseOfPart(part),
    gridPose: gridPoseOfPart(part),
    libraryRef: part.libraryRef,
    dofs: dofsOf(part),
    params: { ...part.params },
  };
}

// ── read selectors (plain) ────────────────────────────────────────────────────

/** The raw stored parts — the `.dsn` components. */
export function listDsnParts(): DsnPart[] {
  return useDocumentStore.getState().parts;
}

function findDsnPart(partId: string): DsnPart | undefined {
  return useDocumentStore.getState().parts.find(p => p.id === partId);
}

export function listParts(): DocPart[] {
  const modules = useAppStore.getState().modules;
  return useDocumentStore.getState().parts.map(p => toDocPart(p, modules));
}

export function getPart(partId: string): DocPart | undefined {
  const part = findDsnPart(partId);
  return part ? toDocPart(part, useAppStore.getState().modules) : undefined;
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

/**
 * Place a new part; returns the new part id (or null if the module is unknown).
 *
 * `opts.exact` keeps the residual verbatim — for importers that must reproduce
 * a document's pose byte-for-byte. Everything else goes through the same
 * T-class constraint the MOVE path uses (WP-101): before, a drop kept the full
 * sub-cell residual and the first pointer move of a drag silently zeroed it,
 * which read as "parts land anywhere, then snap when I touch them".
 */
export function addPart(
  libraryRef: string,
  positionMm: Vec3,
  opts?: { exact?: boolean },
): string | null {
  const def = useAppStore.getState().modules.find(m => m.id === libraryRef);
  if (!def) return null;
  const placement = splitWorldPosition(positionMm);
  // WP-124: two placement conventions, keyed on WHICH frame the ports speak.
  // 'mounted' (cube frame, insert-pose already in-plane): only YAW — pins
  // stay +z, tipping a cube is never right. 'record' (component F2): the
  // WP-29 tip — entry beam onto +x, fold arm toward -y — because ±z record
  // optics must be laid into the document plane.
  const lib = libraryEntryOf(libraryRef);
  const rot24: Rot24 =
    (lib
      ? lib.portsFrame === 'mounted'
        ? yawRotationFor(lib.ports)
        : defaultRotationFor(lib.ports)
      : null) ?? { z: '+z', x: '+x' };
  const params = { ...(def.defaultParams ?? {}) };
  const part: DsnPart = {
    id: uuidv4(),
    ref: def.isWildCard ? String(params.customText ?? '') : '',
    libraryRef,
    cell: [placement.position.x, -placement.position.y, placement.layer],
    offsetMm: placement.offsetMm,
    rot24,
    offsetDeg: { ...ZERO_OFFSET_DEG },
    dofValues: {},
    params,
  };
  // WP-101: same pose contract as movePartWorld. `constrainOffsetToTemplate`
  // is pure over the part (libraryEntryOf is a map lookup, worldPoseOfPart is
  // a pure function), so it works on a part that is not inserted yet.
  if (!opts?.exact) part.offsetMm = constrainOffsetToTemplate(part, part.offsetMm);
  autoPush();
  useDocumentStore.getState().insertPart(part);
  // A module record may carry a one-shot placement notice (safety warnings).
  if (def.notification && def.notification.trim()) {
    useAppStore.getState().addNotification({
      type: 'warning',
      title: `${def.name} Notice`,
      message: def.notification,
      duration: 6000,
    });
  }
  return part.id;
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
  // The whole arrangement is ONE undo step.
  autoPush();
  batchDepth++;
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
  batchDepth--;

  return { instanceId, partIds, snappedToBay, bayOverflow };
}

/** Dissolve a group instance: members stay, the rigid-drag tag goes (WP-44). */
export function ungroupInstance(instanceId: string): void {
  for (const part of listDsnParts().filter(p => p.params.groupId === instanceId)) {
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
function constrainOffsetToTemplate(part: DsnPart, offsetMm: Vec3): Vec3 {
  const lib = libraryEntryOf(part.libraryRef);
  if (!lib?.templateClass) return offsetMm;
  if (lib.templateClass === 'fixed') return [0, 0, 0];
  if (lib.templateClass === 'adaptive' && lib.dofs.length > 0) {
    // Project the residual onto the world-frame images of the declared
    // translation axes (part-local), each clamped to its range.
    const constrained: Vec3 = [0, 0, 0];
    const rotation = worldPoseOfPart(part).rotation;
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
    const anchor = findDsnPart(partId);
    if (!anchor) return;
    const current = worldPoseOfPart(anchor).positionMm;
    const delta: Vec3 = [
      positionMm[0] - current[0],
      positionMm[1] - current[1],
      positionMm[2] - current[2],
    ];
    autoPush();
    withBatch(() => {
      for (const sibling of partsOfGroup(groupId)) {
        const pos = worldPoseOfPart(sibling).positionMm;
        movePartWorldSingle(
          sibling.id,
          [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]],
          opts,
        );
      }
    });
    return;
  }
  movePartWorldSingle(partId, positionMm, opts);
}

function movePartWorldSingle(partId: string, positionMm: Vec3, opts?: { snap?: boolean }): void {
  const part = findDsnPart(partId);
  if (!part) return;
  const placement = splitWorldPosition(positionMm);
  const offsetMm: Vec3 = opts?.snap
    ? [0, 0, 0]
    : constrainOffsetToTemplate(part, placement.offsetMm);
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    cell: [placement.position.x, -placement.position.y, placement.layer],
    offsetMm,
  });
}

/** WP-44: the group-instance id a part belongs to (null = ungrouped). */
export function groupInstanceOf(partId: string): string | null {
  const gid = findDsnPart(partId)?.params.groupId;
  return typeof gid === 'string' && gid ? gid : null;
}

function partsOfGroup(instanceId: string): DsnPart[] {
  return listDsnParts().filter(p => p.params.groupId === instanceId);
}

/** Move a part to an integer grid cell (clears the continuous residual). */
export function movePartGrid(partId: string, cell: Vec3): void {
  if (!findDsnPart(partId)) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    cell: [...cell] as Vec3,
    offsetMm: [0, 0, 0],
  });
}

/**
 * Set the part's yaw (degrees CCW about document +z). Preserves any x/y tilt
 * residual; the yaw residual lands in offsetDeg.z (schema `offset-deg`).
 */
export function rotatePart(partId: string, yawDeg: number, opts?: { snap?: boolean }): void {
  const part = findDsnPart(partId);
  if (!part) return;
  // WP-136: a T1 cube is BOUND to the grid — its only legal yaws are the
  // four 90° states, exactly like its offsets are pinned to the cell
  // (constrainOffsetToTemplate). This is the one choke point every yaw
  // road passes through (property panel, yaw ring), so quantizing here
  // makes "I rotated a fixed cube to 55°" structurally impossible instead
  // of a per-widget rule.
  const lib = libraryEntryOf(part.libraryRef);
  const t1Cube = lib?.templateClass === 'fixed' && lib.mount === 'cube';
  const snap = t1Cube || (opts?.snap ?? false);
  // Yaw replaces ONLY the yaw component of the discrete orientation; any
  // tilt/roll stays put, and the sub-90° remainder becomes the offset-deg
  // residual. `applyYawToRot24` is the exact inverse of `partYawDeg`.
  const { rot24, residualDeg } = applyYawToRot24(part.rot24, yawDeg, snap);
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    rot24,
    offsetDeg: { x: part.offsetDeg.x, y: part.offsetDeg.y, z: residualDeg },
  });
}

/**
 * Set the part's fine tilt residuals (degrees) about its local x (pitch) and
 * y (roll) axes — the offset-deg components the yaw ring can't reach (WP-28).
 * Omitted axes keep their value.
 */
export function tiltPart(partId: string, tilt: { x?: number; y?: number }): void {
  const part = findDsnPart(partId);
  if (!part) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    offsetDeg: {
      x: tilt.x ?? part.offsetDeg.x,
      y: tilt.y ?? part.offsetDeg.y,
      z: part.offsetDeg.z,
    },
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
  if (!findDsnPart(partId)) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    rot24: { ...rot24 },
    offsetDeg: { x: offsetDeg.x ?? 0, y: offsetDeg.y ?? 0, z: offsetDeg.z ?? 0 },
  });
}

export function setDofValue(partId: string, dofName: string, value: number): void {
  const part = findDsnPart(partId);
  if (!part) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, {
    dofValues: { ...part.dofValues, [dofName]: value },
  });
}

/** WP-66: remove a stored DOF value (a module swap dropped the DOF). */
export function clearDofValue(partId: string, dofName: string): void {
  const part = findDsnPart(partId);
  if (!part || !(dofName in part.dofValues)) return;
  const dofValues = { ...part.dofValues };
  delete dofValues[dofName];
  autoPush();
  useDocumentStore.getState().updatePart(partId, { dofValues });
}

export function removePart(partId: string): void {
  if (!findDsnPart(partId)) return;
  autoPush();
  useDocumentStore.getState().deletePart(partId);
  usePathsStore.getState().prunePart(partId);
  // WP-46: patch cords that terminated on this part go with it.
  useFibersStore.getState().prunePart(partId);
}

export function renamePart(partId: string, ref: string): void {
  if (!findDsnPart(partId)) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, { ref });
}

/**
 * WP-61: re-point a placed part at a different library record — the
 * materialize step ("put it in a cube") swaps a bare symbol's ref for the
 * freshly written cube_module without touching pose, params or paths.
 * The revision bumps via the placedModules subscription.
 */
export function repointPartLibraryRef(partId: string, libraryRef: string): void {
  if (!findDsnPart(partId)) return;
  autoPush();
  useDocumentStore.getState().updatePart(partId, { libraryRef });
}

/** Set a user-level part parameter (round-trips through `.dsn` params) —
 * e.g. the selected T1 state (WP-34). */
export function setPartParam(partId: string, key: string, value: unknown): void {
  const part = findDsnPart(partId);
  if (!part) return;
  const params = { ...part.params };
  if (value === undefined) delete params[key];
  else params[key] = value;
  autoPush();
  useDocumentStore.getState().updatePart(partId, { params });
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
  useDocumentStore.getState().setSelection(partId ? [partId] : []);
}

// ── multi-selection (WP-71) ──────────────────────────────────────────────────
// The document keeps the selection SET; its last member is the "primary"
// selection the single-part panels read.

/** Every selected part id (the primary selection included). */
export function listSelectedPartIds(): string[] {
  return useDocumentStore.getState().selectedIds;
}

/** Replace the selection; the last id becomes the primary one. */
export function setSelectedParts(partIds: string[]): void {
  useDocumentStore.getState().setSelection(partIds);
}

/** Shift-click semantics: add when absent, remove when present. */
export function togglePartSelection(partId: string): void {
  const current = listSelectedPartIds();
  setSelectedParts(
    current.includes(partId)
      ? current.filter(id => id !== partId)
      : [...current, partId],
  );
}

// ── undo ─────────────────────────────────────────────────────────────────────
// Every command records the pre-edit state as one undo step. A bracket
// (captureUndo … commitUndo) suppresses those intermediate records so a whole
// interaction — a drag, a group placement, a swap — is exactly ONE step.

export interface UndoToken {
  snapshot: DocumentSnapshot;
}

let batchDepth = 0;

/** Record the pre-edit state, unless a bracket already owns this step. */
function autoPush(): void {
  if (batchDepth > 0) return;
  const store = useDocumentStore.getState();
  store.pushHistory(store.snapshot());
}

/** Run `fn` as one undo step (used internally for fan-outs). */
function withBatch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
  }
}

export function captureUndo(): UndoToken {
  const token = { snapshot: useDocumentStore.getState().snapshot() };
  batchDepth++;
  return token;
}

export function commitUndo(token: UndoToken): void {
  batchDepth = Math.max(0, batchDepth - 1);
  if (batchDepth > 0) return; // an outer bracket owns the step
  const store = useDocumentStore.getState();
  // Nothing changed → nothing to undo.
  if (store.parts === token.snapshot.parts) return;
  store.pushHistory(token.snapshot);
}

export function undo(): void {
  useDocumentStore.getState().undo();
}

export function redo(): void {
  useDocumentStore.getState().redo();
}

export interface PartRenderInfo {
  glbUrl?: string;
  glbOffset?: [number, number, number];
  /** WP-123: which frame the GLB content speaks ('cube' | 'record' | ''). */
  meshFrame?: string;
  /** WP-137: the FILE→cube correction grid [z, x] (wins over meshFrame). */
  meshPoseGrid?: [string, string] | null;
}

/** Presentation assets for a library ref (GLB model), for the assembly view. */
export function renderInfoOf(libraryRef: string): PartRenderInfo {
  const def = useAppStore.getState().modules.find(m => m.id === libraryRef);
  return {
    glbUrl: def?.glbUrl,
    glbOffset: def?.glbOffset,
    meshFrame: def?.meshFrame,
    meshPoseGrid: def?.meshPoseGrid ?? null,
  };
}

// ── React subscriptions ───────────────────────────────────────────────────────

/** Reactive list of parts (re-renders on any document change). */
export function useDocParts(): DocPart[] {
  const parts = useDocumentStore(s => s.parts);
  const modules = useAppStore(s => s.modules);
  return useMemo(() => parts.map(p => toDocPart(p, modules)), [parts, modules]);
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

/** Reactive primary selection. */
export function useSelectedPartId(): string | null {
  return useDocumentStore(s => s.primaryId);
}

/** WP-71: reactive multi-selection (empty when nothing is selected). */
export function useSelectedPartIds(): string[] {
  return useDocumentStore(s => s.selectedIds);
}

/** Subscribe outside React; returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  const a = useDocumentStore.subscribe(listener);
  const b = usePathsStore.subscribe(listener);
  return () => {
    a();
    b();
  };
}

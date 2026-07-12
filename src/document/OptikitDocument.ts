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
  eulerTripleForRot24,
  getDocParams,
  gridPoseOf,
  splitDocYaw,
  splitWorldPosition,
  worldPoseOf,
} from './mapping';
import type { Rot24 } from './rot24';
import { usePathsStore } from './pathsStore';
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
  return created.id;
}

/** Move a part to an absolute document-frame position in mm (continuous). */
export function movePartWorld(partId: string, positionMm: Vec3, opts?: { snap?: boolean }): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const placement = splitWorldPosition(positionMm);
  const offsetMm: Vec3 = opts?.snap ? [0, 0, 0] : placement.offsetMm;
  if (m.position.x !== placement.position.x || m.position.y !== placement.position.y) {
    store.moveModule(partId, placement.position);
  }
  if (m.layer !== placement.layer) {
    store.moveModuleToLayer(partId, placement.layer);
  }
  setDocParams(partId, { offsetMm });
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

/** Set the part's yaw (degrees CCW about document +z). */
export function rotatePart(partId: string, yawDeg: number, opts?: { snap?: boolean }): void {
  const store = useAppStore.getState();
  const m = store.placedModules.find(p => p.id === partId);
  if (!m) return;
  const { rotation, freeYawDeg } = splitDocYaw(yawDeg, opts?.snap ?? false);
  if (m.rotation !== rotation) store.rotateModule(partId, rotation);
  setDocParams(partId, { freeYawDeg });
}

/**
 * Set a full axis-aligned orientation plus a residual yaw (used by the .dsn
 * importer). The residual is applied about the document z axis; for parts whose
 * local z is tipped away from vertical the .dsn `offset-deg` residual is only
 * representable when it is zero — callers should warn in that case.
 */
export function setPartOrientation(partId: string, rot24: Rot24, residualYawDeg = 0): void {
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
  // Store free yaw is measured opposite to the document (see mapping.ts).
  setDocParams(partId, { freeYawDeg: -residualYawDeg });
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
}

export function renamePart(partId: string, ref: string): void {
  useAppStore.getState().updateModuleCustomText(partId, ref);
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

/**
 * Library palette (WP-34): registry/workspace parts as first-class palette
 * modules.
 *
 * The schematic palette historically only knew the CSV modules baked into the
 * app. This module feeds it from the OTHER two sources — the published
 * registry index (`useLibraryIndex`) and locally authored workspace records —
 * by registering synthetic `ModuleDefinition`s (group "Library") in the
 * legacy store. Everything downstream (placement, category, GLB rendering)
 * then works unchanged, while the pieces the store cannot represent live
 * here: record-style ports, the mechanical template class (T1/T2/T3), DOF
 * declarations, and discrete T1 states.
 *
 * Record optics use ±z as the optical axis (schema convention); the document
 * plane wants the beam along +x. Placement therefore applies DEFAULT_LIB_ROT
 * ({z:'+x', x:'-z'} — the same grid rotation the golden designs use) instead
 * of remapping the ports, so a `.dsn` export carries the record optics
 * verbatim and the service agrees with the canvas.
 */

import * as THREE from 'three';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';
import type { ComponentRecord } from '../model/dsn/generated/library-component';
import type { IndexModule } from '../model/libraryIndex';
import type { SourcePort } from './sourceDesignStore';
import type { AxisDir, Rot24 } from './rot24';
import type { DocCategory } from './types';

export type TemplateClass = 'fixed' | 'adaptive' | 'generative';

export interface LibraryDof {
  name: string;
  kind: string;
  axis: string;
  unit: string;
  range: [number, number] | null;
  /** WP-42: which fragment surface this DOF moves, the frame it pivots about,
   * and whether firmware drives it. */
  actuatable?: boolean;
  pivotFrame?: string;
  surface?: number | null;
  canObject?: number | string | null;
}

export interface LibraryPaletteEntry {
  /** The libraryRef a placed part carries — the registry MODULE id (or the
   * workspace component id for records without mechanics yet). */
  moduleId: string;
  /** The optical component record this module realizes (id, no @range) —
   * what the assembly panel links to in the component editor (WP-37). */
  componentId: string | null;
  name: string;
  description: string;
  category: DocCategory;
  /** null = unclassified (workspace components without a template). */
  templateClass: TemplateClass | null;
  /** T1 discrete configuration states (WP-34 amendment). */
  states: string[];
  /** T2 degrees of freedom. */
  dofs: LibraryDof[];
  footprintGrid: [number, number, number];
  /** Absolute URLs, resolved against the core service origin. */
  thumbnailUrl: string | null;
  glbUrl: string | null;
  /** Record-style ports (local record axes, ±z = optical axis). */
  ports: SourcePort[];
  /** Effective focal length when meaningful — feeds the 2D ray preview. */
  eflMm: number | null;
  source: 'registry' | 'workspace';
}

/** Grid rotation applied when placing a library part whose record optics run
 * along ±z: points local +z (the optical axis) along document +x. */
export const DEFAULT_LIB_ROT: Rot24 = { z: '+x', x: '-z' };

const AXIS_VEC: Record<string, THREE.Vector3> = {
  '+x': new THREE.Vector3(1, 0, 0), '-x': new THREE.Vector3(-1, 0, 0),
  '+y': new THREE.Vector3(0, 1, 0), '-y': new THREE.Vector3(0, -1, 0),
  '+z': new THREE.Vector3(0, 0, 1), '-z': new THREE.Vector3(0, 0, -1),
};

const INPUT_PORT_NAMES = /^(front|sensor|in|plane)$/;

function toAxisDir(v: THREE.Vector3): AxisDir {
  const ax: 'x' | 'y' | 'z' =
    Math.abs(v.x) > 0.5 ? 'x' : Math.abs(v.y) > 0.5 ? 'y' : 'z';
  const sign = v[ax] > 0 ? '+' : '-';
  return `${sign}${ax}` as AxisDir;
}

/** Beam TRAVEL direction of a port (entry ports face against the beam). */
function beamDir(port: SourcePort): THREE.Vector3 {
  const dir = Array.isArray(port.direction)
    ? new THREE.Vector3(...port.direction).normalize() // WP-39 vector form
    : (AXIS_VEC[port.direction] ?? AXIS_VEC['+z']).clone();
  return INPUT_PORT_NAMES.test(port.name) ? dir.negate() : dir;
}

/**
 * Default placement rotation for a library record (WP-34): entry beam along
 * document +x and, for folding parts, the fold arm toward -y — the exact
 * WP-29 palette convention, computed from the record's OWN ports so the
 * record optics stay verbatim. Returns null when the record already lies in
 * the document plane (entry along ±x).
 */
export function defaultRotationFor(ports: SourcePort[]): Rot24 | null {
  if (ports.length === 0) return null;
  const entryPort =
    ports.find(p => p.name === 'front') ??
    ports.find(p => INPUT_PORT_NAMES.test(p.name)) ??
    ports.find(p => p.name === 'out') ??
    ports[0];
  const b = beamDir(entryPort);
  const fold = ports
    .map(p => beamDir(p))
    .find(d => Math.abs(d.dot(b)) < 0.5);
  let M: THREE.Matrix4;
  if (fold) {
    // Full basis: beam → +x AND fold arm → -y (WP-29), completed right-handed.
    const s3 = new THREE.Vector3().crossVectors(b, fold);
    const t1 = AXIS_VEC['+x'].clone();
    const t2 = AXIS_VEC['-y'].clone();
    const t3 = new THREE.Vector3().crossVectors(t1, t2);
    const S = new THREE.Matrix4().makeBasis(b, fold, s3);
    M = new THREE.Matrix4().makeBasis(t1, t2, t3).multiply(S.transpose()); // M·s_i = t_i
  } else {
    // No fold arm: the MINIMAL rotation taking the beam onto +x (identity for
    // in-plane records; the golden {z:+x, x:-z} for ±z ones).
    M = new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(b, AXIS_VEC['+x']),
    );
  }
  const zImage = new THREE.Vector3(0, 0, 1).applyMatrix4(M);
  const xImage = new THREE.Vector3(1, 0, 0).applyMatrix4(M);
  const rot: Rot24 = { z: toAxisDir(zImage), x: toAxisDir(xImage) };
  if (rot.z === '+z' && rot.x === '+x') return null; // identity — already in-plane
  return rot;
}

const CATEGORY_MAP: Record<string, DocCategory> = {
  source: 'source',
  lens: 'lens',
  mirror: 'mirror',
  beamsplitter: 'beamsplitter',
  dichroic: 'dichroic',
  filter: 'filter',
  detector: 'detector',
  sample: 'sample',
};

export function docCategoryOfRecord(category: string): DocCategory {
  return CATEGORY_MAP[category] ?? 'other';
}

// ── entry building ────────────────────────────────────────────────────────────

function shortName(id: string): string {
  return id.split('.').pop()?.replace(/[_-]/g, ' ') ?? id;
}

function indexPortsToSource(mod: IndexModule): SourcePort[] {
  return (mod.ports ?? []).map(p => ({
    name: p.name,
    direction: p.direction,
    positionMm: p.position_mm,
    afterSurface: p.after_surface,
  }));
}

function recordPortsToSource(record: ComponentRecord): SourcePort[] {
  const optics = record.optics ?? {};
  const frames = (optics.frames ?? {}) as Record<string, Record<string, number>>;
  const ports = (optics.ports ?? {}) as Record<
    string,
    { frame?: string; direction?: string; 'after-surface'?: number | null }
  >;
  return Object.entries(ports).map(([name, port]) => {
    const frame = frames[port.frame ?? ''] ?? {};
    return {
      name,
      direction: port.direction ?? '+z',
      positionMm: [
        frame['x-mm'] ?? 0,
        frame['y-mm'] ?? 0,
        frame['z-mm'] ?? 0,
      ] as [number, number, number],
      afterSurface: port['after-surface'] ?? null,
    };
  });
}

/** Registry index modules → palette entries. Asset paths resolve against the
 * core service origin (they are `/v1/library/assets/...`). */
export function entriesFromIndex(
  modules: IndexModule[],
  coreUrl: string,
): LibraryPaletteEntry[] {
  const origin = coreUrl.replace(/\/$/, '');
  const abs = (path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : `${origin}${path}`) : null;
  return modules.map(mod => ({
    moduleId: mod.id,
    componentId: mod.component?.ref?.split('@')[0] ?? null,
    name: shortName(mod.id),
    description: mod.description,
    category: docCategoryOfRecord(mod.category),
    templateClass: mod.template?.class ?? null,
    states: mod.template?.states ?? [],
    dofs: (mod.template?.dof ?? []).map(d => ({
      name: d.name,
      kind: d.kind,
      axis: d.axis,
      unit: d.unit,
      range: d.range,
      actuatable: d.actuatable,
      pivotFrame: d.pivot_frame,
      surface: d.surface,
      canObject: d.can_object,
    })),
    footprintGrid: mod.footprint_grid ?? [1, 1, 1],
    thumbnailUrl: abs(mod.assets?.thumbnail),
    glbUrl: abs(mod.assets?.glb),
    ports: indexPortsToSource(mod),
    eflMm: mod.component?.efl_mm ?? null,
    source: 'registry',
  }));
}

/** Workspace component records (no mechanics yet) → palette entries. */
export function entriesFromWorkspace(
  records: Record<string, ComponentRecord>,
  thumbnails: Record<string, string>,
): LibraryPaletteEntry[] {
  return Object.values(records).map(record => ({
    moduleId: record.id,
    componentId: record.id,
    name: shortName(record.id),
    description: record.description ?? '',
    category: docCategoryOfRecord(record.category),
    templateClass: null,
    states: [],
    dofs: [],
    footprintGrid: [1, 1, 1],
    thumbnailUrl: thumbnails[record.id] ?? null,
    glbUrl: null,
    ports: recordPortsToSource(record),
    eflMm: record.effective_focal_length_mm ?? null,
    source: 'workspace',
  }));
}

// ── registration ─────────────────────────────────────────────────────────────

/** Live lookup: libraryRef → palette entry (empty until registration). */
const LIB_ENTRIES = new Map<string, LibraryPaletteEntry>();

export function libraryEntryOf(libraryRef: string): LibraryPaletteEntry | undefined {
  return LIB_ENTRIES.get(libraryRef);
}

/** T-class of a library ref: 'fixed' | 'adaptive' | 'generative' | null. */
export function templateClassOf(libraryRef: string): TemplateClass | null {
  return LIB_ENTRIES.get(libraryRef)?.templateClass ?? null;
}

/** True when a palette module id came from the record registry (WP-43): the
 * robust "is this a library part?" test, independent of its display group. */
export function isLibraryModule(id: string): boolean {
  return LIB_ENTRIES.has(id);
}

export const T_CLASS_LABEL: Record<TemplateClass, 'T1' | 'T2' | 'T3'> = {
  fixed: 'T1',
  adaptive: 'T2',
  generative: 'T3',
};

/** @deprecated WP-43: registry parts now group by category, not one "Library"
 * bucket. Kept for compatibility; use `isLibraryModule` to detect them. */
export const LIBRARY_GROUP = 'Library';

/** Palette group for a registry part (WP-43): category + namespace, so the
 * palette's group filter reads "mirror · openuc2", "lens · thorlabs", …. */
function paletteGroup(entry: LibraryPaletteEntry): string {
  const namespace = entry.moduleId.split('.')[0] || 'user';
  return `${entry.category} · ${namespace}`;
}

function toModuleDefinition(entry: LibraryPaletteEntry): ModuleDefinition {
  return {
    id: entry.moduleId,
    name: entry.name,
    group: paletteGroup(entry),
    color: '#1f9c7c',
    footprint: { width: entry.footprintGrid[0], height: entry.footprintGrid[1] },
    thumbnail: entry.thumbnailUrl ?? undefined,
    description: entry.description,
    glbUrl: entry.glbUrl ?? undefined,
    docCategory: entry.category,
  };
}

let registeredFingerprint = '';

/**
 * Merge the library entries into the palette's module list (replacing any
 * previously-registered registry definitions) and refresh the lookup map.
 * Idempotent: re-registering identical entries is a no-op, so callers can
 * invoke it from effects that also observe the module list.
 */
export function registerLibraryModules(entries: LibraryPaletteEntry[]): void {
  const defs = entries.map(toModuleDefinition);
  const fingerprint = JSON.stringify(entries);
  const store = useAppStore.getState();
  // Non-registry modules = anything not previously registered here (robust to
  // the category-based grouping, WP-43).
  const nonLibrary = store.modules.filter(m => !LIB_ENTRIES.has(m.id));
  const alreadyThere =
    fingerprint === registeredFingerprint &&
    store.modules.length === nonLibrary.length + defs.length;
  if (alreadyThere) return;
  registeredFingerprint = fingerprint;
  LIB_ENTRIES.clear();
  for (const entry of entries) LIB_ENTRIES.set(entry.moduleId, entry);
  useAppStore.setState({ modules: [...nonLibrary, ...defs] });
}

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
import type {
  IndexComponent,
  IndexGroup,
  IndexHousing,
  IndexModule,
  IndexPort,
} from '../model/libraryIndex';
import type { SourcePort } from './sourceDesignStore';
import type { AxisDir, Rot24 } from './rot24';
import type { DocCategory } from './types';

export type TemplateClass = 'fixed' | 'adaptive' | 'generative';

/** WP-103: the three states a part can be in — see `LibraryPaletteEntry.mount`. */
export type PartMount = 'cube' | 'housed' | 'bare';

/** WP-103: plain words for the palette. Never "UNBOUND" — that is our word. */
export const MOUNT_LABEL: Record<PartMount, string> = {
  cube: 'in a cube',
  housed: 'housed · no cube',
  bare: 'needs a holder',
};

export const MOUNT_SECTION: Record<PartMount, string> = {
  cube: 'Cubes · ready to place',
  housed: 'Housed devices · no cube yet',
  bare: 'Bare optics · need a holder',
};

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
  /**
   * WP-103: WHICH OF THE THREE STATES this part is in — the distinction the
   * user reasons in ("some parts are already in a cube; some are loose"), and
   * the one optikit-core already ships as three separate index sections
   * (`modules` / `housings` / `components`).
   *
   *   'cube'   — a cube module: an optic in an openUC2 cube, ready to place.
   *              `templateClass` says T1 fixed / T2 adaptive / T3 generated.
   *   'housed' — an optic in its OWN housing (a laser body, a kinematic
   *              mount) with no cube yet — WP-67's housing-without-a-cube.
   *   'bare'   — a symbol with no mechanics at all: it needs a holder before
   *              it can be built.
   *
   * Before this, all three were encoded in `templateClass: … | null` plus
   * `unbound: boolean`, where `null` meant three different things and a
   * housed device was byte-identical to a bare symbol everywhere in the UI.
   */
  mount: PartMount;
  /** WP-103: the mechanical_template / housing record backing this part. */
  templateId: string | null;
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
  /** WP-47: the source record's emission lines in µm (empty for non-sources);
   * a placement picks one as its active wavelength. */
  wavelengthsUm: number[];
  /** WP-48: authored schematic symbol URL, or null to derive the glyph. */
  symbolUrl: string | null;
  /** WP-47: pixel facts for slm/display parts (null for everything else). */
  programmable: {
    mode: 'reflective' | 'transmissive';
    pixelPitchUm: number | null;
    resolution: [number, number] | null;
    fillFactor: number | null;
  } | null;
  /** WP-91: vendor name for the palette's list view (null = unbranded). */
  vendorName?: string | null;
  /** WP-50: kit price in EUR from the module record (null = unpriced). */
  priceEur: number | null;
  /** WP-50: record still carries review flags (drafts marked in the BOM). */
  review: boolean;
  source: 'registry' | 'workspace';
  /** WP-60: a published symbol NO module binds — an optical primitive with no
   * mechanics yet. Places freely (no cube, no grid claim) until a holder is
   * generated around it (WP-61). */
  unbound: boolean;
  /** WP-76: registered for lookup only — the entry resolves (so unbinding a
   * cube can re-point its part at the component) but the palette and the
   * swap menu do not offer it, because the same optic already reaches the
   * user through its cube module. */
  paletteHidden?: boolean;
  /** WP-60: the record's own surface stack. When non-empty, a placement
   * exports THIS as its fragment (the real prescription) instead of the
   * thin-lens approximation. Empty for module-backed entries. */
  fragmentSurfaces: Record<string, unknown>[];
  /** Part documentation that travels with the record (`docs:` list), resolved
   * to markdown text where the source ships it (a .dsn bundle). The inspector
   * renders these; empty/absent = the record names no docs. */
  docs?: { title: string; text: string }[];
  /** WP-45: carriers host cubes (FRAME, baseplates, plates, puzzle pieces). */
  carrier: boolean;
  /** WP-45: docking bays on a carrier (cells relative to its placement). */
  bays: Record<string, { originCell: [number, number, number]; size: [number, number, number]; axis: string }>;
}

/** WP-44: a placeable arrangement — the OPM. Members land as ordinary parts
 * tagged with one group-instance id; the drag layer keeps them rigid. */
export interface LibraryGroupEntry {
  groupId: string;
  name: string;
  description: string;
  envelopeGrid: [number, number, number];
  members: {
    key: string;
    moduleId: string;
    cell: [number, number, number];
    rot90: number;
    overhang: boolean;
  }[];
  structure: {
    plates: { face: string; moduleId: string; origin: [number, number]; size: [number, number] }[];
    jointCells: [number, number, number][];
    jointModuleId: string;
  };
  interface: Record<string, { member: string; port: string }>;
  review: boolean;
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
  slm: 'slm',
  display: 'display',
};

export function docCategoryOfRecord(category: string): DocCategory {
  return CATEGORY_MAP[category] ?? 'other';
}

// ── entry building ────────────────────────────────────────────────────────────

function shortName(id: string): string {
  return id.split('.').pop()?.replace(/[_-]/g, ' ') ?? id;
}

function indexPortsToSource(ports: IndexPort[] | undefined): SourcePort[] {
  return (ports ?? []).map(p => ({
    name: p.name,
    direction: p.direction,
    positionMm: p.position_mm,
    afterSurface: p.after_surface,
    coupling: p.coupling ?? '',
    // WP-79: carry the frame quaternion + clear aperture through placement.
    ...(p.rotation ? { rotation: p.rotation } : {}),
    ...(typeof p.clear_aperture_mm === 'number' ? { clearApertureMm: p.clear_aperture_mm } : {}),
  }));
}

export function recordPortsToSource(record: ComponentRecord): SourcePort[] {
  const optics = record.optics ?? {};
  const frames = (optics.frames ?? {}) as Record<string, Record<string, unknown>>;
  const ports = (optics.ports ?? {}) as Record<
    string,
    {
      frame?: string;
      direction?: string;
      'after-surface'?: number | null;
      coupling?: '' | 'fiber';
    }
  >;
  return Object.entries(ports).map(([name, port]) => {
    const frame = frames[port.frame ?? ''] ?? {};
    const rotation = frame.rotation;
    const aperture = frame['clear-aperture-mm'];
    return {
      name,
      direction: port.direction ?? '+z',
      positionMm: [
        (frame['x-mm'] as number) ?? 0,
        (frame['y-mm'] as number) ?? 0,
        (frame['z-mm'] as number) ?? 0,
      ] as [number, number, number],
      afterSurface: port['after-surface'] ?? null,
      coupling: port.coupling ?? '',
      // WP-79: a draft's authored frame rotation + aperture travel too.
      ...(Array.isArray(rotation) && rotation.length === 4
        ? { rotation: rotation as [number, number, number, number] }
        : {}),
      ...(typeof aperture === 'number' ? { clearApertureMm: aperture } : {}),
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
  const ASSET_PREFIX = '/v1/library/assets/';
  return modules.map(mod => {
    // Service-relative asset paths normally absolutize against the core
    // service — but a MOUNTED community module's assets live in ITS repo, not
    // in the local registry, so they resolve against raw.githubusercontent
    // (the same host the index itself was fetched from). Without this every
    // mounted mesh/thumbnail 404s against localhost.
    const abs = (path: string | null | undefined) => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      if (mod.repo && path.startsWith(ASSET_PREFIX)) {
        return `https://raw.githubusercontent.com/${mod.repo}/${mod.repoRef ?? 'main'}/library/${path.slice(ASSET_PREFIX.length)}`;
      }
      return `${origin}${path}`;
    };
    return entryFromIndexModule(mod, abs);
  });
}

function entryFromIndexModule(
  mod: IndexModule,
  abs: (path: string | null | undefined) => string | null,
): LibraryPaletteEntry {
  return {
    moduleId: mod.id,
    componentId: mod.component?.ref?.split('@')[0] ?? null,
    name: shortName(mod.id),
    description: mod.description,
    category: docCategoryOfRecord(mod.category),
    templateClass: mod.template?.class ?? null,
    // WP-103: a module IS a cube — that is what a cube_module record means.
    mount: 'cube' as const,
    templateId: mod.template?.id ?? null,
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
    ports: indexPortsToSource(mod.ports),
    eflMm: mod.component?.efl_mm ?? null,
    wavelengthsUm: mod.component?.wavelengths_um ?? [],
    symbolUrl: abs(mod.assets?.symbol),
    programmable: mod.component?.programmable
      ? {
          mode: mod.component.programmable.mode,
          pixelPitchUm: mod.component.programmable['pixel-pitch-um'],
          resolution: mod.component.programmable.resolution,
          fillFactor: mod.component.programmable['fill-factor'],
        }
      : null,
    vendorName: mod.component?.vendor?.name || null,
    priceEur: typeof mod.price === 'number' ? mod.price : null,
    review: mod.review,
    source: 'registry',
    unbound: false,
    fragmentSurfaces: [],
    carrier: mod.template?.carrier ?? false,
    bays: Object.fromEntries(
      Object.entries(mod.template?.bays ?? {}).map(([name, bay]) => [
        name,
        { originCell: bay.origin_cell, size: bay.size, axis: bay.axis },
      ]),
    ),
  };
}

/** Registry index groups → palette group entries (WP-44). */
export function groupEntriesFromIndex(groups: IndexGroup[]): LibraryGroupEntry[] {
  return groups.map(g => ({
    groupId: g.id,
    name: shortName(g.id),
    description: g.description,
    envelopeGrid: g.envelope_grid,
    members: g.members.map(m => ({
      key: m.key,
      moduleId: m.module,
      cell: m.cell,
      rot90: m.rot90,
      overhang: m.overhang,
    })),
    structure: {
      plates: Object.entries(g.structure?.plates ?? {}).map(([face, p]) => ({
        face,
        moduleId: p.module,
        origin: p.origin,
        size: p.size,
      })),
      jointCells: g.structure?.joint_cells ?? [],
      jointModuleId: g.structure?.joint_module ?? '',
    },
    interface: g.interface ?? {},
    review: g.review,
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
    // WP-103: a local draft has optics and no mechanics — bare, by definition.
    mount: 'bare' as const,
    templateId: (record as { mechanics?: { template?: string } }).mechanics?.template ?? null,
    states: [],
    dofs: [],
    footprintGrid: [1, 1, 1],
    thumbnailUrl: thumbnails[record.id] ?? null,
    glbUrl: null,
    ports: recordPortsToSource(record),
    eflMm: record.effective_focal_length_mm ?? null,
    wavelengthsUm:
      (record as { source?: { wavelengths_um?: number[] } }).source?.wavelengths_um ?? [],
    // Workspace drafts have no served asset yet — they derive their glyph.
    symbolUrl: null,
    programmable: null,
    vendorName: (record.vendor as { name?: string } | undefined)?.name || null,
    // Drafts are unpriced by definition and always review-marked.
    priceEur: null,
    review: true,
    source: 'workspace',
    // WP-87: a draft IS a symbol no module binds — the same unbound shape as
    // WP-60 published components, so an imported Optiland primitive placed
    // from the workspace offers "generate a holder…" like any other unbound
    // part (cubify is the T-class binding moment).
    unbound: true,
    // A draft's authored surfaces ARE its prescription (WP-60 convention).
    fragmentSurfaces:
      ((record.optics as { fragment?: { surfaces?: Record<string, unknown>[] } } | undefined)
        ?.fragment?.surfaces) ?? [],
    carrier: false,
    bays: {},
  }));
}

/**
 * WP-60: published optical components NO module binds → placeable palette
 * entries. The symbol IS the part: `templateClass: null`, no GLB, no DOFs —
 * the exact template-less shape workspace drafts already place through, so
 * placement, free mm movement and DRC invisibility come for free. A
 * module-bound component keeps coming through its module: this never offers
 * the same optic twice — but its entry still registers with `paletteHidden`
 * so the WP-76 unbind verb has a resolvable target to re-point at.
 *
 * WP-67: a component whose id a HOUSING template names gets the housing's
 * mesh and DOFs joined on — the part is still cube-less (free placement, no
 * grid claim), but its silhouette travels with it instead of a ghost.
 */
export function entriesFromComponents(
  components: IndexComponent[],
  modules: IndexModule[],
  coreUrl: string,
  housings: IndexHousing[] = [],
): LibraryPaletteEntry[] {
  const origin = coreUrl.replace(/\/$/, '');
  const abs = (path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : `${origin}${path}`) : null;
  const bound = new Set(
    modules
      .map(mod => mod.component?.ref?.split('@')[0])
      .filter((id): id is string => Boolean(id)),
  );
  const housingOf = new Map(
    housings
      .filter(h => h.component.id)
      .map(h => [h.component.id as string, h]),
  );
  return components.map(component => {
    const housing = housingOf.get(component.id);
    return {
      moduleId: component.id,
      componentId: component.id,
      name: shortName(component.id),
      description: component.description,
      category: docCategoryOfRecord(component.category),
      // WP-103: a joined housing gives the part its own mechanics — it is a
      // HOUSED device, not a bare symbol. This used to hard-code null/true
      // even when the housing's mesh and DOFs had already been joined below,
      // which is why "laser in a laser body" looked identical to "a bare
      // lens" everywhere in the UI.
      templateClass: housing?.class ?? null,
      mount: (housing ? 'housed' : 'bare') as PartMount,
      templateId: housing?.id ?? null,
      states: [],
      // WP-67: a housing's DOFs (a kinematic mount's tip/tilt) ride along so
      // the property panel offers them even without a cube.
      dofs: (housing?.dof ?? []).map(d => ({
        name: d.name,
        kind: d.kind,
        axis: d.axis,
        unit: d.unit,
        range: d.range,
        actuatable: d.actuatable,
        pivotFrame: d.pivot_frame,
        surface: d.surface,
        canObject: null,
      })),
      footprintGrid: [1, 1, 1] as [number, number, number],
      thumbnailUrl: abs(housing?.assets.thumbnail),
      // WP-67: the housing mesh TRAVELS with the unbound part (this used to
      // hardcode null — a housed device rendered as a ghost).
      glbUrl: abs(housing?.assets.glb),
      ports: indexPortsToSource(component.ports),
      eflMm: component.efl_mm ?? null,
      wavelengthsUm: component.wavelengths_um ?? [],
      symbolUrl: abs(component.symbol),
      programmable: null,
      vendorName: component.vendor?.name || null,
      priceEur: null,
      review: component.review || Boolean(housing?.review),
      source: 'registry' as const,
      unbound: true,
      paletteHidden: bound.has(component.id),
      fragmentSurfaces: component.fragment_surfaces ?? [],
      carrier: false,
      bays: {},
    };
  });
}

// ── registration ─────────────────────────────────────────────────────────────

/** Live lookup: libraryRef → palette entry (empty until registration). */
const LIB_ENTRIES = new Map<string, LibraryPaletteEntry>();

export function libraryEntryOf(libraryRef: string): LibraryPaletteEntry | undefined {
  return LIB_ENTRIES.get(libraryRef);
}

/** WP-66: every registered palette module entry (groups live elsewhere) —
 * the swap-candidate list for the Modules panel. */
export function listLibraryEntries(): LibraryPaletteEntry[] {
  return [...LIB_ENTRIES.values()];
}

/** T-class of a library ref: 'fixed' | 'adaptive' | 'generative' | null. */
export function templateClassOf(libraryRef: string): TemplateClass | null {
  return LIB_ENTRIES.get(libraryRef)?.templateClass ?? null;
}

/** WP-64: structural "interface zone" part kinds — the sandwich plates,
 * puzzle joints and baseplates living in the 5 mm layer between cube levels
 * (placed e.g. by WP-53 groups). */
export type InterfaceKind = 'plate' | 'puzzle' | 'baseplate';

/**
 * Derive the interface kind of a library ref (WP-64) so the scenes can draw
 * these mechanics parts as distinct flat glyphs instead of generic blobs.
 * Name patterns come first — 'baseplate' before 'plate', and a leading
 * separator guard keeps `frame_wellplate_…` from reading as a plate — then
 * the record's template `carrier` flag (FRAME bodies, baseplates) catches
 * carriers whose ids match no pattern.
 */
export function interfaceKindOf(libraryRef: string): InterfaceKind | null {
  const id = libraryRef.toLowerCase();
  if (/(^|[._-])baseplate/.test(id)) return 'baseplate';
  if (/puzzle/.test(id)) return 'puzzle';
  if (/(^|[._-])plate/.test(id)) return 'plate';
  if (LIB_ENTRIES.get(libraryRef)?.carrier) return 'baseplate';
  return null;
}

/** True when a palette module id came from the record registry (WP-43): the
 * robust "is this a library part?" test, independent of its display group. */
export function isLibraryModule(id: string): boolean {
  return LIB_ENTRIES.has(id);
}

/** Live lookup: group id → group entry (WP-44). */
const LIB_GROUPS = new Map<string, LibraryGroupEntry>();

export function registerLibraryGroups(entries: LibraryGroupEntry[]): void {
  LIB_GROUPS.clear();
  for (const entry of entries) LIB_GROUPS.set(entry.groupId, entry);
}

export function groupEntryOf(groupId: string): LibraryGroupEntry | undefined {
  return LIB_GROUPS.get(groupId);
}

export function listLibraryGroups(): LibraryGroupEntry[] {
  return [...LIB_GROUPS.values()];
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
  // WP-103: group by WHAT YOU CAN BUILD WITH IT first — a ready cube, a
  // housed device that still needs one, or a bare optic that needs a holder.
  // (WP-60 grouped bare symbols apart already; this splits 'housed' out of
  // that bucket, because the two are not the same problem to solve.)
  if (entry.mount === 'bare') return `${entry.category} · needs a holder`;
  if (entry.mount === 'housed') return `${entry.category} · housed, no cube`;
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

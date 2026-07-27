/**
 * Pure conversion between the document snapshot and the `.dsn` schema-v0
 * DesignDecl (see ../../document/mapping.ts for the shared frame conventions —
 * the `.dsn` design frame IS the document frame: mm, z-up, right-handed,
 * grid pitch 50/50/55 mm).
 *
 * Export writes flattened components (anchor = design origin), which is exactly
 * what the current store can represent. Import resolves anchor chains
 * (`Flattened()` in the Go/Python reference) so relative designs load too.
 */

import type { AxisDir, DocCategory, DocPart, DocSnapshot, Rot24, Vec3 } from '../../document';
import { UC2_GRID_MM, listFibers, parsePortRef } from '../../document';
import { catalogPortsOf } from '../../document/portCatalog';
import { libraryEntryOf } from '../../document/libraryPalette';
import type {
  CompSpec,
  DesignDecl,
  RotGridSpec,
} from './generated/design-decl';

export const OPTIKIT_VERSION = 'v0.0.0-alpha.1';

const AXIS_DIRS: readonly string[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

// ── export: DocSnapshot → DesignDecl ─────────────────────────────────────────

export interface ExportResult {
  design: DesignDecl;
  /** partId → component key, for callers that need the mapping (e.g. UI). */
  keyByPartId: Record<string, string>;
}

// ── palette optics enrichment (WP-32) ────────────────────────────────────────

/** A flat surface fragment entry (reflective when asked). */
const flatSurface = (semiAperture: number, reflective: boolean) => ({
  type: 'standard',
  geometry: { type: 'StandardGeometry', radius: Infinity, conic: 0 },
  interaction_model: { type: 'refractive_reflective', is_reflective: reflective },
  semi_aperture: round6(semiAperture),
});

/**
 * Optics block for a PALETTE part (WP-32): the same catalog the schematic
 * renders (`portCatalog.ts`) becomes `optics.frames/ports` in the export, so
 * chain inference and compile see exactly the ports the browser draws —
 * E_BAD_PORT is impossible for palette parts. Where the palette declares
 * enough (lens focal length, mirror/splitter reflectivity) a minimal
 * fragment rides along; filters and other passive parts export as
 * `passthrough` so they sit in a chain without contributing surfaces.
 */
export function paletteOpticsOf(part: {
  libraryRef: string;
  category: DocCategory;
  params: Record<string, unknown>;
}): NonNullable<CompSpec['optics']> {
  const ports = catalogPortsOf(part.libraryRef, part.category);
  // Library-registry parts (WP-34) carry real port offsets and an EFL.
  const lib = libraryEntryOf(part.libraryRef);
  const aperture = typeof part.params.aperture === 'number' ? part.params.aperture : 25;
  const semi = aperture / 2;

  // WP-60: an entry carrying the record's own surface stack (unbound symbols,
  // workspace drafts) exports the REAL prescription verbatim — the thin-lens
  // catalog approximation below is only for parts without one.
  const realSurfaces = lib?.fragmentSurfaces ?? [];

  // Minimal fragment per category. Surfaces use the record conventions
  // (WP-14): standard surfaces, ±Infinity radii serialize as .inf.
  let surfaces: Record<string, unknown>[] | null = null;
  let passthrough = false;
  if (realSurfaces.length > 0) {
    surfaces = realSurfaces.map(s => ({ ...s }));
  } else switch (part.category) {
    case 'lens': {
      // Thin biconvex approximation: 1/f ≈ (n−1)(1/R1 − 1/R2) ⇒ R = 2f(n−1).
      const f =
        typeof part.params.focalLength === 'number'
          ? part.params.focalLength
          : (lib?.eflMm ?? 100);
      const n = 1.5168; // N-BK7
      const r = Math.abs(2 * f * (n - 1));
      const sign = f >= 0 ? 1 : -1;
      surfaces = [
        {
          type: 'standard',
          geometry: { type: 'StandardGeometry', radius: round6(sign * r), conic: 0 },
          thickness: 2.0,
          // WP-63: optiland's registry keys on class names — a named glass
          // is {type: Material}; the invented 'ideal' tag broke simulate.
          material_post: { type: 'Material', name: 'N-BK7' },
          semi_aperture: round6(semi),
        },
        {
          type: 'standard',
          geometry: { type: 'StandardGeometry', radius: round6(-sign * r), conic: 0 },
          semi_aperture: round6(semi),
        },
      ];
      break;
    }
    case 'mirror':
    case 'beamsplitter':
    case 'dichroic':
      // One reflective flat: the fold surface; transmitted traversals unfold
      // it non-reflectively (the compiler's dichroic bleed-through path).
      surfaces = [flatSurface(semi, true)];
      break;
    case 'filter':
    case 'sample':
    case 'other':
      passthrough = true;
      break;
    default:
      break; // source/detector: ports only (fragment-less = collimated)
  }

  const lastSurface = surfaces ? surfaces.length - 1 : null;
  const frames: Record<string, unknown> = { optical: { 'z-mm': 0.0 } };
  const portSpecs: Record<string, unknown> = {};
  for (const p of ports) {
    const isEntry = /^(front|sensor|in|plane)$/.test(p.name);
    // Ports with a real datum offset (library records) get their own frame.
    let frameName = 'optical';
    if (p.positionMm.some(v => v !== 0)) {
      frameName = p.name;
      frames[frameName] = {
        'x-mm': round6(p.positionMm[0]),
        'y-mm': round6(p.positionMm[1]),
        'z-mm': round6(p.positionMm[2]),
      };
    }
    const spec: Record<string, unknown> = { frame: frameName, direction: p.direction };
    if (!isEntry && lastSurface !== null) {
      // Exit ports leave after the fold surface (0) or the last lens surface.
      // A real prescription keeps the record port's own after-surface.
      spec['after-surface'] =
        realSurfaces.length > 0 && p.afterSurface != null
          ? p.afterSurface
          : p.name === 'reflected'
            ? 0
            : lastSurface;
    }
    portSpecs[p.name] = spec;
  }

  return {
    ...(surfaces ? { fragment: { surfaces } } : {}),
    ...(passthrough ? { passthrough: true } : {}),
    frames,
    ports: portSpecs,
  } as NonNullable<CompSpec['optics']>;
}

/** Component spec for a part with no retained source (palette placement). */
export function bareComponentSpec(part: DocPart): CompSpec {
  // WP-47: runtime state of a source placement — a source that is off emits
  // nothing, and inference skips it, so the netlist matches the bench.
  const enabled = part.params.enabled !== false;
  const wavelengthUm = part.params.wavelengthUm;
  return {
    type: 'primitive',
    primitive: { type: 'glb', model: part.libraryRef },
    category: part.category,
    optics: paletteOpticsOf(part),
    pose: poseSpecOf(part),
    ...(enabled ? {} : { enabled: false }),
    ...(typeof wavelengthUm === 'number' && wavelengthUm > 0
      ? { 'wavelength-um': wavelengthUm }
      : {}),
  };
}

export function snapshotToDesign(snap: DocSnapshot): ExportResult {
  const keyByPartId: Record<string, string> = {};
  const used = new Set<string>();
  for (const part of snap.parts) {
    const base = slugify(part.ref) || slugify(part.libraryRef) || 'part';
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}-${n}`;
    used.add(key);
    keyByPartId[part.id] = key;
  }

  const components: Record<string, CompSpec> = {};
  const dofValues: Record<string, number> = {};
  for (const part of snap.parts) {
    const key = keyByPartId[part.id];
    // Palette parts export WITH their catalog optics (WP-32).
    components[key] = bareComponentSpec(part);
    for (const dof of part.dofs) {
      dofValues[`${key}.${dof.name}`] = dof.value;
    }
  }

  const paths: NonNullable<DesignDecl['paths']> = {};
  for (const path of snap.paths) {
    paths[path.name] = {
      chain: path.chain.map(ref => {
        const { partId, port } = parsePortRef(ref);
        return `${keyByPartId[partId] ?? partId}.${port}`;
      }),
    };
  }

  // WP-46: patch cords travel with the design; endpoints use the same
  // component keys as the chains.
  const fibers: NonNullable<DesignDecl['fibers']> = {};
  for (const fiber of listFibers()) {
    const end = (ref: string) => {
      const { partId, port } = parsePortRef(ref);
      return `${keyByPartId[partId] ?? partId}.${port}`;
    };
    if (!keyByPartId[parsePortRef(fiber.from).partId]) continue;
    if (!keyByPartId[parsePortRef(fiber.to).partId]) continue;
    fibers[fiber.id] = {
      from: end(fiber.from),
      to: end(fiber.to),
      ...(fiber.coreUm != null ? { 'core-um': fiber.coreUm } : {}),
      ...(fiber.na != null ? { na: fiber.na } : {}),
      'length-m': fiber.lengthM,
      type: fiber.type,
    };
  }

  const design: DesignDecl = {
    'optikit-version': OPTIKIT_VERSION,
    design: {
      name: snap.meta.name || 'untitled',
      description: snap.meta.description || '',
    },
    components,
    ...(Object.keys(paths).length > 0 ? { paths } : {}),
    ...(Object.keys(fibers).length > 0 ? { fibers } : {}),
    ...(Object.keys(dofValues).length > 0
      ? { instantiation: { dof_values: dofValues } }
      : {}),
  };
  return { design, keyByPartId };
}

/** Absolute (anchor-free) pose block for a part's current grid pose. */
export function poseSpecOf(part: {
  gridPose: {
    rot24: Rot24;
    offsetDeg: { x: number; y: number; z: number };
    cell: Vec3;
    offsetMm: Vec3;
  };
}): NonNullable<CompSpec['pose']> {
  // Full offset-deg triple (WP-28): each non-zero residual axis is written;
  // ΔR convention R = R24 · ΔR, extrinsic ZXY, part-local frame.
  const off = part.gridPose.offsetDeg;
  const offsetDeg: Record<string, number> = {};
  if (Math.abs(off.x) > 1e-9) offsetDeg.x = round6(off.x);
  if (Math.abs(off.y) > 1e-9) offsetDeg.y = round6(off.y);
  if (Math.abs(off.z) > 1e-9) offsetDeg.z = round6(off.z);
  return {
    rotation: {
      type: 'grid',
      grid: gridSpecOf(part.gridPose.rot24),
      ...(Object.keys(offsetDeg).length > 0 ? { 'offset-deg': offsetDeg } : {}),
    },
    translation: {
      ...(vecToXyz(part.gridPose.cell, true) && { 'offset-grid': vecToXyz(part.gridPose.cell, true) }),
      ...(vecToXyz(part.gridPose.offsetMm, false) && { 'offset-mm': vecToXyz(part.gridPose.offsetMm, false) }),
    },
  };
}

function gridSpecOf(rot24: Rot24): RotGridSpec | undefined {
  const grid: RotGridSpec = {};
  if (rot24.z !== '+z') grid.z = rot24.z;
  if (rot24.x !== '+x') grid.x = rot24.x;
  return Object.keys(grid).length > 0 ? grid : undefined;
}

function vecToXyz(v: Vec3, integer: boolean): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  const [x, y, z] = v;
  if (x) out.x = integer ? Math.round(x) : round6(x);
  if (y) out.y = integer ? Math.round(y) : round6(y);
  if (z) out.z = integer ? Math.round(z) : round6(z);
  return Object.keys(out).length > 0 ? out : undefined;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// ── import: DesignDecl → parts ────────────────────────────────────────────────

export interface ImportedPart {
  key: string;
  /** primitive.model / sub-design path — resolved to a module by the applier. */
  libraryRef: string;
  /** Optical role from the declaration (guides module fallback on import). */
  category: string;
  positionMm: Vec3;
  rot24: Rot24;
  /** Full rotation residual (R = R24 · ΔR, extrinsic ZXY, degrees) — WP-28. */
  offsetDeg: { x: number; y: number; z: number };
  dofValues: Record<string, number>;
}

export interface ImportedFiber {
  id: string;
  from: { key: string; port: string };
  to: { key: string; port: string };
  coreUm: number | null;
  na: number | null;
  lengthM: number;
  type: 'SM' | 'MM';
}

export interface ImportedDesign {
  parts: ImportedPart[];
  paths: { name: string; chain: { key: string; port: string }[] }[];
  /** Fiber links (WP-46), endpoints in design-key space. */
  fibers: ImportedFiber[];
  meta: { name: string; description: string };
  warnings: string[];
}

export function designToParts(decl: DesignDecl): ImportedDesign {
  const warnings: string[] = [];
  const components = decl.components ?? {};

  // Flatten the translation anchor digraph (BFS from the origin).
  const flattened = new Map<string, Vec3>(); // key → absolute mm
  const pending = new Map(Object.entries(components));
  flattenFrom('', [0, 0, 0]);

  function flattenFrom(anchorKey: string, anchorMm: Vec3) {
    for (const [key, comp] of [...pending]) {
      const anchor = comp?.pose?.translation?.anchor ?? '';
      if (anchor !== anchorKey) continue;
      pending.delete(key);
      const mm = addVec(anchorMm, translationMm(comp, key, warnings));
      flattened.set(key, mm);
      flattenFrom(key, mm);
    }
  }
  for (const key of pending.keys()) {
    warnings.push(`component '${key}': unresolvable translation anchor — placed at origin`);
    flattened.set(key, translationMm(components[key], key, warnings));
  }

  const parts: ImportedPart[] = [];
  for (const [key, comp] of Object.entries(components)) {
    if (!comp || comp.type === 'location') continue;
    const rot = comp.pose?.rotation;
    let rot24: Rot24 = { z: '+z', x: '+x' };
    if (rot?.type === 'uc2' || rot?.type === 'grid' || !rot?.type) {
      const z = (rot?.grid?.z || '+z') as AxisDir;
      const x = (rot?.grid?.x || '+x') as AxisDir;
      if (AXIS_DIRS.includes(z) && AXIS_DIRS.includes(x) && z[1] !== x[1]) {
        rot24 = { z, x };
      } else if (rot?.grid?.z || rot?.grid?.x) {
        warnings.push(`component '${key}': invalid rotation.grid — using identity`);
      }
    } else if (rot?.type) {
      warnings.push(`component '${key}': rotation type '${rot.type}' not supported — using identity`);
    }
    // Full offset-deg triple (WP-28): x/y tilts import exactly now — no more
    // "not representable — dropped" and no global-yaw approximation.
    const rawOffset = rot?.['offset-deg'];
    const offsetDeg = {
      x: numberOr0(rawOffset?.x, key, warnings),
      y: numberOr0(rawOffset?.y, key, warnings),
      z: numberOr0(rawOffset?.z, key, warnings),
    };
    parts.push({
      key,
      libraryRef: comp.primitive?.model || comp.design || '',
      category: comp.category ?? '',
      positionMm: flattened.get(key) ?? [0, 0, 0],
      rot24,
      offsetDeg,
      dofValues: {},
    });
  }

  // Instance DOF values.
  const dofValues = decl.instantiation?.dof_values ?? {};
  for (const [dotted, value] of Object.entries(dofValues)) {
    const i = dotted.lastIndexOf('.');
    const compKey = dotted.slice(0, i);
    const dof = dotted.slice(i + 1);
    const part = parts.find(p => p.key === compKey);
    if (part && typeof value === 'number') part.dofValues[dof] = value;
    else warnings.push(`dof_values '${dotted}' does not resolve — dropped`);
  }

  const paths = Object.entries(decl.paths ?? {}).map(([name, spec]) => ({
    name,
    chain: (spec.chain ?? []).map(entry => {
      const i = entry.lastIndexOf('.');
      return { key: entry.slice(0, i), port: entry.slice(i + 1) };
    }),
  }));

  // WP-46: patch cords, endpoints still in design-key space (the applier maps
  // them onto placed part ids).
  const fibers = Object.entries(decl.fibers ?? {}).map(([id, spec]) => {
    const split = (ref: string) => {
      const i = (ref ?? '').lastIndexOf('.');
      return { key: ref.slice(0, i), port: ref.slice(i + 1) };
    };
    return {
      id,
      from: split(spec.from ?? ''),
      to: split(spec.to ?? ''),
      coreUm: typeof spec['core-um'] === 'number' ? spec['core-um'] : null,
      na: typeof spec.na === 'number' ? spec.na : null,
      lengthM: typeof spec['length-m'] === 'number' ? spec['length-m'] : 1,
      type: spec.type === 'SM' ? ('SM' as const) : ('MM' as const),
    };
  });

  return {
    parts,
    paths,
    fibers,
    meta: {
      name: decl.design?.name || decl.design?.path || '',
      description: decl.design?.description || '',
    },
    warnings,
  };
}

function translationMm(comp: CompSpec | undefined, key: string, warnings: string[]): Vec3 {
  const t = comp?.pose?.translation;
  const grid = t?.['offset-grid'];
  const mm = t?.['offset-mm'];
  return [
    numberOr0(grid?.x, key, warnings) * UC2_GRID_MM[0] + numberOr0(mm?.x, key, warnings),
    numberOr0(grid?.y, key, warnings) * UC2_GRID_MM[1] + numberOr0(mm?.y, key, warnings),
    numberOr0(grid?.z, key, warnings) * UC2_GRID_MM[2] + numberOr0(mm?.z, key, warnings),
  ];
}

function numberOr0(v: unknown, key: string, warnings: string[]): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    warnings.push(`component '${key}': templated value ${JSON.stringify(v)} treated as 0`);
  }
  return 0;
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

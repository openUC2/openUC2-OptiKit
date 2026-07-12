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

import type { AxisDir, DocSnapshot, Rot24, Vec3 } from '../../document';
import { UC2_GRID_MM, parsePortRef } from '../../document';
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
    const comp: CompSpec = {
      type: 'primitive',
      primitive: { type: 'glb', model: part.libraryRef },
      pose: {
        rotation: {
          type: 'grid',
          grid: gridSpecOf(part.gridPose.rot24),
          ...(Math.abs(part.gridPose.residualYawDeg) > 1e-9
            ? { 'offset-deg': { z: round6(part.gridPose.residualYawDeg) } }
            : {}),
        },
        translation: {
          ...(vecToXyz(part.gridPose.cell, true) && { 'offset-grid': vecToXyz(part.gridPose.cell, true) }),
          ...(vecToXyz(part.gridPose.offsetMm, false) && { 'offset-mm': vecToXyz(part.gridPose.offsetMm, false) }),
        },
      },
    };
    components[key] = comp;
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

  const design: DesignDecl = {
    'optikit-version': OPTIKIT_VERSION,
    design: {
      name: snap.meta.name || 'untitled',
      description: snap.meta.description || '',
    },
    components,
    ...(Object.keys(paths).length > 0 ? { paths } : {}),
    ...(Object.keys(dofValues).length > 0
      ? { instantiation: { dof_values: dofValues } }
      : {}),
  };
  return { design, keyByPartId };
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
  positionMm: Vec3;
  rot24: Rot24;
  residualYawDeg: number;
  dofValues: Record<string, number>;
}

export interface ImportedDesign {
  parts: ImportedPart[];
  paths: { name: string; chain: { key: string; port: string }[] }[];
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
    const offsetDeg = rot?.['offset-deg'];
    let residualYawDeg = 0;
    if (offsetDeg) {
      residualYawDeg = numberOr0(offsetDeg.z, key, warnings);
      if (numberOr0(offsetDeg.x, key, warnings) || numberOr0(offsetDeg.y, key, warnings)) {
        warnings.push(`component '${key}': offset-deg x/y tilt not representable yet — dropped`);
      }
      if (residualYawDeg && rot24.z !== '+z' && rot24.z !== '-z') {
        warnings.push(
          `component '${key}': offset-deg.z on a tipped part is approximated as a global yaw`,
        );
      }
    }
    parts.push({
      key,
      libraryRef: comp.primitive?.model || comp.design || '',
      positionMm: flattened.get(key) ?? [0, 0, 0],
      rot24,
      residualYawDeg,
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

  return {
    parts,
    paths,
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

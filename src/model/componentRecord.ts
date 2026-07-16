/**
 * Component-record editing model (WP-14 "symbol editor").
 *
 * A `RecordDraft` is the form's working state; `draftToRecord` serializes it
 * into the optical-component record shape defined by optikit-core's Pydantic
 * models (see src/model/dsn/generated/library-component.ts), and
 * `recordToYaml` renders the library-PR-ready YAML. The inverse
 * (`draftFromRecord`) reopens saved records for editing.
 *
 * Conventions mirror the WP-9 importer output so hand-authored and imported
 * records look alike: fragment surfaces travel verbatim in optiland's
 * serialization schema, air gaps omit `material_post`, the last surface
 * carries no thickness, `optical` sits at the first vertex and `exit` at
 * first vertex + center thickness (port gaps = air gaps).
 */

import { parse, stringify } from 'yaml';
import type { ComponentRecord } from './dsn/generated/library-component';
import type { DocCategory } from '../document';

/**
 * Record categories = the schematic's optical categories plus the
 * NON-OPTICAL first-class kinds (WP-30): electronics and mechanics records
 * carry vendor/BOM identity but no optics block at all.
 */
export type RecordCategory = DocCategory | 'electronics' | 'mechanics';

export const RECORD_CATEGORIES: RecordCategory[] = [
  'lens',
  'mirror',
  'filter',
  'beamsplitter',
  'dichroic',
  'source',
  'detector',
  'sample',
  'electronics',
  'mechanics',
  'other',
];

/** Categories whose records normally carry no surface fragment. */
export const FRAGMENTLESS_CATEGORIES: RecordCategory[] = ['source', 'detector', 'sample'];

/** Non-optical parts (WP-30): no surfaces, no frames, no ports — BOM only. */
export const NONOPTICAL_CATEGORIES: RecordCategory[] = ['electronics', 'mechanics'];

const ID_SEGMENT_RE = /^[a-z0-9][a-z0-9_-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
export const PORT_DIRECTIONS = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;

// ── draft shapes ─────────────────────────────────────────────────────────────

export interface SurfaceDraft {
  /** null = flat (∞ radius). Sign convention: optiland/Zemax, beam along +z. */
  radiusMm: number | null;
  /** Distance to the next surface; the last surface has none. */
  thicknessMm: number | null;
  /** Canonical optiland material name after this surface; '' = air. */
  material: string;
  semiApertureMm: number | null;
  conic: number;
  isStop: boolean;
  reflective: boolean;
}

export interface FrameDraft {
  name: string;
  zMm: number;
}

export interface PortDraft {
  name: string;
  frame: string;
  direction: string;
  afterSurface: number | null;
}

export interface RecordDraft {
  namespace: string; // user | openuc2 | thorlabs
  name: string; // last id segment, e.g. "ac254-050-a"
  version: string;
  category: RecordCategory;
  description: string;
  vendorName: string;
  vendorMpn: string;
  vendorUrl: string;
  surfaces: SurfaceDraft[];
  frames: FrameDraft[];
  ports: PortDraft[];
  // Category-specific extras (persisted as extra fields; schema is extra=allow).
  mirrorAngleDeg: number | null;
  sourceWavelengthsUm: number[];
  sourceDivergenceDeg: number | null;
  detectorSensorMm: [number, number] | null;
  detectorPixelPitchUm: number | null;
}

// ── defaults ─────────────────────────────────────────────────────────────────

const surface = (over: Partial<SurfaceDraft> = {}): SurfaceDraft => ({
  radiusMm: null,
  thicknessMm: null,
  material: '',
  semiApertureMm: 12.7,
  conic: 0,
  isStop: false,
  reflective: false,
  ...over,
});

export function defaultDraft(category: RecordCategory): RecordDraft {
  const base: RecordDraft = {
    namespace: 'user',
    name: '',
    version: '0.1.0',
    category,
    description: '',
    vendorName: '',
    vendorMpn: '',
    vendorUrl: '',
    surfaces: [],
    frames: [{ name: 'optical', zMm: 0 }],
    ports: [
      { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
      { name: 'back', frame: 'optical', direction: '+z', afterSurface: null },
    ],
    mirrorAngleDeg: null,
    sourceWavelengthsUm: [],
    sourceDivergenceDeg: null,
    detectorSensorMm: null,
    detectorPixelPitchUm: null,
  };
  if (NONOPTICAL_CATEGORIES.includes(category)) {
    // Non-optical records carry NO optics at all (WP-30).
    return { ...base, surfaces: [], frames: [], ports: [] };
  }
  switch (category) {
    case 'lens':
      base.surfaces = [
        surface({ radiusMm: 50, thicknessMm: 4, material: 'N-BK7' }),
        surface({ radiusMm: -50 }),
      ];
      break;
    case 'mirror':
      base.surfaces = [surface({ reflective: true })];
      base.mirrorAngleDeg = 45;
      base.ports = [
        { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
        { name: 'reflected', frame: 'optical', direction: '-x', afterSurface: 0 },
      ];
      break;
    case 'filter':
      base.surfaces = [
        surface({ thicknessMm: 3, material: 'N-BK7' }),
        surface({}),
      ];
      break;
    case 'beamsplitter':
    case 'dichroic':
      base.surfaces = [surface({ thicknessMm: 1, material: 'N-BK7' }), surface({})];
      base.ports = [
        { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
        { name: 'transmitted', frame: 'optical', direction: '+z', afterSurface: 1 },
        { name: 'reflected', frame: 'optical', direction: '-x', afterSurface: 0 },
      ];
      break;
    case 'source':
      base.ports = [{ name: 'out', frame: 'optical', direction: '+z', afterSurface: null }];
      base.sourceWavelengthsUm = [0.532];
      base.sourceDivergenceDeg = 0;
      break;
    case 'detector':
      base.ports = [{ name: 'sensor', frame: 'optical', direction: '-z', afterSurface: null }];
      base.detectorSensorMm = [11.3, 7.1];
      base.detectorPixelPitchUm = 3.45;
      break;
    case 'sample':
      base.ports = [{ name: 'plane', frame: 'optical', direction: '+z', afterSurface: null }];
      break;
    default:
      break;
  }
  return base;
}

// ── derived geometry ─────────────────────────────────────────────────────────

/** Sum of inter-surface thicknesses = z of the exit vertex. */
export function centerThicknessMm(surfaces: SurfaceDraft[]): number {
  return surfaces.reduce((sum, s) => sum + (s.thicknessMm ?? 0), 0);
}

/** Rough refractive indices for the paraxial sketch (fallback 1.52). */
const INDEX_HINTS: Record<string, number> = {
  'N-BK7': 1.5168, 'N-BAF10': 1.67, 'N-SF10': 1.7283, SF10: 1.7283,
  'N-SF11': 1.7847, 'N-SF5': 1.6727, SF5: 1.6727, 'N-SF6': 1.8052,
  'N-LAK22': 1.6511, 'N-BAK4': 1.5688, 'N-K5': 1.5224, B270: 1.5229,
  'F_SILICA': 1.4585, SILICA: 1.4585, CAF2: 1.4338, 'N-SK2': 1.6074,
};

export function indexHint(material: string): number {
  if (!material) return 1.0;
  return INDEX_HINTS[material.toUpperCase()] ?? INDEX_HINTS[material] ?? 1.52;
}

/**
 * Paraxial EFL of the surface stack via the 2×2 ray-transfer matrix —
 * the "approximate" number for the sketch; the authoritative one comes from
 * the optiland service.
 */
export function paraxialEflMm(surfaces: SurfaceDraft[]): number | null {
  if (surfaces.length === 0) return null;
  // System matrix [[A,B],[C,D]] over refraction + transfer.
  let A = 1, B = 0, C = 0, D = 1;
  let n = 1.0;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    if (s.reflective) return null; // fold mirrors have no transmission EFL
    const nAfter = s.material ? indexHint(s.material) : 1.0;
    const power = s.radiusMm ? (nAfter - n) / s.radiusMm : 0; // P = (n2−n1)/R
    // refraction: [[1, 0], [−P, 1]]
    const C2 = C - power * A;
    const D2 = D - power * B;
    C = C2; D = D2;
    n = nAfter;
    const t = s.thicknessMm ?? 0;
    if (t > 0 && i < surfaces.length - 1) {
      // transfer: [[1, t/n], [0, 1]]
      const A2 = A + (t / n) * C;
      const B2 = B + (t / n) * D;
      A = A2; B = B2;
    }
  }
  if (Math.abs(C) < 1e-12) return null; // afocal
  return -1 / C;
}

/** Largest declared semi-aperture (the sketch's beam sizing). */
export function maxSemiApertureMm(surfaces: SurfaceDraft[]): number {
  const semis = surfaces.map(s => s.semiApertureMm ?? 0).filter(v => v > 0);
  return semis.length ? Math.max(...semis) : 12.7;
}

/**
 * Surface sag at height y (mm): the standard conic sag equation
 * z(y) = c·y² / (1 + √(1 − (1+k)·c²·y²)), c = 1/R. Flat surfaces (R = ∞)
 * and heights beyond the surface's real extent return 0 (WP-30 — the drawn
 * element geometry, not just the traced rays, responds to the radii).
 */
export function sagAt(radiusMm: number | null, conic: number, y: number): number {
  if (radiusMm === null || radiusMm === 0) return 0;
  const c = 1 / radiusMm;
  const disc = 1 - (1 + conic) * c * c * y * y;
  if (disc <= 0) return 0;
  return (c * y * y) / (1 + Math.sqrt(disc));
}

export interface SurfaceProfile {
  /** Vertex position along the axis (z of the record frame; drawn as x). */
  vertexX: number;
  semiAperture: number;
  /** Sampled [x, y] polyline of the surface cross-section. */
  points: [number, number][];
  /** Glass follows this surface (fill the gap to the next profile). */
  glassAfter: boolean;
}

/** Cross-section profiles of the surface stack for the 2D element sketch. */
export function surfaceProfiles(surfaces: SurfaceDraft[], samples = 24): SurfaceProfile[] {
  let x = 0;
  const fallbackSemi = maxSemiApertureMm(surfaces);
  return surfaces.map((s, i) => {
    const semi = s.semiApertureMm ?? fallbackSemi;
    const points: [number, number][] = [];
    for (let k = 0; k <= samples; k++) {
      const y = -semi + (2 * semi * k) / samples;
      points.push([x + sagAt(s.radiusMm, s.conic, y), y]);
    }
    const profile: SurfaceProfile = {
      vertexX: x,
      semiAperture: semi,
      points,
      glassAfter: Boolean(s.material) && i < surfaces.length - 1,
    };
    x += s.thicknessMm ?? 0;
    return profile;
  });
}

// ── validation ───────────────────────────────────────────────────────────────

export function recordId(draft: RecordDraft): string {
  const segment = draft.category === 'other' ? 'component' : draft.category;
  return `${draft.namespace}.${segment}.${draft.name}`;
}

export function validateDraft(draft: RecordDraft): string[] {
  const errors: string[] = [];
  if (!ID_SEGMENT_RE.test(draft.namespace)) errors.push(`namespace '${draft.namespace}' is not lowercase-slug`);
  if (!ID_SEGMENT_RE.test(draft.name)) errors.push(`name '${draft.name}' must be a lowercase slug (a–z, 0–9, -, _)`);
  if (!SEMVER_RE.test(draft.version)) errors.push(`version '${draft.version}' is not semver (MAJOR.MINOR.PATCH)`);
  if (!RECORD_CATEGORIES.includes(draft.category)) errors.push(`unknown category '${draft.category}'`);

  const nonOptical = NONOPTICAL_CATEGORIES.includes(draft.category);
  if (nonOptical) {
    // WP-30: electronics/mechanics are BOM-only — reject stray optics
    // instead of demanding them.
    if (draft.surfaces.length > 0) errors.push(`${draft.category} records carry no surfaces`);
    if (draft.ports.length > 0) errors.push(`${draft.category} records carry no ports`);
    return errors;
  }
  const needsFragment = !FRAGMENTLESS_CATEGORIES.includes(draft.category);
  if (needsFragment && draft.surfaces.length === 0) {
    errors.push(`${draft.category} records need at least one surface`);
  }
  draft.surfaces.forEach((s, i) => {
    if (s.thicknessMm !== null && s.thicknessMm < 0) errors.push(`surface ${i}: thickness must be ≥ 0`);
    if (s.semiApertureMm !== null && s.semiApertureMm <= 0) errors.push(`surface ${i}: semi-aperture must be > 0`);
    if (s.radiusMm === 0) errors.push(`surface ${i}: radius 0 is not a surface — use flat (∞) instead`);
  });
  if (draft.surfaces.length > 0 && draft.surfaces[draft.surfaces.length - 1].thicknessMm !== null) {
    errors.push('the last surface must not carry a thickness (gaps to the next component are air gaps)');
  }
  const stops = draft.surfaces.filter(s => s.isStop).length;
  if (stops > 1) errors.push('at most one surface can be the stop');

  const frameNames = new Set(draft.frames.map(f => f.name));
  if (frameNames.size !== draft.frames.length) errors.push('frame names must be unique');
  if (draft.ports.length === 0) errors.push('a component needs at least one port');
  const portNames = new Set<string>();
  draft.ports.forEach(p => {
    if (!p.name) errors.push('every port needs a name');
    if (portNames.has(p.name)) errors.push(`duplicate port name '${p.name}'`);
    portNames.add(p.name);
    if (!frameNames.has(p.frame)) errors.push(`port '${p.name}' references unknown frame '${p.frame}'`);
    if (!PORT_DIRECTIONS.includes(p.direction as (typeof PORT_DIRECTIONS)[number])) {
      errors.push(`port '${p.name}' direction must be one of ${PORT_DIRECTIONS.join(' ')}`);
    }
    if (p.afterSurface !== null && (p.afterSurface < 0 || p.afterSurface >= draft.surfaces.length)) {
      errors.push(`port '${p.name}' after-surface ${p.afterSurface} is out of range`);
    }
  });
  return errors;
}

// ── record (de)serialization ────────────────────────────────────────────────

type Json = Record<string, unknown>;

function surfaceToFragment(s: SurfaceDraft, isLast: boolean): Json {
  const geometry: Json = {
    type: 'StandardGeometry',
    radius: s.radiusMm === null ? Infinity : s.radiusMm,
    conic: s.conic,
  };
  const out: Json = { type: 'standard', geometry };
  if (s.material) out.material_post = { type: 'Material', name: s.material };
  if (!isLast && s.thicknessMm !== null) out.thickness = s.thicknessMm;
  if (s.isStop) out.is_stop = true;
  if (s.reflective) {
    out.interaction_model = { type: 'refractive_reflective', is_reflective: true };
  }
  if (s.semiApertureMm !== null) out.semi_aperture = s.semiApertureMm;
  return out;
}

export function draftToRecord(draft: RecordDraft): ComponentRecord {
  const frames: Json = {};
  for (const f of draft.frames) frames[f.name] = { 'z-mm': f.zMm };
  const ports: Json = {};
  for (const p of draft.ports) {
    const port: Json = { frame: p.frame, direction: p.direction };
    if (p.afterSurface !== null) port['after-surface'] = p.afterSurface;
    ports[p.name] = port;
  }
  const optics: Json = { frames, ports };
  if (draft.surfaces.length > 0) {
    optics.fragment = {
      surfaces: draft.surfaces.map((s, i) => surfaceToFragment(s, i === draft.surfaces.length - 1)),
    };
  }
  const record: Json = {
    kind: 'optical_component',
    id: recordId(draft),
    version: draft.version,
    category: draft.category,
    description: draft.description,
    tags: ['authored'],
    vendor: { name: draft.vendorName, mpn: draft.vendorMpn, url: draft.vendorUrl },
  };
  // Non-optical records (WP-30) omit the optics block entirely.
  if (!NONOPTICAL_CATEGORIES.includes(draft.category)) record.optics = optics;
  const efl = paraxialEflMm(draft.surfaces);
  if (efl !== null && draft.category === 'lens') {
    record.effective_focal_length_mm = Math.round(efl * 1e4) / 1e4;
  }
  // Category-specific extras (schema is extra=allow; consumers opt in).
  if (draft.category === 'mirror' && draft.mirrorAngleDeg !== null) {
    record.mount_angle_deg = draft.mirrorAngleDeg;
  }
  if (draft.category === 'source') {
    record.source = {
      wavelengths_um: draft.sourceWavelengthsUm,
      divergence_deg: draft.sourceDivergenceDeg ?? 0,
    };
  }
  if (draft.category === 'detector' && draft.detectorSensorMm) {
    record.detector = {
      sensor_mm: draft.detectorSensorMm,
      pixel_pitch_um: draft.detectorPixelPitchUm ?? null,
    };
  }
  return record as unknown as ComponentRecord;
}

export function recordToYaml(record: ComponentRecord): string {
  return stringify(record, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
}

export function recordFromYaml(text: string): ComponentRecord {
  return parse(text) as ComponentRecord;
}

// ── reopening records for editing ────────────────────────────────────────────

interface FragmentSurfaceJson {
  geometry?: { radius?: number | string; conic?: number };
  material_post?: { name?: string };
  thickness?: number;
  is_stop?: boolean;
  interaction_model?: { is_reflective?: boolean };
  semi_aperture?: number;
}

export function draftFromRecord(record: ComponentRecord): RecordDraft {
  const rec = record as unknown as Json;
  const id = String(rec.id ?? 'user.component.unnamed');
  const [namespace, , ...rest] = id.split('.');
  const rawCategory = String(rec.category ?? 'other');
  const category: RecordCategory = (RECORD_CATEGORIES as string[]).includes(rawCategory)
    ? (rawCategory as RecordCategory)
    : 'other';
  const draft = defaultDraft(category);
  draft.namespace = namespace || 'user';
  draft.name = rest.join('.') || id.split('.').pop() || '';
  draft.version = String(rec.version ?? '0.1.0');
  draft.description = String(rec.description ?? '');
  const vendor = (rec.vendor ?? {}) as Json;
  draft.vendorName = String(vendor.name ?? '');
  draft.vendorMpn = String(vendor.mpn ?? '');
  draft.vendorUrl = String(vendor.url ?? '');

  const optics = (rec.optics ?? {}) as Json;
  const fragment = (optics.fragment ?? null) as { surfaces?: FragmentSurfaceJson[] } | null;
  const surfaces = fragment?.surfaces ?? [];
  draft.surfaces = surfaces.map((s, i) => {
    const radius = s.geometry?.radius;
    const flat = radius === undefined || radius === null ||
      (typeof radius === 'number' && !Number.isFinite(radius)) ||
      (typeof radius === 'string' && /inf/i.test(radius));
    return {
      radiusMm: flat ? null : Number(radius),
      thicknessMm: i === surfaces.length - 1 ? null : (s.thickness ?? null),
      material: s.material_post?.name ?? '',
      semiApertureMm: s.semi_aperture ?? null,
      conic: s.geometry?.conic ?? 0,
      isStop: Boolean(s.is_stop),
      reflective: Boolean(s.interaction_model?.is_reflective),
    };
  });
  const frames = (optics.frames ?? {}) as Record<string, { 'z-mm'?: number | string }>;
  draft.frames = Object.entries(frames).map(([name, f]) => ({
    name,
    zMm: Number(f?.['z-mm'] ?? 0),
  }));
  if (draft.frames.length === 0) draft.frames = [{ name: 'optical', zMm: 0 }];
  const ports = (optics.ports ?? {}) as Record<
    string,
    { frame?: string; direction?: string; 'after-surface'?: number | null }
  >;
  draft.ports = Object.entries(ports).map(([name, p]) => ({
    name,
    frame: p.frame ?? 'optical',
    direction: p.direction ?? '+z',
    afterSurface: p['after-surface'] ?? null,
  }));

  if (typeof rec.mount_angle_deg === 'number') draft.mirrorAngleDeg = rec.mount_angle_deg;
  const source = rec.source as { wavelengths_um?: number[]; divergence_deg?: number } | undefined;
  if (source) {
    draft.sourceWavelengthsUm = source.wavelengths_um ?? [];
    draft.sourceDivergenceDeg = source.divergence_deg ?? null;
  }
  const detector = rec.detector as { sensor_mm?: [number, number]; pixel_pitch_um?: number } | undefined;
  if (detector?.sensor_mm) {
    draft.detectorSensorMm = detector.sensor_mm;
    draft.detectorPixelPitchUm = detector.pixel_pitch_um ?? null;
  }
  return draft;
}

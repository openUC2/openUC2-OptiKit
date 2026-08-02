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
  /**
   * WP-75: an "ideal / paraxial element" row — the honest model of a catalog
   * objective with no known prescription. When set, the surface serializes
   * with optiland's ThinLensInteractionModel at this focal length (geometry
   * stays plano, no glass). null/absent = an ordinary refractive surface.
   */
  paraxialFocalMm?: number | null;
  /**
   * WP-90: a RECTANGULAR clear aperture, width × height in mm — a beam-fold
   * mirror is often rectangular, which a semi-aperture alone cannot say.
   * Serialized as Optiland's own `aperture` block (RectangularAperture);
   * null/absent = circular via `semiApertureMm`.
   */
  apertureRectMm?: [number, number] | null;
}

/** One glass element of the stack (WP-75): surfaces [start..end] form a
 * contiguous glass group; the element boundary is a surface with no
 * material (air follows). Mirrors optikit-core's `glass_groups`. */
export interface GlassElement {
  start: number;
  end: number;
}

export function glassElements(surfaces: SurfaceDraft[]): GlassElement[] {
  const elements: GlassElement[] = [];
  let start: number | null = null;
  surfaces.forEach((s, i) => {
    if (start === null) start = i;
    const glassAfter = Boolean(s.material) && (s.paraxialFocalMm ?? null) === null;
    if (!glassAfter || i === surfaces.length - 1) {
      elements.push({ start, end: i });
      start = null;
    }
  });
  return elements;
}

export interface FrameDraft {
  name: string;
  zMm: number;
  /** WP-90: the frame's clear aperture (marker-disc DIAMETER, mm) — feeds
   * the index's per-port `clear_aperture_mm` and DRC_APERTURE (WP-79).
   * null = not declared (the editor used to drop this field entirely). */
  clearApertureMm?: number | null;
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
  /**
   * WP-90/WP-74: the coated surface's spectral band in µm, [lo, hi] with
   * null = open-ended. Category decides the semantics on serialization —
   * mirror/dichroic REFLECT the band, a filter TRANSMITS it — written as the
   * WP-74 `response` block on the coated surface of the fragment.
   */
  responseBandUm: [number | null, number | null] | null;
  /**
   * WP-90: a component may name its housing mechanical_template directly
   * (`mechanics: {template: <id>}`) so a hand-authored record can point at
   * its Inventor STEP without going through the workbench. Additive; the
   * schema is extra=allow (E2 note to core). '' = none.
   */
  mechanicsTemplate: string;
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
    responseBandUm: null,
    mechanicsTemplate: '',
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
      // WP-90: a mirror is a SUBSTRATE — a reflective front surface, a real
      // thickness and a back surface — not a lens's biconvex default. The
      // beam reflects at surface 0; the substrate solid is what a holder
      // (WP-61/77) carves its cavity around.
      base.surfaces = [
        surface({ reflective: true, thicknessMm: 6, material: 'N-BK7' }),
        surface({}),
      ];
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
    const paraxial = s.paraxialFocalMm ?? null;
    const nAfter = paraxial !== null ? n : s.material ? indexHint(s.material) : 1.0;
    // WP-75: an ideal element contributes P = 1/f, no index change.
    const power =
      paraxial !== null
        ? (paraxial !== 0 ? 1 / paraxial : 0)
        : s.radiusMm
          ? (nAfter - n) / s.radiusMm
          : 0; // P = (n2−n1)/R
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

// ── derived directions (WP-40: surfaces are the truth) ───────────────────────

const PORT_AXIS_VECTORS: Record<string, [number, number, number]> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

/** The reflected beam a mount angle θ implies (entry beam +z, tilt about y):
 * r = (−sin 2θ, 0, −cos 2θ) — θ=45° → '-x', θ=0 → retro. */
export function derivedReflectedDir(mountAngleDeg: number): [number, number, number] {
  const two = (2 * mountAngleDeg * Math.PI) / 180;
  return [-Math.sin(two), 0, -Math.cos(two)];
}

/**
 * Cross-check the authored port directions against what the surfaces imply
 * (WP-40 — the frontend mirror of optikit-core's `check_port_directions`).
 * A mirror record whose `mount angle` says 30° while the `reflected` port
 * enum still claims '-x' gets warned: the enum is a statement ABOUT the
 * geometry, not a second source of truth.
 */
export function derivedPortWarnings(draft: RecordDraft): string[] {
  const mirrorFamily = ['mirror', 'beamsplitter', 'dichroic'].includes(draft.category);
  if (!mirrorFamily || draft.mirrorAngleDeg === null) return [];
  if (!draft.surfaces.some(s => s.reflective)) return [];
  const implied = derivedReflectedDir(draft.mirrorAngleDeg);
  const warnings: string[] = [];
  for (const port of draft.ports) {
    if (/^(front|sensor|in|plane)$/.test(port.name)) continue;
    const authored = PORT_AXIS_VECTORS[port.direction];
    if (!authored) continue;
    const dot = Math.max(-1, Math.min(1,
      authored[0] * implied[0] + authored[1] * implied[1] + authored[2] * implied[2]));
    const deviationDeg = (Math.acos(dot) * 180) / Math.PI;
    if (deviationDeg > 2) {
      warnings.push(
        `port '${port.name}': authored direction '${port.direction}' is ` +
        `${deviationDeg.toFixed(1)}° off what the ${draft.mirrorAngleDeg}° mount ` +
        `angle implies ([${implied.map(v => v.toFixed(3)).join(', ')}]) — ` +
        'the surfaces are the truth',
      );
    }
  }
  return warnings;
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
    // WP-75: an ideal element is a thin lens — power from f, no reflection.
    if ((s.paraxialFocalMm ?? null) !== null) {
      if (s.paraxialFocalMm === 0) errors.push(`surface ${i}: a paraxial element needs a non-zero focal length`);
      if (s.reflective) errors.push(`surface ${i}: a paraxial element cannot also be reflective`);
    }
    // WP-90: a rectangular clear aperture needs both extents.
    if (s.apertureRectMm && (s.apertureRectMm[0] <= 0 || s.apertureRectMm[1] <= 0)) {
      errors.push(`surface ${i}: rectangular aperture needs width > 0 and height > 0`);
    }
  });
  // WP-90/WP-74: a spectral band must be ordered (null = open-ended is fine).
  if (draft.responseBandUm) {
    const [lo, hi] = draft.responseBandUm;
    if (lo !== null && hi !== null && lo > hi) {
      errors.push(`response band [${lo}, ${hi}] µm has lo > hi`);
    }
  }
  draft.frames.forEach(f => {
    if (f.clearApertureMm != null && f.clearApertureMm <= 0) {
      errors.push(`frame '${f.name}': clear aperture must be > 0`);
    }
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
  const paraxial = s.paraxialFocalMm ?? null;
  const geometry: Json = {
    type: 'StandardGeometry',
    // WP-75: an ideal element is geometrically plano — the power lives in
    // its interaction model, not in a radius.
    radius: paraxial !== null || s.radiusMm === null ? Infinity : s.radiusMm,
    conic: s.conic,
  };
  const out: Json = { type: 'standard', geometry };
  if (s.material && paraxial === null) {
    out.material_post = { type: 'Material', name: s.material };
  }
  if (!isLast && s.thicknessMm !== null) out.thickness = s.thicknessMm;
  if (s.isStop) out.is_stop = true;
  if (paraxial !== null) {
    out.interaction_model = { type: 'thin_lens', focal_length: paraxial };
  } else if (s.reflective) {
    out.interaction_model = { type: 'refractive_reflective', is_reflective: true };
  }
  if (s.semiApertureMm !== null) out.semi_aperture = s.semiApertureMm;
  // WP-90: a rectangular clear aperture, in Optiland's own serialization —
  // the fragment stays a verbatim Optiland surface dict.
  if (s.apertureRectMm) {
    const [w, h] = s.apertureRectMm;
    out.aperture = {
      type: 'RectangularAperture',
      x_min: -w / 2,
      x_max: w / 2,
      y_min: -h / 2,
      y_max: h / 2,
    };
  }
  return out;
}

/**
 * WP-90/WP-74: the draft-level band as a `response` block for the coated
 * surface. Mirror/dichroic reflect the band; a filter transmits it
 * (absorptive — straight-through, no reflect arm).
 */
function responseBlockFor(
  category: RecordCategory,
  band: [number | null, number | null],
): Json | null {
  if (category === 'mirror' || category === 'dichroic') {
    return { kind: category, 'reflect-bands-um': [band] };
  }
  if (category === 'filter') {
    return { kind: 'absorptive', 'transmit-bands-um': [band] };
  }
  return null;
}

/** The surface the category's coating lives on: the reflective surface for
 * mirror/dichroic (fall back to 0), the front surface for a filter. */
function coatedSurfaceIndex(draft: RecordDraft): number {
  const reflective = draft.surfaces.findIndex(s => s.reflective);
  return reflective >= 0 ? reflective : 0;
}

export function draftToRecord(draft: RecordDraft): ComponentRecord {
  const frames: Json = {};
  for (const f of draft.frames) {
    const frame: Json = { 'z-mm': f.zMm };
    // WP-90: the editor used to silently drop the frame aperture.
    if (f.clearApertureMm != null) frame['clear-aperture-mm'] = f.clearApertureMm;
    frames[f.name] = frame;
  }
  const ports: Json = {};
  for (const p of draft.ports) {
    const port: Json = { frame: p.frame, direction: p.direction };
    if (p.afterSurface !== null) port['after-surface'] = p.afterSurface;
    ports[p.name] = port;
  }
  const optics: Json = { frames, ports };
  if (draft.surfaces.length > 0) {
    const surfaces = draft.surfaces.map((s, i) =>
      surfaceToFragment(s, i === draft.surfaces.length - 1),
    );
    // WP-90/WP-74: the spectral band lands on the coated surface.
    if (draft.responseBandUm) {
      const block = responseBlockFor(draft.category, draft.responseBandUm);
      if (block) surfaces[coatedSurfaceIndex(draft)].response = block;
    }
    optics.fragment = { surfaces };
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
  // WP-90: a component naming its housing template directly (E2 schema note:
  // additive, Go round-trips it through extra="allow").
  if (draft.mechanicsTemplate) {
    record.mechanics = { template: draft.mechanicsTemplate };
  }
  return record as unknown as ComponentRecord;
}

/**
 * WP-102: keys that belong to the RECORD's curation, not to this form.
 *
 * `draftToRecord` authors a record from scratch — it has no field for any of
 * these, so writing its output over an existing file DELETES them. That is
 * not hypothetical: a "write into ../optikit-core/library" replaced
 * `tags: [mirror, mirror/flat, mirror/single-sided]` with `[authored]`, and on
 * other records destroyed `docs`, `review`, `price` and `glb-url`.
 */
const CURATION_KEYS = new Set(['tags', 'docs', 'review', 'thumbnail', 'mechanics']);

/**
 * WP-102: fold an authored draft back into the record it was opened from, so a
 * write is an EDIT and not a replacement. Everything the form authors wins;
 * everything it has no field for — curation keys above, plus any key the
 * schema's `extra="allow"` let a future version add — survives from `base`.
 *
 * `base` is null for a brand-new record, in which case there is nothing to
 * preserve and the authored record stands as-is.
 *
 * Caveat worth knowing: this protects TOP-LEVEL keys. Unknown keys INSIDE an
 * Optiland surface still do not survive the draft round-trip (SurfaceDraft is
 * a structured form, not a passthrough) — `changedRecordKeys` will report
 * `optics` as changed so the confirm step can say so.
 */
export function mergeIntoRecord(
  base: ComponentRecord | null,
  next: ComponentRecord,
): ComponentRecord {
  if (!base) return next;
  const from = base as unknown as Json;
  const merged: Json = { ...from };
  for (const [key, value] of Object.entries(next as unknown as Json)) {
    // A curated value the form cannot express is never overwritten.
    if (CURATION_KEYS.has(key) && from[key] !== undefined) continue;
    merged[key] = value;
  }
  // The optics block is authored wholesale, but keep sub-keys the form has no
  // field for (e.g. `passthrough` on a mechanical-only record).
  const baseOptics = from.optics as Json | undefined;
  const nextOptics = (next as unknown as Json).optics as Json | undefined;
  if (baseOptics && nextOptics) merged.optics = { ...baseOptics, ...nextOptics };
  return merged as unknown as ComponentRecord;
}

/**
 * WP-102: the same merge for ANY record kind, as YAML text — the template and
 * module halves of the bind flow are authored from scratch too, and that is
 * how a curated template lost its `glb-url` and a module its `price` and
 * `docs`. `baseYaml` null (the record does not exist yet) writes `nextYaml`.
 */
export function mergeYamlRecord(baseYaml: string | null, nextYaml: string): string {
  if (!baseYaml) return nextYaml;
  let base: Json;
  try {
    base = parse(baseYaml) as Json;
  } catch {
    return nextYaml; // unparseable on disk — do not block the write
  }
  if (!base || typeof base !== 'object') return nextYaml;
  const next = parse(nextYaml) as Json;
  const merged: Json = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (CURATION_KEYS.has(key) && base[key] !== undefined) continue;
    merged[key] = value;
  }
  return stringify(merged, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
}

/** WP-102: top-level keys whose value differs — what a write would change. */
export function changedRecordKeys(base: ComponentRecord, next: ComponentRecord): string[] {
  const a = base as unknown as Json;
  const b = next as unknown as Json;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
    .sort();
}

export function recordToYaml(record: ComponentRecord): string {
  return stringify(record, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
}

export function recordFromYaml(text: string): ComponentRecord {
  return parse(text) as ComponentRecord;
}

// ── reopening records for editing ────────────────────────────────────────────

export interface FragmentSurfaceJson {
  geometry?: { radius?: number | string; conic?: number };
  material_post?: { name?: string };
  thickness?: number;
  is_stop?: boolean;
  interaction_model?: { type?: string; is_reflective?: boolean; focal_length?: number };
  semi_aperture?: number;
  /** WP-90: Optiland's own aperture serialization (RectangularAperture…). */
  aperture?: { type?: string; x_min?: number; x_max?: number; y_min?: number; y_max?: number } | null;
  /** WP-74: spectral response block, validated by the core schema. */
  response?: {
    kind?: string;
    'reflect-bands-um'?: [number | null, number | null][] | null;
    'transmit-bands-um'?: [number | null, number | null][] | null;
  } | null;
}

/** WP-75: both authoring spellings of the paraxial model reopen. */
const THIN_LENS_TYPES = /^(thin_lens|thinlensinteractionmodel)$/i;

/**
 * Verbatim optiland fragment dicts → editable/displayable SurfaceDraft rows.
 * The inverse of `surfaceToFragment`; ±Infinity radii (also their JSON-lossy
 * spellings: null, "inf", 1e999-as-Infinity) read back as flat. Shared by
 * `draftFromRecord` and the WP-89 part inspector, which reads the same
 * fragments straight from the library index.
 */
export function fragmentSurfacesToDrafts(surfaces: FragmentSurfaceJson[]): SurfaceDraft[] {
  return surfaces.map((s, i) => {
    const radius = s.geometry?.radius;
    const flat = radius === undefined || radius === null ||
      (typeof radius === 'number' && !Number.isFinite(radius)) ||
      (typeof radius === 'string' && /inf/i.test(radius));
    const thinLens = THIN_LENS_TYPES.test(s.interaction_model?.type ?? '');
    const ap = s.aperture;
    const rect =
      ap && /rectangular/i.test(ap.type ?? '') &&
      ap.x_min != null && ap.x_max != null && ap.y_min != null && ap.y_max != null
        ? ([ap.x_max - ap.x_min, ap.y_max - ap.y_min] as [number, number])
        : null;
    return {
      radiusMm: flat ? null : Number(radius),
      thicknessMm: i === surfaces.length - 1 ? null : (s.thickness ?? null),
      material: s.material_post?.name ?? '',
      semiApertureMm: s.semi_aperture ?? null,
      conic: s.geometry?.conic ?? 0,
      isStop: Boolean(s.is_stop),
      reflective: Boolean(s.interaction_model?.is_reflective),
      // Only present for thin-lens rows, so ordinary stacks round-trip
      // byte-identically through draftFromRecord.
      ...(thinLens ? { paraxialFocalMm: s.interaction_model?.focal_length ?? null } : {}),
      ...(rect ? { apertureRectMm: rect } : {}),
    };
  });
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
  const rawSurfaces = fragment?.surfaces ?? [];
  draft.surfaces = fragmentSurfacesToDrafts(rawSurfaces);
  // WP-90/WP-74: the first response block reopens as the draft-level band
  // (reflect for mirror/dichroic, transmit for a filter). An imported record
  // with several response surfaces keeps only the first through an edit.
  const responded = rawSurfaces.find(s => s.response);
  if (responded?.response) {
    const bands =
      responded.response['reflect-bands-um'] ?? responded.response['transmit-bands-um'];
    if (bands && bands.length > 0) draft.responseBandUm = bands[0];
  }
  const frames = (optics.frames ?? {}) as Record<
    string,
    { 'z-mm'?: number | string; 'clear-aperture-mm'?: number | string | null }
  >;
  draft.frames = Object.entries(frames).map(([name, f]) => ({
    name,
    zMm: Number(f?.['z-mm'] ?? 0),
    ...(f?.['clear-aperture-mm'] != null
      ? { clearApertureMm: Number(f['clear-aperture-mm']) }
      : {}),
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
  // WP-90: the housing-template reference reopens.
  const mechanics = rec.mechanics as { template?: string } | undefined;
  if (mechanics?.template) draft.mechanicsTemplate = String(mechanics.template);
  return draft;
}

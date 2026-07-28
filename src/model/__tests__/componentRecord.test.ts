/**
 * WP-14 component editor model tests.
 *
 * The AC254-050-A draft below uses Thorlabs *datasheet* values (R1 33.34,
 * R2 −22.28, R3 −291.07, CT 9.0 + 2.5, N-BAF10/N-SF10, Ø25.4) — the
 * acceptance case: this exact record, serialized to YAML by the same code
 * path the "Download record YAML" button uses, must validate in optikit-core
 * (proven by tests/fixtures/ac254-050-a.component.yml, checked in bash via
 * `optikit-core library validate`; see the fixture test at the bottom).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  centerThicknessMm,
  defaultDraft,
  draftFromRecord,
  draftToRecord,
  glassElements,
  paraxialEflMm,
  recordId,
  recordToYaml,
  sagAt,
  surfaceProfiles,
  validateDraft,
} from '../componentRecord';
import { ac254Draft } from './ac254Fixture';

describe('validateDraft', () => {
  it('accepts the AC254-050-A draft', () => {
    expect(validateDraft(ac254Draft())).toEqual([]);
  });

  it('names every violation', () => {
    const draft = ac254Draft();
    draft.name = 'Not A Slug';
    draft.version = 'v1';
    draft.surfaces[2].thicknessMm = 40; // last surface must not carry thickness
    draft.ports[1].frame = 'nonexistent';
    draft.ports[1].afterSurface = 9;
    const errors = validateDraft(draft).join('\n');
    expect(errors).toMatch(/lowercase slug/);
    expect(errors).toMatch(/semver/);
    expect(errors).toMatch(/last surface/);
    expect(errors).toMatch(/unknown frame/);
    expect(errors).toMatch(/out of range/);
  });

  it('requires surfaces for lens-like categories but not for sources', () => {
    const lens = defaultDraft('lens');
    lens.name = 'x';
    lens.surfaces = [];
    expect(validateDraft(lens).join()).toMatch(/at least one surface/);

    const source = defaultDraft('source');
    source.name = 'laser-488';
    expect(validateDraft(source)).toEqual([]);
  });
});

describe('optics groups (WP-75)', () => {
  it('groups a cemented doublet as ONE element and splits on air gaps', () => {
    const draft = ac254Draft();
    expect(glassElements(draft.surfaces)).toEqual([{ start: 0, end: 2 }]);

    // Doublet + air gap + singlet → two elements.
    const spaced = [
      { ...draft.surfaces[0] },
      { ...draft.surfaces[1], material: '', thicknessMm: 5 },
      { ...draft.surfaces[0], radiusMm: 51.06 },
      { ...draft.surfaces[2], radiusMm: -51.06 },
    ];
    expect(glassElements(spaced)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
  });

  it('serializes an ideal element as a thin-lens surface and reopens it', () => {
    const draft = defaultDraft('lens');
    draft.name = 'paraxial-20x';
    draft.surfaces = [{
      radiusMm: null, thicknessMm: null, material: '', semiApertureMm: 5.65,
      conic: 0, isStop: true, reflective: false, paraxialFocalMm: 9,
    }];
    draft.ports = [
      { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
      { name: 'back', frame: 'optical', direction: '+z', afterSurface: 0 },
    ];
    expect(validateDraft(draft)).toEqual([]);
    const record = draftToRecord(draft);
    const surf = (record.optics as { fragment: { surfaces: Record<string, unknown>[] } })
      .fragment.surfaces[0];
    expect(surf.interaction_model).toEqual({ type: 'thin_lens', focal_length: 9 });
    expect(surf.material_post).toBeUndefined();
    // The paraxial sketch sees P = 1/f.
    expect(paraxialEflMm(draft.surfaces)).toBeCloseTo(9, 6);
    // Reopening restores the row kind (both type spellings).
    const reopened = draftFromRecord(record);
    expect(reopened.surfaces[0].paraxialFocalMm).toBe(9);
  });

  it('rejects a reflective or zero-f paraxial element', () => {
    const draft = defaultDraft('lens');
    draft.name = 'bad';
    draft.surfaces = [{
      radiusMm: null, thicknessMm: null, material: '', semiApertureMm: 5,
      conic: 0, isStop: false, reflective: true, paraxialFocalMm: 0,
    }];
    const errors = validateDraft(draft).join('\n');
    expect(errors).toMatch(/non-zero focal length/);
    expect(errors).toMatch(/cannot also be reflective/);
  });
});

describe('draftToRecord', () => {
  it('builds the record in optikit-core conventions', () => {
    const record = draftToRecord(ac254Draft()) as unknown as Record<string, unknown>;
    expect(record.kind).toBe('optical_component');
    expect(record.id).toBe('user.lens.ac254-050-a');
    const optics = record.optics as {
      fragment: { surfaces: Record<string, unknown>[] };
      frames: Record<string, { 'z-mm': number }>;
      ports: Record<string, { 'after-surface'?: number }>;
    };
    const surfaces = optics.fragment.surfaces;
    expect(surfaces).toHaveLength(3);
    // Air gap omits material_post; last surface carries no thickness.
    expect(surfaces[2].material_post).toBeUndefined();
    expect(surfaces[2].thickness).toBeUndefined();
    expect((surfaces[0].material_post as { name: string }).name).toBe('N-BAF10');
    expect(optics.frames.exit['z-mm']).toBe(11.5);
    expect(optics.ports.back['after-surface']).toBe(2);
  });

  it('computes a paraxial EFL near the catalog 50 mm', () => {
    const efl = paraxialEflMm(ac254Draft().surfaces);
    expect(efl).not.toBeNull();
    expect(Math.abs((efl as number) - 50)).toBeLessThan(2.5); // hint-index approximation
  });

  it('round-trips through draftFromRecord', () => {
    const draft = ac254Draft();
    const roundTripped = draftFromRecord(draftToRecord(draft));
    expect(recordId(roundTripped)).toBe(recordId(draft));
    expect(roundTripped.surfaces).toEqual(draft.surfaces);
    expect(roundTripped.frames).toEqual(draft.frames);
    expect(roundTripped.ports).toEqual(draft.ports);
    expect(centerThicknessMm(roundTripped.surfaces)).toBeCloseTo(11.5);
  });

  it('serializes flat radii as .inf for the python side', () => {
    const mirror = defaultDraft('mirror');
    mirror.name = 'fold-45';
    const yaml = recordToYaml(draftToRecord(mirror));
    expect(yaml).toMatch(/radius: \.inf/);
    expect(yaml).toMatch(/is_reflective: true/);
  });
});

describe('acceptance fixture', () => {
  it('matches the committed YAML validated against optikit-core', () => {
    // tests/fixtures/ac254-050-a.component.yml is exactly what the download
    // button produces for ac254Draft(); optikit-core `library validate`
    // passes on it (see DOCS note / WP-14 acceptance).
    const fixture = readFileSync(
      join(__dirname, 'fixtures', 'ac254-050-a.component.yml'),
      'utf8',
    );
    expect(recordToYaml(draftToRecord(ac254Draft()))).toBe(fixture);
  });
});

// ── WP-30: true element profiles + non-optical records ───────────────────────

describe('surface profiles (WP-30)', () => {
  it('sagAt follows the conic sag equation and clamps beyond the extent', () => {
    // Sphere R=50 at y=10: z = c y²/(1+√(1−c²y²)) = 2/(1+√0.96) ≈ 1.0102
    expect(sagAt(50, 0, 10)).toBeCloseTo(1.0102, 3);
    expect(sagAt(50, 0, 0)).toBe(0);
    expect(sagAt(null, 0, 10)).toBe(0); // flat
    expect(sagAt(-50, 0, 10)).toBeCloseTo(-1.0102, 3); // concave-left
    expect(sagAt(5, 0, 10)).toBe(0); // beyond the hemisphere — clamped
  });

  it('editing the radius reshapes the drawn profile, not just the rays', () => {
    const draft = ac254Draft();
    const wide = surfaceProfiles(draft.surfaces);
    draft.surfaces[0].radiusMm = 25; // 50 → 25 mm: twice the curvature
    const bent = surfaceProfiles(draft.surfaces);
    const yEdge = wide[0].points[0][1];
    expect(Math.abs(bent[0].points[0][0])).toBeGreaterThan(
      Math.abs(wide[0].points[0][0]),
    );
    expect(bent[0].points[0][1]).toBe(yEdge); // same sampled heights
    // The exit surface sits at the center thickness along the axis.
    expect(wide[wide.length - 1].vertexX).toBeCloseTo(centerThicknessMm(draft.surfaces), 6);
  });
});

describe('non-optical records (WP-30)', () => {
  it('electronics drafts validate WITHOUT surfaces or ports', () => {
    const draft = defaultDraft('electronics');
    draft.name = 'uc2e-esp32';
    draft.vendorName = 'openUC2';
    expect(validateDraft(draft)).toEqual([]);
    expect(recordId(draft)).toBe('user.electronics.uc2e-esp32');
  });

  it('stray optics on a non-optical draft are rejected', () => {
    const draft = defaultDraft('electronics');
    draft.name = 'bad';
    draft.ports = [{ name: 'front', frame: 'optical', direction: '-z', afterSurface: null }];
    expect(validateDraft(draft).join()).toMatch(/carry no ports/);
  });

  it('serializes without an optics block and round-trips', () => {
    const draft = defaultDraft('mechanics');
    draft.name = 'baseplate';
    const record = draftToRecord(draft);
    expect((record as unknown as Record<string, unknown>).optics).toBeUndefined();
    const back = draftFromRecord(record);
    expect(back.category).toBe('mechanics');
    expect(back.surfaces).toEqual([]);
    expect(back.ports).toEqual([]);
  });
});

// ── WP-38/WP-40 ──────────────────────────────────────────────────────────────

import { derivedPortWarnings, derivedReflectedDir, recordFromYaml } from '../componentRecord';

describe('recordFromYaml round trip (WP-38: index records open too)', () => {
  it('yaml → record → draft → record survives', () => {
    const draft = defaultDraft('lens');
    draft.namespace = 'user';
    draft.name = 'roundtrip';
    const record = draftToRecord(draft)!;
    const reparsed = recordFromYaml(recordToYaml(record));
    expect(reparsed.id).toBe('user.lens.roundtrip');
    const redraft = draftFromRecord(reparsed);
    expect(recordToYaml(draftToRecord(redraft)!)).toBe(recordToYaml(record));
  });
});

describe('derived port directions (WP-40: surfaces are the truth)', () => {
  it('45° mount angle implies the -x arm; 0° implies retro', () => {
    const [x45, , z45] = derivedReflectedDir(45);
    expect(x45).toBeCloseTo(-1, 6);
    expect(z45).toBeCloseTo(0, 6);
    const [, , z0] = derivedReflectedDir(0);
    expect(z0).toBeCloseTo(-1, 6);
  });

  it('warns when the enum disagrees with the mount angle', () => {
    const draft = defaultDraft('mirror');
    expect(derivedPortWarnings(draft)).toEqual([]); // 45° + '-x' agree
    draft.mirrorAngleDeg = 30; // arm now 60° off -x
    const warnings = derivedPortWarnings(draft);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("port 'reflected'");
    expect(warnings[0]).toContain('mount');
  });

  it('stays quiet for non-mirror categories', () => {
    expect(derivedPortWarnings(defaultDraft('lens'))).toEqual([]);
  });
});

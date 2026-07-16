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

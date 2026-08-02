/**
 * WP-100: the `?open=` deep link must open the part that was clicked — from a
 * workspace draft, from an imported .dsn bundle, or from the registry — and
 * must NEVER leave a blank new record on screen pretending to be that part.
 *
 * This is the exact field scenario: import demo-bench.dsn.zip, right-click the
 * demo lens → "open in the component editor", get `user.lens.@0.1.0` with the
 * default R ±50 surfaces instead of the ±48.27 singlet.
 */

import { describe, expect, it, vi } from 'vitest';

const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { resolveLocalRecord, resolveRegistryRecord } = await import('../openRecord');

import type { ComponentRecord } from '../dsn/generated/library-component';
import type { IndexComponent } from '../libraryIndex';

const ID = 'user.lens.demo_achromat_50';

const DRAFT = {
  kind: 'optical_component',
  id: ID,
  version: '0.1.0',
  category: 'lens',
  description: 'the real demo singlet',
  effective_focal_length_mm: 47.54,
} as unknown as ComponentRecord;

const BUNDLE_YAML = `
kind: optical_component
id: ${ID}
version: 0.1.0
category: lens
description: from the zip
effective_focal_length_mm: 47.54
optics:
  fragment:
    surfaces:
      - {type: standard, geometry: {type: StandardGeometry, radius: 48.27, conic: 0},
         material_post: {type: Material, name: N-BK7}, thickness: 5.0, semi_aperture: 12.5}
      - {type: standard, geometry: {type: StandardGeometry, radius: -48.27, conic: 0}, semi_aperture: 12.5}
  frames:
    optical: {z-mm: 0}
  ports:
    front: {frame: optical, direction: -z}
`;

const SUMMARY: IndexComponent = {
  id: ID,
  version: '0.1.0',
  kind: 'optical_component',
  category: 'lens',
  description: 'summary only',
  tags: [],
  vendor: { name: '', mpn: '', url: '' },
  efl_mm: 47.54,
  n_surfaces: 2,
  review: false,
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
  fragment_surfaces: [
    { type: 'standard', geometry: { type: 'StandardGeometry', radius: 48.27 } },
    { type: 'standard', geometry: { type: 'StandardGeometry', radius: -48.27 } },
  ],
};

describe('resolveLocalRecord', () => {
  it('finds a workspace draft — where every bundle import puts its components', () => {
    const out = resolveLocalRecord(ID, { workspaceRecords: { [ID]: DRAFT }, bundleFiles: {} })!;
    expect(out.record.id).toBe(ID);
    expect(out.origin).toBe('workspace');
    expect(out.tab).toBe('workspace');
    // 'workspace' origin suppresses the "editing a copy" banner — saving a
    // record you already own updates it in place.
    expect(out.warning).toBeNull();
    expect(out.reconstructed).toBe(false);
  });

  it("falls back to the zip's retained YAML", () => {
    const out = resolveLocalRecord(ID, {
      workspaceRecords: {},
      bundleFiles: { [`library/components/${ID}/component.yml`]: BUNDLE_YAML },
    })!;
    expect(out.record.description).toBe('from the zip');
    expect(out.origin).toBe('workspace');
  });

  it('returns null for an id it does not hold, so the registry gets its turn', () => {
    expect(resolveLocalRecord(ID, { workspaceRecords: {}, bundleFiles: {} })).toBeNull();
  });

  it('a malformed bundle YAML falls through rather than throwing', () => {
    const out = resolveLocalRecord(ID, {
      workspaceRecords: {},
      bundleFiles: { [`library/components/${ID}/component.yml`]: ': not: valid: yaml: [' },
    });
    expect(out).toBeNull();
  });
});

describe('resolveRegistryRecord', () => {
  it('returns the published record when the asset endpoint answers', async () => {
    const out = await resolveRegistryRecord(ID, {
      indexComponents: [SUMMARY],
      fetchRecord: async () => DRAFT,
    });
    expect(out.record?.description).toBe('the real demo singlet');
    expect(out.warning).toBeNull();
  });

  it('reconstructs from the index summary when the record cannot be fetched', async () => {
    const out = await resolveRegistryRecord(ID, {
      indexComponents: [SUMMARY],
      fetchRecord: async () => {
        throw new Error('404 Not Found');
      },
    });
    expect(out.record).not.toBeNull();
    // The physics survives — that is the point of the fallback.
    const optics = out.record!.optics as { fragment?: { surfaces?: unknown[] }; ports?: object };
    expect(optics.fragment?.surfaces).toHaveLength(2);
    expect(out.record!.effective_focal_length_mm).toBe(47.54);
    expect(Object.keys(optics.ports ?? {})).toEqual(['front', 'back']);
    // …and it is labelled, because docs/review/mechanics did not survive.
    expect((out as { reconstructed?: boolean }).reconstructed).toBe(true);
    expect(out.warning).toContain('reconstructed from the index summary');
    expect(out.warning).toContain('404');
  });

  it('a distinct datum frame per port z, so a two-frame record round-trips', async () => {
    const out = await resolveRegistryRecord(ID, {
      indexComponents: [SUMMARY],
      fetchRecord: async () => {
        throw new Error('offline');
      },
    });
    const frames = (out.record!.optics as { frames?: Record<string, { 'z-mm': number }> }).frames!;
    expect(frames.optical['z-mm']).toBe(0);
    expect(frames.exit['z-mm']).toBe(5);
  });

  it('an unknown id fails LOUDLY — never a silent blank draft', async () => {
    const out = await resolveRegistryRecord('user.lens.nope', {
      indexComponents: [SUMMARY],
      fetchRecord: async () => {
        throw new Error('404 Not Found');
      },
    });
    expect(out.record).toBeNull();
    expect(out.warning).toContain('could not open user.lens.nope');
    expect(out.warning).toContain('is a NEW record, not that part');
  });
});

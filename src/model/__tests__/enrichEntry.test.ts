/**
 * WP-98b: a HOLLOW registry module (indexed without its component/template —
 * a partially copied library, a stale index) gets its optics back from the
 * index components, the workspace drafts, or an imported bundle. This is the
 * exact "E_NO_OPTICS at L1 / ghost cube" scenario from the field.
 */

import { describe, expect, it, vi } from 'vitest';

const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { enrichEntry } = await import('../useLibraryRegistration');

import type { LibraryPaletteEntry } from '../../document/libraryPalette';
import type { IndexComponent } from '../libraryIndex';
import type { ComponentRecord } from '../dsn/generated/library-component';

const HOLLOW: LibraryPaletteEntry = {
  moduleId: 'user.cube.demo_lens_50',
  componentId: 'user.lens.demo_achromat_50',
  name: 'demo lens 50',
  description: '',
  category: 'lens',
  templateClass: null,
  states: [],
  dofs: [],
  footprintGrid: [1, 1, 1],
  thumbnailUrl: null,
  glbUrl: null,
  ports: [],
  eflMm: null,
  wavelengthsUm: [],
  symbolUrl: null,
  programmable: null,
  priceEur: null,
  review: true,
  source: 'registry',
  unbound: false,
  fragmentSurfaces: [],
  carrier: false,
  bays: {},
};

const SURFACES = [
  { type: 'standard', geometry: { type: 'StandardGeometry', radius: 48.27, conic: 0 } },
  { type: 'standard', geometry: { type: 'StandardGeometry', radius: -48.27, conic: 0 } },
];

describe('enrichEntry (WP-98b)', () => {
  it('joins the fragment + EFL from the index components', () => {
    const ic = {
      id: 'user.lens.demo_achromat_50',
      efl_mm: 47.54,
      fragment_surfaces: SURFACES,
    } as unknown as IndexComponent;
    const out = enrichEntry(HOLLOW, [ic], {}, new Map());
    expect(out.fragmentSurfaces).toHaveLength(2);
    expect(out.eflMm).toBe(47.54);
  });

  it('falls back to a workspace draft of the component', () => {
    const ws = {
      id: 'user.lens.demo_achromat_50',
      effective_focal_length_mm: 47.54,
      optics: { fragment: { surfaces: SURFACES } },
    } as unknown as ComponentRecord;
    const out = enrichEntry(HOLLOW, [], { 'user.lens.demo_achromat_50': ws }, new Map());
    expect(out.fragmentSurfaces).toHaveLength(2);
    expect(out.eflMm).toBe(47.54);
  });

  it('a bundle entry donates mesh, docs and template class', () => {
    const bundle = new Map([[
      'user.cube.demo_lens_50',
      {
        ...HOLLOW,
        glbUrl: 'blob:demo',
        templateClass: 'fixed' as const,
        docs: [{ title: 'demo-part.md', text: '# docs' }],
        fragmentSurfaces: SURFACES,
        eflMm: 47.54,
      },
    ]]);
    const out = enrichEntry(HOLLOW, [], {}, bundle);
    expect(out.glbUrl).toBe('blob:demo');
    expect(out.templateClass).toBe('fixed');
    expect(out.docs).toHaveLength(1);
    expect(out.fragmentSurfaces).toHaveLength(2);
  });

  it('never overrides facts the registry entry already has', () => {
    const full = { ...HOLLOW, eflMm: 50, fragmentSurfaces: SURFACES, glbUrl: 'http://real' };
    const bundle = new Map([[
      'user.cube.demo_lens_50',
      { ...HOLLOW, eflMm: 99, glbUrl: 'blob:fake' },
    ]]);
    const ic = { id: 'user.lens.demo_achromat_50', efl_mm: 99 } as unknown as IndexComponent;
    const out = enrichEntry(full, [ic], {}, bundle);
    expect(out.eflMm).toBe(50);
    expect(out.glbUrl).toBe('http://real');
    expect(out.fragmentSurfaces).toBe(SURFACES);
  });
});

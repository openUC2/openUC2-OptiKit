import { describe, expect, it } from 'vitest';
import { partOpticsFacts, portDirectionLabel, portRoleOf } from '../partOptics';
import type { LibraryPaletteEntry } from '../../document/libraryPalette';
import type { IndexComponent } from '../libraryIndex';

function makeEntry(over: Partial<LibraryPaletteEntry>): LibraryPaletteEntry {
  return {
    moduleId: 'openuc2.cube.lens_1x1',
    componentId: null,
    name: 'lens',
    description: '',
    category: 'lens',
    templateClass: 'fixed',
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
    review: false,
    source: 'registry',
    unbound: false,
    fragmentSurfaces: [],
    carrier: false,
    bays: {},
    ...over,
  };
}

function makeComponent(over: Partial<IndexComponent>): IndexComponent {
  return {
    id: 'thorlabs.lens.ac254-050-a',
    version: '0.1.0',
    kind: 'optical_component',
    category: 'lens',
    description: 'achromat',
    tags: [],
    vendor: { name: 'Thorlabs', mpn: 'AC254-050-A', url: '' },
    efl_mm: 50.18,
    n_surfaces: 3,
    review: false,
    ...over,
  } as IndexComponent;
}

const BICONVEX_FRAGMENT = [
  {
    type: 'standard',
    geometry: { type: 'StandardGeometry', radius: 50, conic: 0 },
    material_post: { type: 'Material', name: 'N-BK7' },
    thickness: 4,
    is_stop: true,
    semi_aperture: 12.7,
  },
  {
    type: 'standard',
    geometry: { type: 'StandardGeometry', radius: -50, conic: 0 },
    semi_aperture: 12.7,
  },
];

describe('partOpticsFacts (WP-89: one code path over the index)', () => {
  it('joins a cube module onto its index component for the fragment', () => {
    const entry = makeEntry({
      componentId: 'thorlabs.lens.ac254-050-a',
      eflMm: 50.18,
      fragmentSurfaces: [], // module-backed entries never carry the stack
    });
    const facts = partOpticsFacts('openuc2.cube.lens_1x1', entry, [
      makeComponent({ fragment_surfaces: BICONVEX_FRAGMENT }),
    ]);
    expect(facts.componentId).toBe('thorlabs.lens.ac254-050-a');
    expect(facts.eflMm).toBe(50.18);
    expect(facts.eflSource).toBe('record');
    expect(facts.surfaces).toHaveLength(2);
    expect(facts.surfaces[0].material).toBe('N-BK7');
    expect(facts.surfaces[1].thicknessMm).toBeNull(); // last surface carries none
    expect(facts.apertureMm).toBeCloseTo(25.4);
    expect(facts.elementCount).toBe(1);
    expect(facts.vendor).toEqual({ name: 'Thorlabs', mpn: 'AC254-050-A' });
  });

  it('an unbound primitive uses its own fragment and estimates EFL paraxially', () => {
    const entry = makeEntry({
      moduleId: 'user.lens.biconvex',
      componentId: 'user.lens.biconvex',
      unbound: true,
      fragmentSurfaces: BICONVEX_FRAGMENT,
    });
    const facts = partOpticsFacts('user.lens.biconvex', entry, []);
    expect(facts.surfaces).toHaveLength(2);
    expect(facts.eflSource).toBe('paraxial');
    expect(facts.eflMm).toBeGreaterThan(40);
    expect(facts.eflMm).toBeLessThan(60);
  });

  it('an unregistered ref falls back to treating the ref as a component id', () => {
    const facts = partOpticsFacts('thorlabs.lens.ac254-050-a', undefined, [
      makeComponent({ fragment_surfaces: BICONVEX_FRAGMENT }),
    ]);
    expect(facts.componentId).toBe('thorlabs.lens.ac254-050-a');
    expect(facts.surfaces).toHaveLength(2);
  });

  it('returns empty facts when nothing is known', () => {
    const facts = partOpticsFacts('mystery.part', undefined, []);
    expect(facts.surfaces).toHaveLength(0);
    expect(facts.eflMm).toBeNull();
    expect(facts.apertureMm).toBeNull();
    expect(facts.componentId).toBeNull();
  });

  it('flat/lossy radii read as ∞ (null)', () => {
    const facts = partOpticsFacts('mystery.part', undefined, [
      makeComponent({
        id: 'mystery.part',
        fragment_surfaces: [
          { geometry: { radius: 'inf' }, thickness: 3, material_post: { name: 'N-BK7' } },
          { geometry: { radius: null } },
        ] as Record<string, unknown>[],
      }),
    ]);
    expect(facts.surfaces[0].radiusMm).toBeNull();
    expect(facts.surfaces[1].radiusMm).toBeNull();
  });
});

describe('port legibility helpers (WP-89)', () => {
  it('derives the KiCad-pin role from the port name', () => {
    expect(portRoleOf('front')).toBe('entry');
    expect(portRoleOf('sensor')).toBe('entry');
    expect(portRoleOf('back')).toBe('exit');
    expect(portRoleOf('out')).toBe('exit');
    expect(portRoleOf('reflected')).toBe('reflected');
    expect(portRoleOf('transmitted')).toBe('transmitted');
  });

  it('labels axis literals and unit vectors', () => {
    expect(portDirectionLabel('-z')).toBe('-z');
    expect(portDirectionLabel([0.707, 0.707, 0])).toBe('(0.71, 0.71, 0)');
  });
});

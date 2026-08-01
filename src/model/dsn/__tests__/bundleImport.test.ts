/**
 * WP-98: a .dsn zip that carries its own `library/` half imports without
 * substitution — the exact community-template flow that used to produce
 * "unknown library ref … placed as <lookalike>".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The persisted stores need a storage BEFORE their modules are evaluated
// (zustand captures `localStorage` when the persist middleware is created).
const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { registerBundleLibrary, useBundleLibrary } = await import('../bundleImport');
const { exportDsnFiles, importDsnFiles } = await import('../session');
const { resetDocument } = await import('../../../document/documentStore');
const { entriesFromIndex, libraryEntryOf, listParts, registerLibraryModules } =
  await import('../../../document');
const { useAppStore } = await import('../../../stores/appStore');
const { useWorkspaceLibrary } = await import('../../workspaceLibrary');

import type { DsnFiles } from '../io';
import type { IndexModule } from '../../libraryIndex';

const COMPONENT_YML = `
kind: optical_component
id: user.lens.demo_achromat_50
version: 0.1.0
category: lens
description: demo singlet
effective_focal_length_mm: 50.0
optics:
  fragment:
    surfaces:
      - {type: standard, geometry: {type: StandardGeometry, radius: 25.8, conic: 0},
         material_post: {type: Material, name: N-BK7}, thickness: 5.0, semi_aperture: 12.5}
      - {type: standard, geometry: {type: StandardGeometry, radius: -25.8, conic: 0}, semi_aperture: 12.5}
  frames:
    optical: {z-mm: 0}
  ports:
    front: {frame: optical, direction: -z}
    back: {frame: optical, direction: +z, after-surface: 1}
`;

const TEMPLATE_YML = `
kind: mechanical_template
id: user.tpl.demo_lens_1x1
version: 0.1.0
class: fixed
description: demo cube
envelope: {x-mm: 50, y-mm: 50, z-mm: 50}
step: model.step
glb: model.glb
footprint_grid: [1, 1, 1]
`;

const MODULE_YML = `
kind: cube_module
id: user.cube.demo_lens_50
version: 0.1.0
description: demo lens in a cube
docs:
  - docs/demo-part.md
component: user.lens.demo_achromat_50@^0.1
template: user.tpl.demo_lens_1x1@^0.1
footprint_grid: [1, 1, 1]
`;

const DESIGN_YML = `
optikit-version: v0.0.0-alpha.1
design: {name: demo-relay, version: 0.1.0, description: two cubes}
components:
  src:
    type: primitive
    category: source
    primitive: {type: glb, model: openuc2.cube.laser}
    optics:
      frames: {optical: {z-mm: 0}}
      ports: {out: {frame: optical, direction: +z}}
    pose:
      rotation: {type: grid, grid: {z: +x, x: -z}}
      translation: {offset-grid: {x: 0}}
  L1:
    type: primitive
    category: lens
    primitive: {type: glb, model: user.cube.demo_lens_50}
    optics:
      frames: {optical: {z-mm: 0}}
      ports:
        front: {frame: optical, direction: -z}
        back: {frame: optical, direction: +z}
    pose:
      rotation: {type: grid, grid: {z: +x, x: -z}}
      translation: {offset-grid: {x: 2}}
paths:
  relay:
    chain: [src.out, 'L1.front>back']
`;

function bundle(): DsnFiles {
  return {
    'README.md': '# a community bundle',
    'library/components/user.lens.demo_achromat_50/component.yml': COMPONENT_YML,
    'library/templates/user.tpl.demo_lens_1x1/template.yml': TEMPLATE_YML,
    'library/templates/user.tpl.demo_lens_1x1/model.glb': new Uint8Array([103, 108, 84, 70]),
    'library/modules/user.cube.demo_lens_50/module.yml': MODULE_YML,
    'docs/demo-part.md': '# Demo part\nassembly notes',
    'designs/demo-relay.dsn/optikit-design.yml': DESIGN_YML,
  };
}

/** A curated laser so the design's second ref resolves from the registry. */
const LASER: IndexModule = {
  id: 'openuc2.cube.laser',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'laser',
  tags: [],
  category: 'source',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'c@^1', resolved: '1.0.0', vendor: null, efl_mm: null },
  template: { ref: 't@^1', id: 't', resolved: '1.0.0', class: 'fixed', actuatable: false, dof: [], states: [] },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [{ name: 'out', direction: '+z', position_mm: [0, 0, 0], after_surface: null }],
  electronics: null,
} as unknown as IndexModule;

beforeEach(() => {
  resetDocument();
  useAppStore.setState({ modules: [] });
  useWorkspaceLibrary.setState({ records: {}, thumbnails: {} });
  useBundleLibrary.getState().clear();
  registerLibraryModules(entriesFromIndex([LASER], 'http://x'));
});

describe('registerBundleLibrary (WP-98)', () => {
  it('registers the component into the workspace and the module into the session', () => {
    const result = registerBundleLibrary(bundle());
    expect(result.warnings).toEqual([]);
    expect(result.components).toBe(1);
    expect(result.modules).toBe(1);
    expect(useWorkspaceLibrary.getState().records['user.lens.demo_achromat_50']).toBeTruthy();
    const [entry] = useBundleLibrary.getState().entries;
    expect(entry.moduleId).toBe('user.cube.demo_lens_50');
    expect(entry.componentId).toBe('user.lens.demo_achromat_50');
    expect(entry.templateClass).toBe('fixed');
    expect(entry.category).toBe('lens');
    expect(entry.eflMm).toBe(50);
    expect(entry.fragmentSurfaces).toHaveLength(2);
    expect(entry.review).toBe(true);
  });

  it('resolves the record docs from the zip itself', () => {
    registerBundleLibrary(bundle());
    const [entry] = useBundleLibrary.getState().entries;
    expect(entry.docs).toHaveLength(1);
    expect(entry.docs![0].title).toBe('demo-part.md');
    expect(entry.docs![0].text).toContain('assembly notes');
  });

  it('never shadows an already-registered id', () => {
    const files = bundle();
    files['library/modules/openuc2.cube.laser/module.yml'] =
      MODULE_YML.replace('user.cube.demo_lens_50', 'openuc2.cube.laser');
    const result = registerBundleLibrary(files, {
      registeredIds: new Set(['openuc2.cube.laser']),
    });
    expect(result.modules).toBe(1); // only the demo lens
    expect(result.warnings.some(w => w.includes('already in the registry'))).toBe(true);
  });
});

describe('importDsnFiles with a bundle (WP-98)', () => {
  it('places the design against the bundle refs — no substitution', () => {
    const report = importDsnFiles(bundle());
    expect(report.placed).toBe(2);
    expect(report.libraryComponents).toBe(1);
    expect(report.libraryModules).toBe(1);
    expect(report.warnings.filter(w => w.includes('unknown library ref'))).toEqual([]);
    const refs = listParts().map(p => p.libraryRef).sort();
    expect(refs).toEqual(['openuc2.cube.laser', 'user.cube.demo_lens_50']);
    // The bundle module resolves like any palette entry now.
    expect(libraryEntryOf('user.cube.demo_lens_50')?.docs).toHaveLength(1);
  });

  it('re-exports as a self-contained bundle (records travel onward)', () => {
    importDsnFiles(bundle());
    const files = exportDsnFiles();
    expect(files['optikit-design.yml']).toBeTruthy();
    expect(files['library/modules/user.cube.demo_lens_50/module.yml']).toBeTruthy();
    expect(files['library/templates/user.tpl.demo_lens_1x1/template.yml']).toBeTruthy();
    expect(files['library/templates/user.tpl.demo_lens_1x1/model.glb']).toBeInstanceOf(Uint8Array);
    expect(files['library/components/user.lens.demo_achromat_50/component.yml']).toBeTruthy();
  });
});

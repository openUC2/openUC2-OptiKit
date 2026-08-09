/**
 * WP-103: the three states a part can be in, as a first-class fact.
 *
 * The user's own model: "some parts are already permanently mounted in an
 * openUC2 cube (T1); some are unmounted and can be placed freely". The
 * backend has always shipped that distinction as three index sections
 * (modules / housings / components). The frontend flattened it into
 * `templateClass: … | null` + `unbound: boolean`, where `null` meant three
 * different things — so a laser in its own laser body was indistinguishable
 * from a bare lens with no mechanics at all.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  entriesFromComponents,
  entriesFromIndex,
  entriesFromWorkspace,
  registerLibraryModules,
} from '../libraryPalette';
import { useAppStore } from '../../stores/appStore';
import { resetDocument } from '../documentStore';
import type { IndexComponent, IndexHousing, IndexModule } from '../../model/libraryIndex';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';

const MODULE = {
  id: 'openuc2.cube.mirror_45',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'flat mirror in a cube',
  tags: [],
  category: 'mirror',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'openuc2.mirror.flat_45@^1', resolved: '1.0.0', vendor: null, efl_mm: null },
  template: {
    ref: 'openuc2.tpl.mirror_mount_1x1@^0.1',
    id: 'openuc2.tpl.mirror_mount_1x1',
    resolved: '0.1.0',
    class: 'fixed',
    actuatable: false,
    dof: [],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [],
  electronics: null,
} as unknown as IndexModule;

const BARE: IndexComponent = {
  id: 'thorlabs.lens.ac254-050-a',
  version: '0.1.0',
  kind: 'optical_component',
  category: 'lens',
  description: 'an achromat nobody has housed yet',
  tags: [],
  vendor: { name: 'Thorlabs', mpn: 'AC254-050-A', url: '' },
  efl_mm: 50,
  n_surfaces: 3,
  review: false,
};

const HOUSED_COMPONENT: IndexComponent = {
  ...BARE,
  id: 'openuc2.source.laser_body',
  category: 'source',
  description: 'a laser in its own body',
  efl_mm: null,
};

const HOUSING = {
  id: 'openuc2.tpl.laser_body',
  version: '0.1.0',
  kind: 'mechanical_template',
  class: 'fixed',
  description: 'the laser housing — no cube',
  review: false,
  component: { ref: 'openuc2.source.laser_body@^0.1', resolved: '0.1.0',
               id: 'openuc2.source.laser_body' },
  dof: [],
  assets: { thumbnail: null, glb: '/v1/library/assets/templates/openuc2.tpl.laser_body/body.glb', step: null },
} as unknown as IndexHousing;

const DRAFT = {
  id: 'user.lens.my_draft',
  version: '0.1.0',
  category: 'lens',
  description: 'authored in this browser',
} as unknown as ComponentRecord;

beforeEach(() => {
  resetDocument();
  useAppStore.setState({ modules: [] });
});

describe('the mount discriminator', () => {
  it('a cube module is a cube, and names its template', () => {
    const [entry] = entriesFromIndex([MODULE], 'http://x');
    expect(entry.mount).toBe('cube');
    expect(entry.templateClass).toBe('fixed');
    expect(entry.templateId).toBe('openuc2.tpl.mirror_mount_1x1');
    expect(entry.unbound).toBe(false);
  });

  it('a component with no housing is BARE — it needs a holder', () => {
    const [entry] = entriesFromComponents([BARE], [], 'http://x');
    expect(entry.mount).toBe('bare');
    expect(entry.templateClass).toBeNull();
    expect(entry.templateId).toBeNull();
  });

  it('a component with a housing is HOUSED — it only needs a cube', () => {
    const [entry] = entriesFromComponents([HOUSED_COMPONENT], [], 'http://x', [HOUSING]);
    expect(entry.mount).toBe('housed');
    // The housing's own class travels now; it used to be hardcoded null even
    // though the mesh and DOFs beside it were already being joined.
    expect(entry.templateClass).toBe('fixed');
    expect(entry.templateId).toBe('openuc2.tpl.laser_body');
    expect(entry.glbUrl).toContain('body.glb');
  });

  it('a workspace draft is bare — optics authored, no mechanics yet', () => {
    const [entry] = entriesFromWorkspace({ [DRAFT.id]: DRAFT }, {});
    expect(entry.mount).toBe('bare');
  });

  // WP-127: "save to browser" used to store the component alone, so a draft
  // the user had just bound to a cube came back as a bare primitive.
  const DRAFT_BINDING = {
    template: {
      kind: 'mechanical_template',
      id: 'user.tpl.draft_mirror',
      class: 'fixed',
      footprint_grid: [1, 1, 1],
      'mesh-frame': 'cube',
      'insert-pose': { rotation: { type: 'grid', grid: { z: '-x', x: '+z' } } },
      frames: { optical: { 'x-mm': 0, 'y-mm': 0, 'z-mm': 0 } },
      optical_ports: {
        front: { frame: 'optical', direction: '+x' },
        reflected: { frame: 'optical', direction: '-z', 'after-surface': 0 },
      },
    },
    module: { kind: 'cube_module', id: 'user.cube.draft_mirror' },
  };

  it('a BOUND draft is a cube — class, footprint, mesh frame and as-mounted pins', () => {
    const [entry] = entriesFromWorkspace(
      { [DRAFT.id]: DRAFT },
      {},
      { [DRAFT.id]: DRAFT_BINDING },
      { [DRAFT.id]: 'blob:mesh' },
    );
    expect(entry.mount).toBe('cube');
    expect(entry.unbound).toBe(false);
    expect(entry.templateClass).toBe('fixed');
    expect(entry.templateId).toBe('user.tpl.draft_mirror');
    expect(entry.glbUrl).toBe('blob:mesh');
    expect(entry.meshFrame).toBe('cube');
    // The pins the CUBE presents (WP-122), not the record's own ±z ports —
    // so placement yaws instead of tipping (WP-124).
    expect(entry.portsFrame).toBe('mounted');
    expect(entry.ports.map(p => `${p.name}:${p.direction}`).sort()).toEqual([
      'front:+x',
      'reflected:-z',
    ]);
  });

  it('a binding with no footprint (a housing) stays out of the cube state', () => {
    const [entry] = entriesFromWorkspace(
      { [DRAFT.id]: DRAFT },
      {},
      {
        [DRAFT.id]: {
          ...DRAFT_BINDING,
          template: { ...DRAFT_BINDING.template, footprint_grid: null },
        },
      },
    );
    expect(entry.mount).toBe('bare');
    expect(entry.unbound).toBe(true);
  });

  it('all three still agree with the legacy `unbound` flag (not in a cube)', () => {
    const cube = entriesFromIndex([MODULE], 'http://x')[0];
    const bare = entriesFromComponents([BARE], [], 'http://x')[0];
    const housed = entriesFromComponents([HOUSED_COMPONENT], [], 'http://x', [HOUSING])[0];
    for (const e of [cube, bare, housed]) {
      expect(e.unbound).toBe(e.mount !== 'cube');
    }
  });

  it('the palette groups the three apart, in words', () => {
    registerLibraryModules([
      ...entriesFromIndex([MODULE], 'http://x'),
      ...entriesFromComponents([BARE], [], 'http://x'),
      ...entriesFromComponents([HOUSED_COMPONENT], [], 'http://x', [HOUSING]),
    ]);
    const groups = Object.fromEntries(
      useAppStore.getState().modules.map(m => [m.id, m.group]),
    );
    expect(groups['openuc2.cube.mirror_45']).toBe('mirror · openuc2');
    expect(groups['thorlabs.lens.ac254-050-a']).toBe('lens · needs a holder');
    expect(groups['openuc2.source.laser_body']).toBe('source · housed, no cube');
  });
});

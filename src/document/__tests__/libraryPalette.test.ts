/**
 * WP-34: library palette — index → palette entries, default placement
 * rotation from record ports, and the T-class movement contract (T1 locked,
 * T2 clamped to its DOF axis).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  defaultRotationFor,
  entriesFromComponents,
  entriesFromIndex,
  registerLibraryModules,
  templateClassOf,
  type LibraryPaletteEntry,
} from '../libraryPalette';
import { rot24Matrix } from '../rot24';
import { addPart, getPart, movePartWorld } from '../OptikitDocument';
import { buildServiceDesign, listPartMechanics } from '../../model/dsn/serviceExport';
import { useAppStore } from '../../stores/appStore';
import { resetDocument } from '../documentStore';
import type { IndexComponent, IndexModule } from '../../model/libraryIndex';
import type { SourcePort } from '../sourceDesignStore';

const P = (
  name: string,
  direction: string,
  positionMm: [number, number, number] = [0, 0, 0],
): SourcePort => ({ name, direction, positionMm, afterSurface: null });

const applyRot = (rot: ReturnType<typeof defaultRotationFor>, v: [number, number, number]) => {
  const out = new THREE.Vector3(...v).applyMatrix4(rot24Matrix(rot!));
  return [Math.round(out.x), Math.round(out.y), Math.round(out.z)];
};

describe('defaultRotationFor (record ±z optics → document plane)', () => {
  it('points a through lens along +x', () => {
    const rot = defaultRotationFor([P('front', '-z'), P('back', '+z')]);
    expect(rot).not.toBeNull();
    // Entry beam travels local +z (into 'front' facing -z) → world +x.
    expect(applyRot(rot, [0, 0, 1])).toEqual([1, 0, 0]);
  });

  it('maps the flat_45 fold arm onto -y (the WP-29 convention)', () => {
    const rot = defaultRotationFor([P('front', '-z'), P('reflected', '+x')]);
    expect(applyRot(rot, [0, 0, 1])).toEqual([1, 0, 0]); // beam → +x
    expect(applyRot(rot, [1, 0, 0])).toEqual([0, -1, 0]); // fold arm → -y
  });

  it('leaves in-plane records alone', () => {
    expect(defaultRotationFor([P('front', '-x'), P('back', '+x')])).toBeNull();
  });
});

const MIRROR_MODULE: IndexModule = {
  id: 'openuc2.cube.mirror_45',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'flat mirror',
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
    states: ['XY', 'YZ'],
  },
  assets: { thumbnail: null, glb: '/v1/library/assets/templates/t/model.glb', step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'reflected', direction: '+x', position_mm: [0, 0, 0], after_surface: 0 },
  ],
  electronics: null,
};

const LENS_Z_MODULE: IndexModule = {
  ...MIRROR_MODULE,
  id: 'openuc2.cube.lens_z',
  category: 'lens',
  component: { ref: 'x@^1', resolved: '1.0.0', vendor: null, efl_mm: 50 },
  template: {
    ref: 'openuc2.tpl.lens_insert_25mm@^1',
    id: 'openuc2.tpl.lens_insert_25mm',
    resolved: '1.0.0',
    class: 'adaptive',
    actuatable: true,
    dof: [
      { name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-7.5, 7.5], actuatable: true },
    ],
    states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
};

describe('entriesFromIndex', () => {
  it('carries class, states, dofs, ports, and resolves asset URLs', () => {
    const [mirror, lens] = entriesFromIndex(
      [MIRROR_MODULE, LENS_Z_MODULE],
      'http://localhost:8010',
    );
    expect(mirror.templateClass).toBe('fixed');
    expect(mirror.states).toEqual(['XY', 'YZ']);
    expect(mirror.glbUrl).toBe('http://localhost:8010/v1/library/assets/templates/t/model.glb');
    expect(mirror.ports.map(p => p.direction)).toEqual(['-z', '+x']);
    expect(lens.templateClass).toBe('adaptive');
    expect(lens.dofs).toMatchObject([
      { name: 'dz', kind: 'translation', axis: 'z', unit: 'mm', range: [-7.5, 7.5] },
    ]);
    expect(lens.eflMm).toBe(50);
    expect(lens.ports[1].positionMm).toEqual([0, 0, 5]);
  });

  it('resolves a MOUNTED module\'s assets against its repo, not the core service (WP-58)', () => {
    const mounted: IndexModule = {
      ...MIRROR_MODULE,
      id: 'user.cube.demo_lens_50',
      repo: 'someone/optikit-community-template',
      repoRef: 'main',
    };
    const [entry] = entriesFromIndex([mounted], 'http://localhost:8010');
    expect(entry.glbUrl).toBe(
      'https://raw.githubusercontent.com/someone/optikit-community-template/main/library/templates/t/model.glb',
    );
    // Absolute URLs keep working untouched.
    const absolute: IndexModule = {
      ...mounted,
      assets: { thumbnail: null, glb: 'https://cdn.example.org/m.glb', step: null },
    };
    expect(entriesFromIndex([absolute], 'http://localhost:8010')[0].glbUrl).toBe(
      'https://cdn.example.org/m.glb',
    );
  });
});

// WP-60: the zmx-imported achromat — a published symbol NO module binds.
const AC254: IndexComponent = {
  id: 'thorlabs.lens.ac254-050-a',
  version: '0.1.0',
  kind: 'optical_component',
  category: 'lens',
  description: 'AC254-050-A positive achromat',
  tags: ['imported', 'zmx'],
  vendor: { name: 'Thorlabs', mpn: 'AC254-050-A', url: '' },
  efl_mm: 50.169,
  n_surfaces: 3,
  review: true,
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 11.5], after_surface: 2 },
  ],
  wavelengths_um: [],
  symbol: null,
  // The real 3-surface prescription (doublet) — what the placement exports.
  fragment_surfaces: [
    {
      type: 'standard',
      geometry: { type: 'StandardGeometry', radius: 33.34, conic: 0 },
      material_post: { type: 'Material', name: 'N-BAF10' },
      thickness: 9,
      semi_aperture: 12.7,
      is_stop: true,
    },
    {
      type: 'standard',
      geometry: { type: 'StandardGeometry', radius: -22.28, conic: 0 },
      material_post: { type: 'Material', name: 'N-SF10' },
      thickness: 2.5,
      semi_aperture: 12.7,
    },
    {
      type: 'standard',
      geometry: { type: 'StandardGeometry', radius: -291.07, conic: 0 },
      semi_aperture: 12.7,
    },
  ],
};

// Bound by MIRROR_MODULE (component.ref openuc2.mirror.flat_45@^1) — must
// keep coming through its module, never twice.
const BOUND_COMPONENT: IndexComponent = {
  ...AC254,
  id: 'openuc2.mirror.flat_45',
  category: 'mirror',
  ports: [],
};

describe('entriesFromComponents (WP-60: unbound symbols become placeable)', () => {
  it('offers only components no module binds; bound ones register hidden (WP-76)', () => {
    const entries = entriesFromComponents(
      [BOUND_COMPONENT, AC254],
      [MIRROR_MODULE],
      'http://localhost:8010',
    );
    // Both register (the WP-76 unbind verb needs the bound one resolvable),
    // but only the module-less component is offered in the palette.
    expect(entries.map(e => e.moduleId)).toEqual([
      'openuc2.mirror.flat_45',
      'thorlabs.lens.ac254-050-a',
    ]);
    expect(entries[0].paletteHidden).toBe(true);
    const lens = entries[1];
    expect(lens.paletteHidden).toBe(false);
    expect(lens.unbound).toBe(true);
    expect(lens.templateClass).toBeNull();
    expect(lens.glbUrl).toBeNull();
    expect(lens.dofs).toEqual([]);
    expect(lens.componentId).toBe('thorlabs.lens.ac254-050-a');
    expect(lens.ports.map(p => p.direction)).toEqual(['-z', '+z']);
    expect(lens.ports[1].positionMm).toEqual([0, 0, 11.5]);
    expect(lens.eflMm).toBeCloseTo(50.169, 3);
  });

  it('groups them apart as "<category> · unbound"', () => {
    resetDocument();
  useAppStore.setState({ modules: [] });
    registerLibraryModules(entriesFromComponents([AC254], [], 'http://x'));
    const def = useAppStore.getState().modules.find(m => m.id === AC254.id);
    expect(def?.group).toBe('lens · unbound');
  });

  it('joins a HOUSING onto its component: the mesh and DOFs travel (WP-67)', () => {
    const entries = entriesFromComponents(
      [AC254],
      [],
      'http://localhost:8010',
      [{
        id: 'thorlabs.tpl.km05_housing',
        version: '0.1.0',
        kind: 'mechanical_template',
        class: 'adaptive',
        description: 'kinematic mount housing',
        review: false,
        component: { ref: 'thorlabs.lens.ac254-050-a@^0.1', resolved: '0.1.0',
                     id: 'thorlabs.lens.ac254-050-a' },
        dof: [{ name: 'tip', kind: 'rotation', axis: 'x', unit: 'deg',
                range: [-4, 4], actuatable: false }],
        assets: {
          thumbnail: null,
          glb: '/v1/library/assets/templates/thorlabs.tpl.km05_housing/mount.glb',
          step: null,
        },
      }],
    );
    const lens = entries[0];
    // Still cube-less (free placement, no grid claim) — but the housing's
    // mesh and DOFs ride along instead of the hardcoded nulls.
    expect(lens.unbound).toBe(true);
    expect(lens.templateClass).toBeNull();
    expect(lens.glbUrl).toBe(
      'http://localhost:8010/v1/library/assets/templates/thorlabs.tpl.km05_housing/mount.glb',
    );
    expect(lens.dofs.map(d => d.name)).toEqual(['tip']);
    expect(lens.dofs[0].range).toEqual([-4, 4]);
  });
});

describe('unbound placement (WP-60 pin: continuous mm, no cell claim)', () => {
  beforeEach(() => {
    resetDocument();
  useAppStore.setState({ modules: [] });
    registerLibraryModules(
      entriesFromComponents([AC254], [], 'http://localhost:8010'),
    );
  });

  it('moves in continuous mm — the template-less residual is unclamped', () => {
    const id = addPart(AC254.id, [0, 0, 0])!;
    movePartWorld(id, [130.4, 20.2, 3.3]);
    const part = getPart(id)!;
    expect(part.worldPose.positionMm[0]).toBeCloseTo(130.4, 5);
    expect(part.worldPose.positionMm[1]).toBeCloseTo(20.2, 5);
    expect(part.worldPose.positionMm[2]).toBeCloseTo(3.3, 5);
  });

  it('exports with NO template block — the state cubify/DRC skips', () => {
    const id = addPart(AC254.id, [0, 0, 0])!;
    const mech = listPartMechanics().find(m => m.partId === id);
    expect(mech).toBeDefined();
    expect(mech!.templateClass).toBeNull();
    expect(mech!.translationDofs).toEqual([]);
  });

  it('exports the REAL prescription, not the thin-lens approximation', () => {
    const id = addPart(AC254.id, [0, 0, 0])!;
    const { design, keyByPartId } = buildServiceDesign();
    const comp = design.components?.[keyByPartId[id]] as {
      optics?: { fragment?: { surfaces: Record<string, unknown>[] } };
    };
    const surfaces = comp.optics?.fragment?.surfaces ?? [];
    expect(surfaces).toHaveLength(3);
    expect((surfaces[0].geometry as { radius: number }).radius).toBeCloseTo(33.34);
    expect((surfaces[0].material_post as { name: string }).name).toBe('N-BAF10');
    // The exit port keeps the record's own after-surface.
    const ports = (comp.optics as { ports?: Record<string, { 'after-surface'?: number }> })
      ?.ports;
    expect(ports?.back['after-surface']).toBe(2);
  });
});

describe('T-class movement contract (through the document facade)', () => {
  let entries: LibraryPaletteEntry[];

  beforeEach(() => {
    entries = entriesFromIndex([MIRROR_MODULE, LENS_Z_MODULE], 'http://localhost:8010');
    resetDocument();
  useAppStore.setState({ modules: [] });
    registerLibraryModules(entries);
  });

  it('registers palette modules and exposes the class', () => {
    expect(useAppStore.getState().modules.map(m => m.id)).toContain('openuc2.cube.mirror_45');
    expect(templateClassOf('openuc2.cube.mirror_45')).toBe('fixed');
    expect(templateClassOf('openuc2.cube.lens_z')).toBe('adaptive');
    expect(templateClassOf('nonexistent')).toBeNull();
  });

  it('T1: intra-cube nudges snap back to the record pose (δ = 0)', () => {
    const id = addPart('openuc2.cube.mirror_45', [0, 0, 0])!;
    expect(id).toBeTruthy();
    movePartWorld(id, [130, 20, 0]);
    const part = getPart(id)!;
    expect(part.gridPose.offsetMm).toEqual([0, 0, 0]);
    expect(part.worldPose.positionMm[0] % 50).toBe(0); // on a cell center
  });

  it('T2: the residual is clamped onto the declared DOF axis and range', () => {
    const id = addPart('openuc2.cube.lens_z', [0, 0, 0])!;
    // Placement rotated local z (the DOF axis) onto world +x; try a diagonal
    // 20 mm nudge — only the axial component survives, clamped to ±7.5.
    movePartWorld(id, [20, 13, 0]);
    const part = getPart(id)!;
    expect(part.gridPose.offsetMm[0]).toBeCloseTo(7.5, 5);
    expect(part.gridPose.offsetMm[1]).toBeCloseTo(0, 5);
    expect(part.gridPose.offsetMm[2]).toBeCloseTo(0, 5);
  });

  it('placement applies the record-derived grid rotation', () => {
    const id = addPart('openuc2.cube.mirror_45', [0, 0, 0])!;
    const part = getPart(id)!;
    // Local +z (optical axis) must land on world +x.
    const q = part.worldPose.rotation;
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    );
    expect(v.x).toBeCloseTo(1, 5);
  });
});

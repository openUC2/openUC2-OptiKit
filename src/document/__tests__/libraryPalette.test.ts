/**
 * WP-34: library palette — index → palette entries, default placement
 * rotation from record ports, and the T-class movement contract (T1 locked,
 * T2 clamped to its DOF axis).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  defaultRotationFor,
  entriesFromIndex,
  registerLibraryModules,
  templateClassOf,
  type LibraryPaletteEntry,
} from '../libraryPalette';
import { rot24Matrix } from '../rot24';
import { addPart, getPart, movePartWorld } from '../OptikitDocument';
import { useAppStore } from '../../stores/appStore';
import type { IndexModule } from '../../model/libraryIndex';
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
});

describe('T-class movement contract (through the document facade)', () => {
  let entries: LibraryPaletteEntry[];

  beforeEach(() => {
    entries = entriesFromIndex([MIRROR_MODULE, LENS_Z_MODULE], 'http://localhost:8010');
    useAppStore.setState({ placedModules: [], modules: [] });
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

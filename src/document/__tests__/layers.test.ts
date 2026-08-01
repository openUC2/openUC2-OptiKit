/**
 * WP-65: layer derivation/classification, the layerAppearance precedence
 * rules, and persistence of the layer-visibility store.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../stores/appStore';
import { resetDocument } from '../documentStore';
import {
  entriesFromIndex,
  groupEntriesFromIndex,
  interfaceKindOf,
  registerLibraryGroups,
  registerLibraryModules,
} from '../libraryPalette';
import { addGroup, addPart, getPart, listParts } from '../OptikitDocument';
import { classifyPart, layerOf, layerRangeOf } from '../layers';
import type { IndexGroup, IndexModule } from '../../model/libraryIndex';

// The persisted store needs a storage BEFORE its module is evaluated (zustand
// captures `localStorage` when the persist middleware is created).
const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});
const { layerAppearance, useLayerStore } = await import('../layerStore');

// ── fixture registry (mirrors the miniframe shape: 2 layers + structure) ─────

const baseModule = (id: string): IndexModule => ({
  id,
  version: '0.1.0',
  kind: 'cube_module',
  description: 'x',
  tags: [],
  category: 'other',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'x@^0.1', resolved: '0.1.0', vendor: null, efl_mm: null },
  template: {
    ref: 't@^0.1', id: 't', resolved: '0.1.0', class: 'fixed',
    actuatable: false, dof: [], states: [],
  },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [],
  electronics: null,
});

const CUBE = baseModule('openuc2.cube.cube_1x1');
const PLATE = baseModule('openuc2.cube.plate_3x3');
const PUZZLE = baseModule('openuc2.cube.puzzle_1x1');

const TOWER_GROUP: IndexGroup = {
  id: 'user.group.tower',
  version: '0.1.0',
  kind: 'cube_group',
  description: 'two stacked cubes with plates and one joint',
  tags: [],
  review: false,
  envelope_grid: [1, 1, 2],
  members: [
    { key: 'a', module: CUBE.id, cell: [0, 0, 0], rot90: 0, overhang: false },
    { key: 'b', module: CUBE.id, cell: [0, 0, 1], rot90: 0, overhang: false },
  ],
  structure: {
    plates: {
      bottom: { module: PLATE.id, origin: [0, 0], size: [1, 1] },
      top: { module: PLATE.id, origin: [0, 0], size: [1, 1] },
    },
    joints: '',
    joint_cells: [[0, 0, 0]],
    joint_module: PUZZLE.id,
  },
  interface: {},
};

beforeEach(() => {
  resetDocument();
  useAppStore.setState({ modules: [] });
  registerLibraryModules(entriesFromIndex([CUBE, PLATE, PUZZLE], 'http://x'));
  registerLibraryGroups(groupEntriesFromIndex([TOWER_GROUP]));
});

// ── derivation & classification ──────────────────────────────────────────────

describe('layerOf / classifyPart', () => {
  it('derives the layer from the grid cell z (55 mm pitch)', () => {
    const id = addPart(CUBE.id, [0, 0, 110])!;
    expect(layerOf(getPart(id)!)).toBe(2);
    expect(classifyPart(getPart(id)!)).toEqual({ layer: 2, interface: false });
  });

  it('plates/joints from a placed group land as {layer, interface: true}', () => {
    addGroup('user.group.tower', [0, 0, 0]);
    const parts = listParts();
    const range = layerRangeOf(parts);
    // Cube layers only — plates at cell z −1/2 are between-layer structure.
    expect(range).toEqual({ min: 0, max: 1 });

    const joint = parts.find(p => p.libraryRef === PUZZLE.id)!;
    // The joint sits in the 5 mm gap above L0 (cell z = 0) — it belongs to
    // the interface ABOVE its layer, i.e. WITH layer 1.
    expect(layerOf(joint)).toBe(0);
    expect(classifyPart(joint, range)).toEqual({ layer: 1, interface: true });

    const plates = parts.filter(p => p.libraryRef === PLATE.id);
    const layers = plates.map(p => classifyPart(p, range).layer).sort();
    // Bottom plate (cell z −1) → L0; top plate (cell z 2) clamps to the
    // topmost cube layer L1.
    expect(layers).toEqual([0, 1]);
    for (const p of plates) expect(classifyPart(p, range).interface).toBe(true);
    expect(interfaceKindOf(PLATE.id)).toBe('plate');
  });
});

// ── appearance precedence ────────────────────────────────────────────────────

const state = (over: Partial<Parameters<typeof layerAppearance>[2]> = {}) => ({
  overrides: {},
  soloLayer: null,
  showInterface: true,
  activeLayer: 0,
  ...over,
});

describe('layerAppearance', () => {
  it('defaults to visible', () => {
    expect(layerAppearance(3, false, state())).toBe('visible');
  });

  it('applies per-layer overrides: hidden and dimmed', () => {
    const s = state({
      overrides: {
        1: { visible: false, dimmed: false },
        2: { visible: true, dimmed: true },
      },
    });
    expect(layerAppearance(1, false, s)).toBe('hidden');
    expect(layerAppearance(2, false, s)).toBe('dimmed');
  });

  it('solo wins over hidden and dimmed overrides', () => {
    const s = state({
      soloLayer: 1,
      overrides: {
        1: { visible: false, dimmed: false }, // soloed layer stays visible
        2: { visible: true, dimmed: true },
      },
    });
    expect(layerAppearance(1, false, s)).toBe('visible');
    expect(layerAppearance(2, false, s)).toBe('hidden'); // dimmed → hidden under solo
    expect(layerAppearance(3, false, s)).toBe('hidden');
  });

  it('the active working-plane layer is always visible (placement guard)', () => {
    const s = state({
      activeLayer: 1,
      overrides: { 1: { visible: false, dimmed: false } },
    });
    expect(layerAppearance(1, false, s)).toBe('visible');
    // ... even when another layer is soloed.
    expect(layerAppearance(1, false, state({ activeLayer: 1, soloLayer: 0 }))).toBe('visible');
  });

  it('interface parts follow their layer AND the plates & joints sub-toggle', () => {
    // Sub-toggle off hides interface parts everywhere — even solo/active.
    const off = state({ showInterface: false, soloLayer: 1, activeLayer: 0 });
    expect(layerAppearance(1, true, off)).toBe('hidden');
    expect(layerAppearance(0, true, off)).toBe('hidden');
    // Sub-toggle on: they track their classified layer like any part.
    const on = state({ soloLayer: 1, activeLayer: 1 });
    expect(layerAppearance(1, true, on)).toBe('visible');
    expect(layerAppearance(0, true, on)).toBe('hidden');
  });
});

// ── store behavior & persistence ─────────────────────────────────────────────

describe('useLayerStore', () => {
  beforeEach(() => {
    useLayerStore.setState({
      overrides: {},
      soloLayer: null,
      showInterface: true,
      activeLayer: 0,
    });
  });

  it('cycleLayer walks visible → dimmed → hidden → visible', () => {
    const s = () => useLayerStore.getState();
    s().cycleLayer(1);
    expect(s().overrides[1]).toEqual({ visible: true, dimmed: true });
    s().cycleLayer(1);
    expect(s().overrides[1]).toEqual({ visible: false, dimmed: false });
    s().cycleLayer(1);
    expect(s().overrides[1]).toEqual({ visible: true, dimmed: false });
  });

  it('toggleSolo solos the active layer', () => {
    useLayerStore.getState().setActiveLayer(1);
    useLayerStore.getState().toggleSolo();
    expect(useLayerStore.getState().soloLayer).toBe(1);
    useLayerStore.getState().toggleSolo();
    expect(useLayerStore.getState().soloLayer).toBeNull();
  });

  it('persists overrides/solo/sub-toggle and rehydrates them', async () => {
    const s = useLayerStore.getState();
    s.setVisible(1, false);
    s.setDimmed(2, true);
    s.setShowInterface(false);

    const raw = memStore.get('optikit-layer-visibility');
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw!).state;
    expect(persisted.overrides['1'].visible).toBe(false);
    expect(persisted.showInterface).toBe(false);
    // The working plane is per-session, deliberately not persisted.
    expect(persisted.activeLayer).toBeUndefined();

    // Wipe the live state (which also re-persists the wiped state), restore
    // the stored snapshot — as a fresh page load would find it — and rehydrate.
    useLayerStore.setState({ overrides: {}, showInterface: true, soloLayer: null });
    memStore.set('optikit-layer-visibility', raw!);
    await useLayerStore.persist.rehydrate();
    const rehydrated = useLayerStore.getState();
    expect(rehydrated.overrides[1]).toEqual({ visible: false, dimmed: false });
    expect(rehydrated.overrides[2]).toEqual({ visible: true, dimmed: true });
    expect(rehydrated.showInterface).toBe(false);
  });
});

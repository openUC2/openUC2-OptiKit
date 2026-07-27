/**
 * WP-64: interfaceKindOf — structural interface-zone parts (sandwich plates,
 * puzzle joints, baseplates) derived from the library ref, so the scenes can
 * draw them as distinct flat glyphs instead of generic blobs.
 */

import { describe, expect, it } from 'vitest';
import {
  interfaceKindOf,
  registerLibraryModules,
  type LibraryPaletteEntry,
} from '../libraryPalette';

const entry = (overrides: Partial<LibraryPaletteEntry>): LibraryPaletteEntry => ({
  moduleId: 'openuc2.cube.test',
  componentId: null,
  name: 'test',
  description: '',
  category: 'other',
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
  ...overrides,
});

describe('interfaceKindOf (WP-64)', () => {
  it('recognizes sandwich plates by id', () => {
    expect(interfaceKindOf('openuc2.cube.plate_3x3')).toBe('plate');
    expect(interfaceKindOf('openuc2.cube.plate_3x5')).toBe('plate');
    expect(interfaceKindOf('openuc2.mechanics.plate_3x4')).toBe('plate');
  });

  it('recognizes puzzle joints by id', () => {
    expect(interfaceKindOf('openuc2.cube.puzzle_1x1')).toBe('puzzle');
    expect(interfaceKindOf('openuc2.cube.uc2_puzzle')).toBe('puzzle');
  });

  it('recognizes baseplates by id (before the plain plate pattern)', () => {
    expect(interfaceKindOf('openuc2.cube.baseplate_4x4')).toBe('baseplate');
    expect(interfaceKindOf('openuc2.cube.baseplate_cubes_6x5')).toBe('baseplate');
  });

  it('does not mistake optical parts or wellplates for interface parts', () => {
    expect(interfaceKindOf('openuc2.cube.mirror_45')).toBeNull();
    expect(interfaceKindOf('openuc2.cube.tube_lens_1x1')).toBeNull();
    // 'wellplate' contains "plate" but not behind a separator — not a plate.
    expect(interfaceKindOf('openuc2.cube.frame_wellplate_insert_wellplate')).toBeNull();
    expect(interfaceKindOf('openuc2.sample.frame_wellplate_insert_4slides')).toBeNull();
  });

  it('falls back to the template carrier flag for registered carriers', () => {
    // Unregistered: nothing to go by → null.
    expect(interfaceKindOf('openuc2.cube.frame')).toBeNull();
    registerLibraryModules([
      entry({ moduleId: 'openuc2.cube.frame', carrier: true }),
      entry({ moduleId: 'openuc2.cube.mirror_45', category: 'mirror' }),
    ]);
    expect(interfaceKindOf('openuc2.cube.frame')).toBe('baseplate');
    // A registered non-carrier stays unclassified.
    expect(interfaceKindOf('openuc2.cube.mirror_45')).toBeNull();
  });
});

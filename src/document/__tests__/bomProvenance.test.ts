/**
 * WP-108: "draft" was one boolean with four producers and four meanings,
 * rendered with one label — which is how a curated, priced, shipping €650
 * laser came to be badged a draft in the BOM, and how people learned to
 * ignore the badge entirely.
 *
 * Two independent questions now: WHERE did this part come from, and is
 * anything about it still unconfirmed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { buildDocBom } = await import('../bom');
const { entriesFromIndex, registerLibraryModules } = await import('../libraryPalette');
const { addPart } = await import('../OptikitDocument');
const { resetDocument } = await import('../documentStore');
const { listParts } = await import('../OptikitDocument');
const { useAppStore } = await import('../../stores/appStore');

import type { IndexModule } from '../../model/libraryIndex';

/** The real shape of the problem: curated, priced, and carrying a WP-43 note. */
const LASER = {
  id: 'openuc2.cube.laser_488nm',
  version: '0.1.0',
  kind: 'cube_module',
  description: '488 nm laser in a cube',
  tags: [],
  category: 'source',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  price: 650,
  review: true,
  review_notes: ['module: auto-migrated from the legacy CSV palette (WP-43) — confirm the record'],
  component: { ref: 'c@^1', resolved: '1.0.0', vendor: null, efl_mm: null },
  template: { ref: 't@^1', id: 't', resolved: '1.0.0', class: 'fixed',
              actuatable: false, dof: [], states: [] },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [{ name: 'out', direction: '+z', position_mm: [0, 0, 0], after_surface: null }],
  electronics: null,
} as unknown as IndexModule;

const CAMERA = {
  ...LASER,
  id: 'openuc2.cube.camera_basic',
  description: 'starter camera',
  category: 'detector',
  price: null,
  review: false,
  review_notes: [],
} as unknown as IndexModule;

beforeEach(() => {
  resetDocument();
  useAppStore.setState({ modules: [] });
  registerLibraryModules(entriesFromIndex([LASER, CAMERA], 'http://x'));
});

describe('BOM provenance vs review (WP-108)', () => {
  it('a curated part is NOT a draft, however many review notes it carries', () => {
    addPart(LASER.id, [0, 0, 0]);
    const [line] = buildDocBom(listParts()).lines;
    // It came from the shared library — that is the fact the badge conflated.
    expect(line.provenance).toBe('registry');
    // …and it IS priced, which a "draft" badge sat next to nonsensically.
    expect(line.unitPriceEur).toBe(650);
    // The review flag stays true, because the note is real…
    expect(line.review).toBe(true);
    // …and now says what it is, so it can be acted on.
    expect(line.reviewNotes[0]).toContain('auto-migrated from the legacy CSV palette');
  });

  it('a curated part with no notes carries neither mark', () => {
    addPart(CAMERA.id, [0, 0, 0]);
    const [line] = buildDocBom(listParts()).lines;
    expect(line.provenance).toBe('registry');
    expect(line.review).toBe(false);
    expect(line.reviewNotes).toEqual([]);
  });

  it('unpriced lines are counted, not silently totalled as zero', () => {
    addPart(LASER.id, [0, 0, 0]);
    addPart(CAMERA.id, [50, 0, 0]);
    const bom = buildDocBom(listParts());
    expect(bom.pricedTotalEur).toBe(650);
    expect(bom.unpricedLines).toBe(1);
  });
});

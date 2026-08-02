/**
 * WP-105: nothing replaces a design that has work in it without asking, and
 * the netlist goes when the parts go.
 *
 * Seven doors led to "your design is gone" and only two asked first — the
 * worst two being `?layout=` and `?data=`, handled in the router root, which
 * fire on page load on ANY route.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { confirmReplaceDocument, openPartCount } = await import('../replaceGuard');
const { addPart, setPath } = await import('../OptikitDocument');
const { makePortRef } = await import('../types');
const { entriesFromIndex, registerLibraryModules } = await import('../libraryPalette');
const { resetDocument } = await import('../documentStore');
const { usePathsStore } = await import('../pathsStore');
const { useFibersStore } = await import('../fibersStore');
const { useAppStore } = await import('../../stores/appStore');

import type { IndexModule } from '../../model/libraryIndex';

const LENS = {
  id: 'openuc2.cube.lens_1x1',
  version: '0.1.0',
  kind: 'cube_module',
  description: 'lens',
  tags: [],
  category: 'lens',
  thumbnail: null,
  footprint_grid: [1, 1, 1],
  review: false,
  component: { ref: 'c@^1', resolved: '1.0.0', vendor: null, efl_mm: 50 },
  template: { ref: 't@^1', id: 't', resolved: '1.0.0', class: 'fixed',
              actuatable: false, dof: [], states: [] },
  assets: { thumbnail: null, glb: null, step: null },
  ports: [
    { name: 'front', direction: '-z', position_mm: [0, 0, 0], after_surface: null },
    { name: 'back', direction: '+z', position_mm: [0, 0, 5], after_surface: 1 },
  ],
  electronics: null,
} as unknown as IndexModule;

beforeEach(() => {
  resetDocument();
  usePathsStore.getState().clear();
  useFibersStore.getState().clear();
  useAppStore.setState({ modules: [] });
  registerLibraryModules(entriesFromIndex([LENS], 'http://x'));
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memStore.set(k, v),
    removeItem: (k: string) => void memStore.delete(k),
  });
});

describe('confirmReplaceDocument (WP-105)', () => {
  it('an EMPTY document is replaced without ceremony', () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    expect(openPartCount()).toBe(0);
    expect(confirmReplaceDocument('a shared link')).toBe(true);
    // The point: no dialog at all for the common case.
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('a document with work in it asks, and says what would be lost', () => {
    addPart(LENS.id, [0, 0, 0]);
    addPart(LENS.id, [50, 0, 0]);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    expect(confirmReplaceDocument('demo-bench.dsn.zip')).toBe(true);
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain('demo-bench.dsn.zip');
    expect(message).toContain('2 parts');
    expect(message).toContain('cannot be undone');
  });

  it('declining leaves the document alone', () => {
    addPart(LENS.id, [0, 0, 0]);
    vi.stubGlobal('confirm', () => false);
    expect(confirmReplaceDocument('a shared link')).toBe(false);
    expect(openPartCount()).toBe(1);
  });

  it('one part reads as "1 part", not "1 parts"', () => {
    addPart(LENS.id, [0, 0, 0]);
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    confirmReplaceDocument('x');
    expect(confirmSpy.mock.calls[0][0] as string).toContain('1 part)');
  });
});

describe('clearAll prunes the netlist with the parts (WP-105)', () => {
  it('leaves no path pointing at a part that no longer exists', () => {
    const a = addPart(LENS.id, [0, 0, 0])!;
    const b = addPart(LENS.id, [50, 0, 0])!;
    setPath('relay', [makePortRef(a, 'back'), makePortRef(b, 'front')]);
    expect(Object.keys(usePathsStore.getState().paths)).toHaveLength(1);

    useAppStore.getState().clearAll();

    expect(openPartCount()).toBe(0);
    // Before WP-105 the path survived on its own localStorage key, pointing
    // at ids that were gone — invisible until something walked the chain.
    expect(Object.keys(usePathsStore.getState().paths)).toHaveLength(0);
    expect(useFibersStore.getState().fibers).toHaveLength(0);
  });
});

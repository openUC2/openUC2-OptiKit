/**
 * Published library index (WP-22: the optikit-core service IS the registry).
 *
 * The default URL points at the service's `/v1/library/index` (built fresh
 * from the library tree, so dev writes appear immediately); the static
 * snapshot bundled under public/optikit-library/ is the OFFLINE FALLBACK
 * only — `useLibraryIndex` falls back to it automatically when the service
 * is unreachable. A user-entered URL (persisted) always wins.
 *
 * WP-34: module entries are typed (T-class, assets, ports) and the hook
 * refetches when `bumpLibraryIndex()` fires — the component editor's save
 * and the bind workbench's dev write call it, so freshly authored parts
 * appear in the schematic palette without a manual reload.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { getCoreUrl } from '../api/coreClient';

export interface IndexComponent {
  id: string;
  version: string;
  kind: 'optical_component';
  category: string;
  description: string;
  tags: string[];
  vendor: { name: string; mpn: string; url: string };
  efl_mm: number | null;
  n_surfaces: number;
  review: boolean;
  /** WP-60: record ports resolved to local mm — enough to PLACE a bare
   * symbol straight from the index, no per-record request. */
  ports?: IndexPort[];
  /** WP-60: source emission lines in µm (empty for non-sources). */
  wavelengths_um?: number[];
  /** WP-60: authored schematic symbol URL path, when the record ships one. */
  symbol?: string | null;
  /** WP-60: the record's own optiland surface stack, verbatim — a placed
   * bare symbol exports (and simulates) the REAL prescription. ±Infinity
   * radii cross the wire as ±1e999. */
  fragment_surfaces?: Record<string, unknown>[];
}

/** A record port with its frame offset resolved to local mm (WP-34). */
export interface IndexPort {
  name: string;
  direction: string;
  position_mm: [number, number, number];
  after_surface: number | null;
  /** WP-46: 'fiber' takes a patch cord; '' (or absent) is free space. */
  coupling?: '' | 'fiber';
}

export interface IndexDof {
  name: string;
  kind: 'translation' | 'rotation' | 'parameter';
  axis: string;
  unit: string;
  range: [number, number] | null;
  actuatable: boolean;
  /** WP-42: the surface this DOF drives + the frame it moves about, and the
   * firmware object bound to it (null when not actuated). */
  pivot_frame?: string;
  surface?: number | null;
  can_object?: number | string | null;
}

/** WP-45: a docking region on a carrier (cells relative to its placement). */
export interface IndexBay {
  origin_cell: [number, number, number];
  size: [number, number, number];
  axis: string;
}

/** WP-44: a cube group — a placeable arrangement (the OPM). */
export interface IndexGroup {
  id: string;
  version: string;
  kind: 'cube_group';
  description: string;
  tags: string[];
  review: boolean;
  /** WP-58: `<owner>/<repo>` when this came from a mounted community repo. */
  repo?: string;
  envelope_grid: [number, number, number];
  members: {
    key: string;
    module: string;
    cell: [number, number, number];
    rot90: number;
    overhang: boolean;
  }[];
  structure: {
    plates: Record<string, { module: string; origin: [number, number]; size: [number, number] }>;
    joints: string;
    joint_cells: [number, number, number][];
    joint_module: string;
  };
  interface: Record<string, { member: string; port: string }>;
}

export interface IndexModule {
  id: string;
  version: string;
  kind: 'cube_module';
  description: string;
  tags: string[];
  category: string;
  thumbnail: string | null;
  footprint_grid: [number, number, number];
  /** Kit price in EUR from the module record (null = unpriced). */
  price?: number | null;
  /** WP-58: `<owner>/<repo>` when this came from a mounted community repo. */
  repo?: string;
  review: boolean;
  component: {
    ref: string;
    resolved: string | null;
    vendor: { name: string; mpn: string; url: string } | null;
    efl_mm: number | null;
    /** WP-47: the source record's emission lines, µm (empty for non-sources). */
    wavelengths_um?: number[];
    /** WP-47: pixel facts for slm/display parts. */
    programmable?: {
      mode: 'reflective' | 'transmissive';
      'pixel-pitch-um': number | null;
      resolution: [number, number] | null;
      'fill-factor': number | null;
    } | null;
  };
  template: {
    ref: string;
    id?: string | null;
    resolved: string | null;
    class: 'fixed' | 'adaptive' | 'generative' | null;
    actuatable: boolean;
    dof?: IndexDof[];
    states?: string[];
    /** WP-45: carriers host cubes; bays are their docking regions. */
    carrier?: boolean;
    bays?: Record<string, IndexBay>;
  };
  /** Service asset URL paths (`/v1/library/assets/...`), origin-relative. */
  assets?: {
    thumbnail: string | null;
    glb: string | null;
    step: string | null;
    /** WP-48: authored schematic symbol (SVG), when the component ships one. */
    symbol?: string | null;
  };
  ports?: IndexPort[];
  electronics: unknown | null;
}

export interface LibraryIndex {
  schema: string;
  count: number;
  modules: IndexModule[];
  components?: IndexComponent[];
  /** WP-44: placeable arrangements (absent on pre-group indexes). */
  groups?: IndexGroup[];
}

const URL_STORAGE_KEY = 'optikit-library-index-url';
/** Bundled dev snapshot — the offline fallback. */
export const FALLBACK_INDEX_URL = `${import.meta.env.BASE_URL}optikit-library/index.json`;
/** The service registry (WP-22): fresh from the library tree. */
export const DEFAULT_INDEX_URL = `${getCoreUrl()}/v1/library/index`;

export function getIndexUrl(): string {
  return localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_INDEX_URL;
}

/** Registry origin for asset fetches (WP-38): derived from the index URL when
 * it is a service index, else the configured core service. */
export function assetsBaseUrl(indexUrl: string): string {
  const suffix = '/v1/library/index';
  if (indexUrl.endsWith(suffix)) return indexUrl.slice(0, -suffix.length);
  return getCoreUrl().replace(/\/$/, '');
}

export function setIndexUrl(url: string): void {
  if (url && url !== DEFAULT_INDEX_URL) localStorage.setItem(URL_STORAGE_KEY, url);
  else localStorage.removeItem(URL_STORAGE_KEY);
}

// ── refresh signal (WP-34) ────────────────────────────────────────────────────

interface LibraryRefreshState {
  version: number;
  bump: () => void;
}

const useLibraryRefresh = create<LibraryRefreshState>(set => ({
  version: 0,
  bump: () => set(s => ({ version: s.version + 1 })),
}));

/** Signal that the library changed (dev write / workspace save) — every
 * mounted `useLibraryIndex` refetches. */
export function bumpLibraryIndex(): void {
  useLibraryRefresh.getState().bump();
}

export interface IndexState {
  url: string;
  loading: boolean;
  error: string | null;
  components: IndexComponent[];
  modules: IndexModule[];
  groups: IndexGroup[];
}

export async function fetchLibraryIndex(url: string): Promise<LibraryIndex> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = (await response.json()) as LibraryIndex;
  if (!data.schema?.startsWith('optikit-library-index/')) {
    throw new Error('not an optikit library index (schema field missing)');
  }
  return data;
}

/** Load the index from the configured URL; refetches when the URL changes or
 * `bumpLibraryIndex()` fires. */
export function useLibraryIndex(): IndexState & { setUrl: (url: string) => void } {
  const [url, setUrlState] = useState(getIndexUrl);
  const refreshVersion = useLibraryRefresh(s => s.version);
  const [state, setState] = useState<Omit<IndexState, 'url'>>({
    loading: true,
    error: null,
    components: [],
    modules: [],
    groups: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    fetchLibraryIndex(url)
      .then(index => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          components: index.components ?? [],
          modules: index.modules ?? [],
          groups: index.groups ?? [],
        });
      })
      .catch(async (err: unknown) => {
        // Service unreachable → the bundled snapshot keeps the browser
        // working offline (WP-22). Surface where the data came from.
        if (cancelled || url === FALLBACK_INDEX_URL) {
          if (!cancelled) {
            setState({ loading: false, error: String(err), components: [], modules: [], groups: [] });
          }
          return;
        }
        try {
          const fallback = await fetchLibraryIndex(FALLBACK_INDEX_URL);
          if (cancelled) return;
          setState({
            loading: false,
            error: `registry unreachable (${String(err)}) — showing the bundled offline snapshot`,
            components: fallback.components ?? [],
            modules: fallback.modules ?? [],
            groups: fallback.groups ?? [],
          });
        } catch {
          if (!cancelled) {
            setState({ loading: false, error: String(err), components: [], modules: [], groups: [] });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, refreshVersion]);

  const setUrl = (next: string) => {
    setIndexUrl(next);
    setUrlState(next || DEFAULT_INDEX_URL);
  };

  return { url, ...state, setUrl };
}

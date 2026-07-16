/**
 * Published library index (WP-22: the optikit-core service IS the registry).
 *
 * The default URL points at the service's `/v1/library/index` (built fresh
 * from the library tree, so dev writes appear immediately); the static
 * snapshot bundled under public/optikit-library/ is the OFFLINE FALLBACK
 * only — `useLibraryIndex` falls back to it automatically when the service
 * is unreachable. A user-entered URL (persisted) always wins.
 */

import { useEffect, useState } from 'react';
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
}

export interface LibraryIndex {
  schema: string;
  count: number;
  modules: unknown[];
  components?: IndexComponent[];
}

const URL_STORAGE_KEY = 'optikit-library-index-url';
/** Bundled dev snapshot — the offline fallback. */
export const FALLBACK_INDEX_URL = `${import.meta.env.BASE_URL}optikit-library/index.json`;
/** The service registry (WP-22): fresh from the library tree. */
export const DEFAULT_INDEX_URL = `${getCoreUrl()}/v1/library/index`;

export function getIndexUrl(): string {
  return localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_INDEX_URL;
}

export function setIndexUrl(url: string): void {
  if (url && url !== DEFAULT_INDEX_URL) localStorage.setItem(URL_STORAGE_KEY, url);
  else localStorage.removeItem(URL_STORAGE_KEY);
}

export interface IndexState {
  url: string;
  loading: boolean;
  error: string | null;
  components: IndexComponent[];
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

/** Load the index from the configured URL; refetches when the URL changes. */
export function useLibraryIndex(): IndexState & { setUrl: (url: string) => void } {
  const [url, setUrlState] = useState(getIndexUrl);
  const [state, setState] = useState<Omit<IndexState, 'url'>>({
    loading: true,
    error: null,
    components: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    fetchLibraryIndex(url)
      .then(index => {
        if (cancelled) return;
        setState({ loading: false, error: null, components: index.components ?? [] });
      })
      .catch(async (err: unknown) => {
        // Service unreachable → the bundled snapshot keeps the browser
        // working offline (WP-22). Surface where the data came from.
        if (cancelled || url === FALLBACK_INDEX_URL) {
          if (!cancelled) setState({ loading: false, error: String(err), components: [] });
          return;
        }
        try {
          const fallback = await fetchLibraryIndex(FALLBACK_INDEX_URL);
          if (cancelled) return;
          setState({
            loading: false,
            error: `registry unreachable (${String(err)}) — showing the bundled offline snapshot`,
            components: fallback.components ?? [],
          });
        } catch {
          if (!cancelled) setState({ loading: false, error: String(err), components: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const setUrl = (next: string) => {
    setIndexUrl(next);
    setUrlState(next || DEFAULT_INDEX_URL);
  };

  return { url, ...state, setUrl };
}

/**
 * Published library index (optikit-core `library/dist/index.json`).
 *
 * The URL is configurable (persisted); the default points at the dev snapshot
 * bundled under public/optikit-library/. In production this becomes the raw
 * URL of the published optikit-core index.
 */

import { useEffect, useState } from 'react';

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
export const DEFAULT_INDEX_URL = `${import.meta.env.BASE_URL}optikit-library/index.json`;

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
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ loading: false, error: String(err), components: [] });
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

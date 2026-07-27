/**
 * Community libraries mounted from GitHub (WP-58).
 *
 * A fork of `optikit-community-template` publishes a `library-index.json` at
 * its repo root (its CI regenerates and commits it). Paste the repo URL here
 * and its parts join the palette under the repo's own badge, and its designs
 * join the gallery.
 *
 * Precedence, lowest to highest: builtin `openuc2.*` < mounted repos < local
 * drafts. A community repo can therefore ADD parts but never silently
 * override a curated one — the curated id keeps winning, and the shadowed
 * community entry is reported rather than dropped in silence.
 *
 * Everything is read-only: mounting fetches, it never writes to the repo.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LibraryIndex } from './libraryIndex';

export interface CommunityRepo {
  /** Canonical `https://github.com/<owner>/<repo>` (no trailing slash). */
  url: string;
  /** `<owner>/<repo>` — the palette badge. */
  slug: string;
  /** Branch or tag the index is read from. */
  ref: string;
}

export interface MountedRepo extends CommunityRepo {
  index: LibraryIndex | null;
  error: string | null;
  loading: boolean;
}

/** The index a fork's CI commits, and where its raw content lives. */
export const INDEX_FILE = 'library-index.json';

const GITHUB_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Parse a GitHub repo URL into a mountable descriptor, or null. */
export function parseRepoUrl(raw: string, ref = 'main'): CommunityRepo | null {
  const match = GITHUB_RE.exec(raw.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  return { url: `https://github.com/${owner}/${repo}`, slug: `${owner}/${repo}`, ref };
}

/** Raw URL of a file in a mounted repo (what actually gets fetched). */
export function rawUrl(repo: CommunityRepo, path: string): string {
  return `https://raw.githubusercontent.com/${repo.slug}/${repo.ref}/${path}`;
}

interface ReposState {
  repos: CommunityRepo[];
  addRepo: (repo: CommunityRepo) => void;
  removeRepo: (url: string) => void;
}

export const useCommunityRepos = create<ReposState>()(
  persist(
    set => ({
      repos: [],
      addRepo: repo =>
        set(s =>
          s.repos.some(r => r.url === repo.url) ? s : { repos: [...s.repos, repo] },
        ),
      removeRepo: url => set(s => ({ repos: s.repos.filter(r => r.url !== url) })),
    }),
    { name: 'optikit-community-repos' },
  ),
);

/** Fetch one repo's index. Rejects with a human-readable reason. */
export async function fetchRepoIndex(repo: CommunityRepo): Promise<LibraryIndex> {
  const url = rawUrl(repo, INDEX_FILE);
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch (err) {
    throw new Error(`could not reach ${repo.slug} (${String(err)})`);
  }
  if (response.status === 404) {
    throw new Error(
      `${repo.slug}@${repo.ref} has no ${INDEX_FILE} — push once so its CI ` +
        'can generate and commit the index',
    );
  }
  if (!response.ok) {
    throw new Error(`${repo.slug}: HTTP ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as LibraryIndex;
  if (!data.schema?.startsWith('optikit-library-index/')) {
    throw new Error(`${repo.slug}: ${INDEX_FILE} is not an optikit library index`);
  }
  return data;
}

/**
 * Merge mounted repos into the builtin index.
 *
 * Returns the merged module/group lists plus the ids a community repo tried
 * to claim that a curated record already owns — shadowing is reported, never
 * silent, because a palette that quietly serves someone else's `openuc2.*`
 * part is how a supply chain goes wrong.
 */
export function mergeRepoIndexes(
  builtinModules: LibraryIndex['modules'],
  builtinGroups: LibraryIndex['groups'],
  mounted: MountedRepo[],
): {
  modules: LibraryIndex['modules'];
  groups: NonNullable<LibraryIndex['groups']>;
  shadowed: { slug: string; id: string }[];
} {
  const modules = [...builtinModules];
  const groups = [...(builtinGroups ?? [])];
  const seen = new Set(modules.map(m => m.id));
  const seenGroups = new Set(groups.map(g => g.id));
  const shadowed: { slug: string; id: string }[] = [];

  for (const repo of mounted) {
    if (!repo.index) continue;
    for (const module of repo.index.modules ?? []) {
      if (seen.has(module.id)) {
        shadowed.push({ slug: repo.slug, id: module.id });
        continue;
      }
      seen.add(module.id);
      modules.push({ ...module, repo: repo.slug } as typeof module);
    }
    for (const group of repo.index.groups ?? []) {
      if (seenGroups.has(group.id)) {
        shadowed.push({ slug: repo.slug, id: group.id });
        continue;
      }
      seenGroups.add(group.id);
      groups.push({ ...group, repo: repo.slug } as typeof group);
    }
  }
  return { modules, groups, shadowed };
}

/**
 * Mount every configured repo: fetches each index once per (url, ref) and
 * keeps the results alongside their errors, so a dead fork shows a reason in
 * the palette instead of vanishing.
 */
export function useMountedRepos(): MountedRepo[] {
  const repos = useCommunityRepos(s => s.repos);
  const [mounted, setMounted] = useState<MountedRepo[]>([]);

  useEffect(() => {
    let cancelled = false;
    setMounted(repos.map(r => ({ ...r, index: null, error: null, loading: true })));
    Promise.all(
      repos.map(async (repo): Promise<MountedRepo> => {
        try {
          return { ...repo, index: await fetchRepoIndex(repo), error: null, loading: false };
        } catch (err) {
          return {
            ...repo,
            index: null,
            error: err instanceof Error ? err.message : String(err),
            loading: false,
          };
        }
      }),
    ).then(result => {
      if (!cancelled) setMounted(result);
    });
    return () => {
      cancelled = true;
    };
    // Refetch when the SET of repos changes, not on every render.
  }, [repos.map(r => `${r.url}@${r.ref}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return mounted;
}

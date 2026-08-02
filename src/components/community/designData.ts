/**
 * Community pages data layer (design adaptation, 2026-07): the gallery
 * index, a fetched design's parsed declaration, and the LIVE BOM — part
 * counts joined against real registry prices (never invented numbers; a
 * missing price stays visibly unpriced).
 */

import { designFromFiles, designToParts } from '../../model/dsn';
import type { DesignDecl } from '../../model/dsn';
import type { IndexModule } from '../../model/libraryIndex';
import { rawUrl } from '../../model/communityRepos';
import type { CommunityRepo } from '../../model/communityRepos';
import { slugOf } from '../../model/librarySearch';

export interface GalleryDesign {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  parts: number;
  /** WP-58: `<owner>/<repo>` when this design came from a mounted repo. */
  repo?: string;
}

async function fetchBuiltinGallery(): Promise<GalleryDesign[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}designs/index.json`);
  if (!response.ok) return [];
  const data = (await response.json()) as { designs?: GalleryDesign[] };
  return data.designs ?? [];
}

/**
 * WP-58: designs published by a mounted community repo.
 *
 * A fork lists them in the same `designs/index.json` shape; relative `url`s
 * resolve against the repo's raw content so a fork only has to name its own
 * files. A repo that publishes no gallery is not an error — plenty of forks
 * are parts-only.
 */
async function fetchRepoGallery(repo: CommunityRepo): Promise<GalleryDesign[]> {
  try {
    const response = await fetch(rawUrl(repo, 'designs/index.json'), { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = (await response.json()) as { designs?: GalleryDesign[] };
    return (data.designs ?? []).map(design => ({
      ...design,
      id: `${repo.slug}/${design.id}`,
      repo: repo.slug,
      url: /^https?:\/\//.test(design.url) ? design.url : rawUrl(repo, design.url),
    }));
  } catch {
    return [];
  }
}

export async function fetchGallery(
  repos: CommunityRepo[] = [],
): Promise<GalleryDesign[]> {
  const [builtin, ...community] = await Promise.all([
    fetchBuiltinGallery(),
    ...repos.map(fetchRepoGallery),
  ]);
  return [...builtin, ...community.flat()];
}

export async function fetchDesign(url: string): Promise<DesignDecl> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`design fetch failed: HTTP ${response.status}`);
  return designFromFiles({ 'optikit-design.yml': await response.text() });
}

export interface BomLine {
  moduleId: string;
  name: string;
  qty: number;
  /** EUR per unit from the registry record — null = unpriced. */
  unitPrice: number | null;
  category: string;
}

export interface Bom {
  lines: BomLine[];
  totalParts: number;
  /** Sum over PRICED lines only. */
  pricedTotal: number;
  unpricedLines: number;
}

/** Aggregate a design's placed parts into BOM lines with registry prices. */
export function bomOf(decl: DesignDecl, modules: IndexModule[]): Bom {
  const byId = new Map(modules.map(m => [m.id, m]));
  const counts = new Map<string, number>();
  for (const part of designToParts(decl).parts) {
    counts.set(part.libraryRef, (counts.get(part.libraryRef) ?? 0) + 1);
  }
  const lines: BomLine[] = [...counts.entries()]
    .map(([moduleId, qty]) => {
      const mod = byId.get(moduleId);
      const price = (mod as { price?: number | null } | undefined)?.price ?? null;
      return {
        moduleId,
        name: slugOf(moduleId),
        qty,
        unitPrice: typeof price === 'number' ? price : null,
        category: mod?.category ?? 'other',
      };
    })
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  return {
    lines,
    totalParts: [...counts.values()].reduce((s, n) => s + n, 0),
    pricedTotal: lines.reduce(
      (sum, l) => sum + (l.unitPrice != null ? l.unitPrice * l.qty : 0),
      0,
    ),
    unpricedLines: lines.filter(l => l.unitPrice == null).length,
  };
}

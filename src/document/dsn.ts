/**
 * .dsn round trip (EMB-E remainder, WP-12): the configurator's placements as
 * an optikit-design.yml, and back.
 *
 * Export is `buildDesign` plus the `provenance.catalog` lock (decision 6.11):
 * the library index hash at export time, so an importer can tell whether the
 * records this design inlined have drifted. Import inverts the EMB-C
 * placement contract: absolute cells from the anchor digraph, module slugs
 * from the inlined record ids (`primitive.model`), and yaw/tilt/top recovered
 * from `rotation.grid` by enumerating the placement vocabulary against
 * `gridRotation` — mount-aware, preferring the plain-yaw solution, so a
 * design this app exported reproduces its placements exactly. Components
 * whose record maps to no module (or whose pose is outside the vocabulary)
 * are reported, never guessed (decision E4).
 */

import { parse } from 'yaml';

import type { PlacedModule } from '../types';
import type { OptikitRecord, OptikitRef, UnmappedPlacement } from './designBuilder';
import { buildDesign, gridRotation } from './designBuilder';

export interface DsnExportResult {
  /** optikit-design.yml text, provenance.catalog included when a hash was given. */
  yaml: string;
  unmapped: UnmappedPlacement[];
}

export function dsnFromPlacements(
  placements: readonly PlacedModule[],
  optikitRefFor: (moduleId: string) => OptikitRef | undefined,
  records: ReadonlyMap<string, OptikitRecord>,
  catalogHash?: string,
): DsnExportResult {
  const { yaml, unmapped } = buildDesign(placements, optikitRefFor, records, {
    catalogLock: catalogHash,
  });
  return { yaml, unmapped };
}

export interface DsnImportSkip {
  component: string;
  reason: string;
}

export interface DsnImportResult {
  placements: PlacedModule[];
  /** Components present in the design but not loadable as placements. */
  skipped: DsnImportSkip[];
  /** The exported library index hash, when the design carries the lock. */
  catalogHash: string | null;
}

interface DsnComponent {
  primitive?: { model?: string };
  pose?: {
    rotation?: { grid?: { z?: string; x?: string } };
    translation?: {
      anchor?: string;
      'offset-grid'?: { x?: number; y?: number; z?: number };
    };
  };
}

export function placementsFromDsn(
  yamlText: string,
  slugForRecord: (recordId: string) => string | undefined,
  mountForSlug: (slug: string) => string | undefined,
): DsnImportResult {
  const doc = parse(yamlText) as {
    components?: Record<string, DsnComponent>;
    provenance?: { catalog?: { 'index-hash'?: string } };
  } | null;
  const comps = doc?.components ?? {};
  const entries = Object.entries(comps);
  const skipped: DsnImportSkip[] = [];

  // Absolute cells from the anchor digraph: anchor-less components carry
  // absolute offsets; anchored ones resolve iteratively (chains allowed,
  // cycles and dangling anchors are reported).
  const cells = new Map<string, { x: number; y: number; z: number }>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [id, c] of entries) {
      if (cells.has(id)) continue;
      const t = c.pose?.translation;
      const g = t?.['offset-grid'] ?? {};
      const grid = { x: g.x ?? 0, y: g.y ?? 0, z: g.z ?? 0 };
      const anchor = t?.anchor;
      if (!anchor) {
        cells.set(id, grid);
        progressed = true;
      } else if (cells.has(anchor)) {
        const a = cells.get(anchor)!;
        cells.set(id, { x: a.x + grid.x, y: a.y + grid.y, z: a.z + grid.z });
        progressed = true;
      }
    }
  }

  const placements: PlacedModule[] = [];
  for (const [id, c] of entries) {
    const cell = cells.get(id);
    if (!cell) {
      skipped.push({ component: id, reason: 'translation anchor does not resolve' });
      continue;
    }
    const recordId = c.primitive?.model;
    const slug = recordId ? slugForRecord(recordId) : undefined;
    if (!slug) {
      skipped.push({
        component: id,
        reason: `no module maps to record '${recordId ?? '(none)'}'`,
      });
      continue;
    }
    const angles = recoverAngles(c.pose?.rotation?.grid, mountForSlug(slug));
    if (!angles) {
      skipped.push({
        component: id,
        reason: 'rotation.grid is not reachable from the placement vocabulary',
      });
      continue;
    }
    // Our exports name components `${slug}-${placementId}`; keep the id
    // stable on round trip, fall back to the component id otherwise.
    const pid = id.startsWith(`${slug}-`) ? id.slice(slug.length + 1) : id;
    placements.push({
      id: pid,
      moduleId: slug,
      position: { x: cell.x, y: cell.y },
      layer: cell.z,
      rotation: angles.rotation,
      ...(angles.topRotation ? { topRotation: angles.topRotation } : {}),
      ...(angles.tiltRotation ? { tiltRotation: angles.tiltRotation } : {}),
    });
  }
  return {
    placements,
    skipped,
    catalogHash: doc?.provenance?.catalog?.['index-hash'] ?? null,
  };
}

/** Invert `gridRotation` by enumeration: 64 quarter-turn triples cover every
 * reachable grid rotation; tilt/top iterate outermost with 0 first, so the
 * canonical (plain-yaw) solution wins and a design this app exported round
 * trips to its original angles. `null` when the authored rotation is outside
 * what a placement can express (e.g. a record mounted differently). */
function recoverAngles(
  grid: { z?: string; x?: string } | undefined,
  mount: string | undefined,
): { rotation: number; tiltRotation: number; topRotation: number } | null {
  if (!grid?.z || !grid?.x) return { rotation: 0, tiltRotation: 0, topRotation: 0 };
  for (const tiltRotation of [0, 90, 180, 270]) {
    for (const topRotation of [0, 90, 180, 270]) {
      for (const rotation of [0, 90, 180, 270]) {
        const g = gridRotation({ rotation, tiltRotation, topRotation }, mount);
        if (g.z === grid.z && g.x === grid.x) {
          return { rotation, tiltRotation, topRotation };
        }
      }
    }
  }
  return null;
}

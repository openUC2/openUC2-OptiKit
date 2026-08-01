/**
 * WP-87 — import an Optiland setup: pure helpers between the service response
 * (`POST /v1/import/optiland`) and the schematic.
 *
 * The service turns a serialized Optiland system into component records (one
 * per contiguous glass element, plus source/detector) and a PLACEMENT PLAN of
 * axial z positions. Here that plan becomes document-frame drop positions: a
 * row of unbound free primitives along +x (the document's beam axis), each a
 * temporary workspace component until the user promotes it to the library.
 * T-class binding happens only when the user cubifies — never at import.
 */

import type { Vec3 } from '../document';
import type { ImportOptilandResponse } from '../api/coreClient';
import {
  fragmentSurfacesToDrafts,
  paraxialEflMm,
  type FragmentSurfaceJson,
} from './componentRecord';
import type { ComponentRecord } from './dsn/generated/library-component';

export interface OptilandPreviewRow {
  id: string;
  kind: string;
  category: string;
  zMm: number;
  nSurfaces: number;
  /** Paraxial estimate from the fragment (the record ships no EFL). */
  eflMm: number | null;
  record: ComponentRecord;
}

/** Join the placement plan onto its component records, in axial order. */
export function optilandPreviewRows(response: ImportOptilandResponse): OptilandPreviewRow[] {
  const byId = new Map(
    response.components.map(c => [String((c as { id?: unknown }).id ?? ''), c]),
  );
  return response.placements.map(p => {
    const record = (byId.get(p.component) ?? {}) as ComponentRecord;
    const optics = record.optics as
      | { fragment?: { surfaces?: FragmentSurfaceJson[] } | null }
      | undefined;
    const surfaces = optics?.fragment?.surfaces ?? [];
    const drafts = fragmentSurfacesToDrafts(surfaces);
    return {
      id: p.component,
      kind: p.kind,
      category: String(record.category ?? p.kind),
      zMm: p['z-mm'],
      nSurfaces: surfaces.length,
      eflMm: drafts.length > 0 ? paraxialEflMm(drafts) : null,
      record,
    };
  });
}

/**
 * A plan z (mm along the optical axis) as a document drop position: the row
 * runs along +x from `origin`, in continuous mm — no grid snap; these are
 * free primitives (WP-60) until cubified.
 */
export function optilandDropPosition(origin: Vec3, zMm: number): Vec3 {
  return [origin[0] + zMm, origin[1], origin[2]];
}

/**
 * WP-100: resolving a `?open=<component-id>` deep link to a record.
 *
 * Seven navigation sites (the schematic context menu, the inspector pencil,
 * the assembly card, the BOM) send the user here. Before this module, the
 * page asked the PUBLISHED REGISTRY and nothing else, and swallowed the 404 —
 * so every bundle-imported part and every local draft landed on a blank NEW
 * record that looks like a corrupted version of the part that was clicked.
 *
 * A record can live in three places, and the resolution order is the palette's:
 *
 *   1. the browser-local workspace  (drafts, and every .dsn bundle component)
 *   2. the session bundle's retained YAML  (a zip that kept its own library/)
 *   3. the published registry  (the full record via the asset endpoint)
 *   4. the index summary  (LOSSY — the last resort, and it says so)
 *
 * Steps 1-2 are synchronous and must not wait on the registry index; step 3
 * is the only one that needs it. Hence the two exported functions.
 */

import { recordFromYaml } from './componentRecord';
import { recordFromIndexComponent, type IndexComponent } from './libraryIndex';
import type { ComponentRecord } from './dsn/generated/library-component';

export type RecordOrigin = 'index' | 'workspace';

export interface OpenResolution {
  record: ComponentRecord;
  origin: RecordOrigin;
  /** Which sidebar tab holds it, so the browser can follow the link. */
  tab: RecordOrigin;
  /** Set when what was opened is NOT exactly what was asked for. */
  warning: string | null;
  /** True for the index-summary reconstruction — never publish it back. */
  reconstructed: boolean;
}

export interface OpenFailure {
  record: null;
  warning: string;
}

/**
 * Steps 1-2 — synchronous, no registry needed. Returns null when the id is
 * not held locally, which is the caller's cue to try the registry.
 */
export function resolveLocalRecord(
  id: string,
  deps: {
    workspaceRecords: Record<string, ComponentRecord>;
    bundleFiles: Record<string, string | Uint8Array>;
  },
): OpenResolution | null {
  const local = deps.workspaceRecords[id];
  if (local) {
    return { record: local, origin: 'workspace', tab: 'workspace', warning: null, reconstructed: false };
  }
  // A bundle entry is a PALETTE ROW, not a record — parse the YAML the zip
  // retained instead. (Today `registerBundleLibrary` also saves components
  // into the workspace, so this is belt-and-braces; it is what keeps the
  // chain correct if a future bundle stays session-only.)
  const yaml = deps.bundleFiles[`library/components/${id}/component.yml`];
  if (typeof yaml === 'string') {
    try {
      return {
        record: recordFromYaml(yaml),
        origin: 'workspace',
        tab: 'workspace',
        warning: null,
        reconstructed: false,
      };
    } catch {
      return null; // a malformed bundle falls through to the registry
    }
  }
  return null;
}

/**
 * Steps 3-4 — needs a loaded index. `fetchRecord` throws on a non-2xx; the
 * index summary then stands in, labelled honestly, because it still carries
 * the physics (surfaces, ports, EFL, emission lines) that the editor exists
 * to show. Everything the summary never had — docs, review notes, the
 * `mechanics` binding, comments, unknown keys — is gone, so the caller must
 * surface `warning` before any write.
 */
export async function resolveRegistryRecord(
  id: string,
  deps: {
    indexComponents: IndexComponent[];
    fetchRecord: (id: string) => Promise<ComponentRecord>;
  },
): Promise<OpenResolution | OpenFailure> {
  try {
    const record = await deps.fetchRecord(id);
    return { record, origin: 'index', tab: 'index', warning: null, reconstructed: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const summary = deps.indexComponents.find(c => c.id === id);
    if (summary) {
      return {
        record: recordFromIndexComponent(summary),
        origin: 'index',
        tab: 'index',
        reconstructed: true,
        warning:
          `${id} was reconstructed from the index summary — the full record was not reachable ` +
          `(${reason}). Its optics are real, but docs, review notes and any hand-written ` +
          `detail are missing: do not publish this back over the original.`,
      };
    }
    return {
      record: null,
      warning:
        `could not open ${id} — not in your workspace drafts, not in an imported bundle, and ` +
        `not in the published registry (${reason}). The blank draft below is a NEW record, ` +
        `not that part.`,
    };
  }
}

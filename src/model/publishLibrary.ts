/**
 * WP-110 — the ONE merge-on-write publish path for record files.
 *
 * Extracted from MechanicsPanel's dev-write so the wizard's terminal step and
 * the mechanics tab share it instead of each re-implementing WP-102's rule:
 * records authored from scratch must be MERGED into what is published (else a
 * curated template loses its `glb-url`, a module its `price` and `docs`);
 * assets pass through as bytes.
 */

import { saveLibraryRecords } from '../api/coreClient';
import { mergeYamlRecord } from './componentRecord';
import { assetsBaseUrl, bumpLibraryIndex } from './libraryIndex';

/**
 * Write a record-file map (repo-relative path → YAML text or asset bytes)
 * into ../optikit-core/library through the service, merging each YAML into
 * its published version first. Bumps the library index on success.
 */
export async function publishRecordFiles(
  files: Record<string, string | Uint8Array>,
  indexUrl: string,
): Promise<{ written: string[] }> {
  const base = assetsBaseUrl(indexUrl);
  const published = async (path: string): Promise<string | null> => {
    try {
      const res = await fetch(`${base}/v1/library/assets/${path}`, { cache: 'no-cache' });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };
  const records: string[] = [];
  const assets: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    if (typeof content === 'string') {
      records.push(mergeYamlRecord(await published(path), content));
    } else assets[path] = content;
  }
  const result = await saveLibraryRecords(records, assets);
  bumpLibraryIndex();
  return result;
}

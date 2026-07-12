/**
 * .dsn directory I/O: a design is a directory whose root file is
 * `optikit-design.yml` (plus model sidecars). In the browser a design travels
 * as a zip; in tests as an in-memory map of file contents.
 *
 * Note: the `yaml` package does not preserve comments; hand-authored files are
 * re-written comment-free on export. Comment-preserving edits belong to
 * optikit-core (ruamel); this app owns files it generated itself.
 */

import JSZip from 'jszip';
import { parse, stringify } from 'yaml';
import type { DesignDecl } from './generated/design-decl';

export const DESIGN_DECL_FILE = 'optikit-design.yml';

/** File map of a .dsn directory: path (relative, POSIX) → content. */
export type DsnFiles = Record<string, string | Uint8Array>;

export function parseDesign(yamlText: string): DesignDecl {
  const data = parse(yamlText);
  if (data === null || data === undefined) return {} as DesignDecl;
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('optikit-design.yml root must be a mapping');
  }
  return data as DesignDecl;
}

export function serializeDesign(decl: DesignDecl): string {
  return stringify(decl, {
    indent: 2,
    lineWidth: 100,
    aliasDuplicateObjects: false,
  });
}

/** Extract the design declaration from a .dsn file map. */
export function designFromFiles(files: DsnFiles): DesignDecl {
  const entry =
    files[DESIGN_DECL_FILE] ??
    // Tolerate a single wrapping directory ("my-design.dsn/optikit-design.yml").
    Object.entries(files).find(([p]) => p.endsWith(`/${DESIGN_DECL_FILE}`))?.[1];
  if (entry === undefined) {
    throw new Error(`no ${DESIGN_DECL_FILE} found in the .dsn archive`);
  }
  const text = typeof entry === 'string' ? entry : new TextDecoder().decode(entry);
  return parseDesign(text);
}

/** Pack a .dsn file map into a zip blob (for download). */
export async function zipDsn(files: DsnFiles, dirName: string): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(`${dirName}/${path}`, content);
  }
  return zip.generateAsync({ type: 'blob' });
}

/** Unpack a zip (File/Blob/ArrayBuffer) into a .dsn file map. */
export async function unzipDsn(data: Blob | ArrayBuffer): Promise<DsnFiles> {
  const zip = await JSZip.loadAsync(data);
  const files: DsnFiles = {};
  const entries = Object.values(zip.files).filter(f => !f.dir);
  // Strip a common leading directory if every entry shares one.
  const names = entries.map(f => f.name);
  const prefix = commonDirPrefix(names);
  for (const entry of entries) {
    const path = entry.name.slice(prefix.length);
    if (!path || path.startsWith('.') || path.includes('__MACOSX')) continue;
    files[path] = path.endsWith('.yml') || path.endsWith('.yaml') || path.endsWith('.json')
      ? await entry.async('string')
      : await entry.async('uint8array');
  }
  return files;
}

function commonDirPrefix(names: string[]): string {
  if (names.length === 0) return '';
  const firstSlash = names[0].indexOf('/');
  if (firstSlash < 0) return '';
  const candidate = names[0].slice(0, firstSlash + 1);
  return names.every(n => n.startsWith(candidate)) ? candidate : '';
}

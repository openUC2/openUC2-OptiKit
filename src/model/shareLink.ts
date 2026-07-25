/**
 * Share links (WP-54): the current design as a URL.
 *
 * Two forms, both loaded by the schematic on mount:
 * - `?design=<url>` — a hosted `.dsn` (the Store repo, a community repo, a
 *   gist raw URL). Nothing is encoded; the link stays short and the source
 *   stays authoritative.
 * - `?d=<payload>` — the design files INLINE: JSON → deflate-raw →
 *   base64url. No server involved — a small unsaved design travels in the
 *   fragment itself. Above `INLINE_LIMIT` the dialog refuses and points at
 *   hosting instead (URLs break silently around 8–16 kB in the wild).
 *
 * Uses the native CompressionStream — no dependency (Chrome 80+/FF 113+/
 * Safari 16.4+, Node 18+ for tests).
 */

import type { DsnFiles } from './dsn';

/** Keep inline links comfortably under real-world URL limits. */
export const INLINE_LIMIT = 6000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const compressed = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

/** Design files → the `d=` payload. */
export async function encodeShareParam(files: DsnFiles): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(files));
  const deflated = await pipe(json, new CompressionStream('deflate-raw'));
  return toBase64Url(deflated);
}

/** The `d=` payload → design files (throws on a corrupt link). */
export async function decodeShareParam(param: string): Promise<DsnFiles> {
  const inflated = await pipe(fromBase64Url(param), new DecompressionStream('deflate-raw'));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(inflated));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('share link payload is not a design file map');
  }
  return parsed as DsnFiles;
}

export interface ShareLink {
  url: string | null;
  /** Set when the design is too large to inline. */
  tooLarge: boolean;
  payloadBytes: number;
}

/** The full share URL for the current origin (null when too large). */
export async function buildShareUrl(files: DsnFiles): Promise<ShareLink> {
  const payload = await encodeShareParam(files);
  if (payload.length > INLINE_LIMIT) {
    return { url: null, tooLarge: true, payloadBytes: payload.length };
  }
  const base = `${window.location.origin}/configurator/schematic`;
  return { url: `${base}?d=${payload}`, tooLarge: false, payloadBytes: payload.length };
}

/** Fetch a hosted `?design=` URL into design files (yml or files-map JSON). */
export async function fetchDesignUrl(url: string): Promise<DsnFiles> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`design fetch failed: HTTP ${response.status}`);
  const text = await response.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as DsnFiles;
    }
    throw new Error('design JSON is not a file map');
  }
  return { 'optikit-design.yml': text };
}

/**
 * coreClient — the configurator's optikit-core service client (EMB-C, the
 * WP-15 name).
 *
 * Speaks to a running optikit-core service (default the localhost pair of
 * spec §18.1). The client fetches the library index and component record
 * YAMLs; records are cached against the index hash, so a changed library
 * invalidates the cache and an unchanged one never refetches.
 *
 * Rule 12: this module never interprets a record's `optics:` block — it
 * parses the YAML into an opaque value that designBuilder inlines verbatim.
 */

import { parse } from 'yaml';
import type { OptikitRecord } from '../document/designBuilder';

export interface LibraryIndexEntry {
  id: string;
  version: string;
  kind: string;
  category: string;
  [key: string]: unknown;
}

export interface LibraryIndex {
  /** Client-side FNV-1a hash of the index body — the record-cache key. */
  hash: string;
  entries: LibraryIndexEntry[];
}

export interface ServiceFinding {
  code: string;
  severity: string;
  where: string;
  message: string;
}

export interface FlatReportEntry {
  id: string;
  type: string;
  model: string;
  position: [number, number, number];
  rotation: Record<string, unknown>;
}

/** FNV-1a 32-bit, hex — enough to key a cache, not a security boundary. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class CoreServiceError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly context?: string;

  constructor(message: string, status: number, code?: string, context?: string) {
    super(message);
    this.name = 'CoreServiceError';
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

async function throwServiceError(response: Response): Promise<never> {
  let code: string | undefined;
  let context: string | undefined;
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { detail?: ServiceFinding & { context?: string } };
    if (body.detail?.code) {
      code = body.detail.code;
      context = body.detail.context;
      message = `${body.detail.code}: ${body.detail.message}`;
    }
  } catch {
    // non-JSON error body: keep the status line
  }
  throw new CoreServiceError(message, response.status, code, context);
}

export interface CoreClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class CoreClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private indexCache: LibraryIndex | null = null;
  private readonly recordCache = new Map<string, OptikitRecord>();

  constructor(options: CoreClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** GET /v1/library/index. Re-fetches on every call; a changed hash drops
   * the record cache, an unchanged one keeps it warm. */
  async libraryIndex(): Promise<LibraryIndex> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/library/index`);
    if (!response.ok) await throwServiceError(response);
    const text = await response.text();
    const hash = fnv1a(text);
    if (this.indexCache?.hash !== hash) {
      this.recordCache.clear();
      this.indexCache = { hash, entries: JSON.parse(text) as LibraryIndexEntry[] };
    }
    return this.indexCache!;
  }

  /** GET a component record's YAML and parse it into an OptikitRecord.
   * Cached against the current index hash (call libraryIndex() to refresh). */
  async componentRecord(recordId: string): Promise<OptikitRecord> {
    const index = this.indexCache ?? (await this.libraryIndex());
    const key = `${index.hash}:${recordId}`;
    const cached = this.recordCache.get(key);
    if (cached) return cached;

    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/library/assets/components/${recordId}/component.yml`,
    );
    if (!response.ok) await throwServiceError(response);
    const doc = parse(await response.text()) as {
      id?: string;
      category?: string;
      optics?: unknown;
    };
    const record: OptikitRecord = {
      id: doc.id ?? recordId,
      category: doc.category ?? 'other',
      optics: doc.optics ?? null,
    };
    this.recordCache.set(key, record);
    return record;
  }

  /** Fetch the records for a set of ids (deduplicated, cache-aware). */
  async componentRecords(recordIds: Iterable<string>): Promise<Map<string, OptikitRecord>> {
    const out = new Map<string, OptikitRecord>();
    for (const id of new Set(recordIds)) {
      out.set(id, await this.componentRecord(id));
    }
    return out;
  }

  /** POST /v1/validate — the design as YAML text. */
  async validate(designYaml: string): Promise<{ ok: boolean; findings: ServiceFinding[] }> {
    return (await this.postDesign('/v1/validate', designYaml)) as {
      ok: boolean;
      findings: ServiceFinding[];
    };
  }

  /** POST /v1/flatten — absolute world poses per primitive. */
  async flatten(designYaml: string): Promise<{ report: FlatReportEntry[] }> {
    return (await this.postDesign('/v1/flatten', designYaml)) as {
      report: FlatReportEntry[];
    };
  }

  private async postDesign(path: string, designYaml: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'optikit-design.yml': designYaml } }),
    });
    if (!response.ok) await throwServiceError(response);
    return response.json();
  }
}

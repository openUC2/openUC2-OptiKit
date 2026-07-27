/**
 * Typed client for the optikit-core FastAPI service (WP-15).
 *
 * Contracts (see ../optikit-core/DOCS/ARCHITECTURE.md, service section):
 * - every endpoint takes `{files: {"optikit-design.yml": "<yaml>"}}`;
 * - typed engine errors are HTTP 422 `{detail: {code, message, context}}` —
 *   surfaced here as `CoreServiceError` with the stable `code` (never match
 *   on `message`);
 * - responses encode ±Infinity as ±1e999, which `JSON.parse` overflows back
 *   to ±Infinity — nothing to do on ingest. Outgoing optics (back-annotate)
 *   lose Infinity to `null` in JSON.stringify; the service normalizes that.
 *
 * Responses are zod-validated so a drifting service fails loudly at the
 * boundary instead of deep inside the render tree.
 */

import { z } from 'zod';
import type { DsnFiles } from '../model/dsn/io';

const URL_STORAGE_KEY = 'optikit-core-url';

// Same-origin deployment (WP-25): behind the production Caddy, the API and
// the frontend share one https origin, so no CORS and no URL to configure.
// Plain-http contexts (localhost dev, LAN) keep the local service default;
// a user-entered URL in localStorage always wins.
export const DEFAULT_CORE_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? window.location.origin
    : 'http://localhost:8000';

export function getCoreUrl(): string {
  return localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_CORE_URL;
}

export function setCoreUrl(url: string): void {
  if (url && url !== DEFAULT_CORE_URL) localStorage.setItem(URL_STORAGE_KEY, url);
  else localStorage.removeItem(URL_STORAGE_KEY);
}

/** A ray that left the system with nothing to catch it (WP-52). */
export interface ChainEscape {
  source: string;
  from_comp: string;
  from_port: string;
  origin_mm: [number, number, number];
  direction: [number, number, number];
  reason: string;
}

/** A typed engine error (E_* / DRC_*) or transport failure. */
export class CoreServiceError extends Error {
  readonly code: string;
  readonly context: unknown;
  readonly status: number;
  /** Structured escape points on an E_NO_TARGET chain failure (WP-52). */
  readonly escapes: ChainEscape[];

  constructor(
    code: string,
    message: string,
    context: unknown,
    status: number,
    escapes: ChainEscape[] = [],
  ) {
    super(message);
    this.name = 'CoreServiceError';
    this.code = code;
    this.context = context;
    this.status = status;
    this.escapes = escapes;
  }
}

// ── response schemas ──────────────────────────────────────────────────────────

/**
 * zod 4's z.number() rejects ±Infinity — but the service legitimately sends
 * it (as ±1e999; e.g. an afocal system's EFL, a flat surface's radius).
 */
const anyNumber = z.custom<number>(v => typeof v === 'number');
/** NaN is encoded as null by the service (spot arrays of clipped rays). */
const numberOrNull = z.union([anyNumber, z.null()]);

const findingSchema = z.object({
  code: z.string(),
  severity: z.string().default('error'),
  where: z.string().default(''),
  message: z.string(),
});
export type ServiceFinding = z.infer<typeof findingSchema>;

const validateSchema = z.object({
  ok: z.boolean(),
  findings: z.array(findingSchema),
});
export type ValidateResponse = z.infer<typeof validateSchema>;

const vec3 = z.tuple([anyNumber, anyNumber, anyNumber]);
const escapeSchema = z.object({
  source: z.string(),
  from_comp: z.string(),
  from_port: z.string(),
  origin_mm: vec3,
  direction: vec3,
  reason: z.string(),
});

const chainInferSchema = z.object({
  paths: z.record(z.string(), z.object({ chain: z.array(z.string()) }).loose()),
  warnings: z.array(z.string()),
  escapes: z.array(escapeSchema).default([]),
});
export type ChainInferResponse = z.infer<typeof chainInferSchema>;

const simulateSchema = z.object({
  path: z.string(),
  warnings: z.array(z.string()).default([]),
  rays_world: z.array(z.array(vec3)).optional(),
  spot: z.object({ x: z.array(numberOrNull), y: z.array(numberOrNull) }).optional(),
  // Afocal paths (e.g. a fold mirror only) report NaN paraxial values, which
  // the service encodes as null (WP-32: palette designs hit this).
  paraxial: z.record(z.string(), numberOrNull).optional(),
});
export type SimulateResponse = z.infer<typeof simulateSchema>;

const deltaSchema = z.object({
  component: z.string(),
  classification: z.string(),
  param: z.string(),
  old: z.unknown(),
  new: z.unknown(),
  applied: z.boolean(),
  note: z.string().default(''),
});
export type ServiceDelta = z.infer<typeof deltaSchema>;

const drcFindingSchema = z.object({
  code: z.string(),
  comp: z.string(),
  axis: z.string().default(''),
  message: z.string(),
});
export type DrcFinding = z.infer<typeof drcFindingSchema>;

/** One component's grid pose from /v1/cubify (schema-v0 `pose:` mapping). */
const cubifiedPoseSchema = z.object({
  rotation: z.object({
    type: z.string().default('grid'),
    grid: z.record(z.string(), z.string()).optional(),
    'offset-deg': z.record(z.string(), anyNumber).optional(),
  }),
  translation: z.object({
    'offset-grid': z.record(z.string(), z.number()).optional(),
    'offset-mm': z.record(z.string(), anyNumber).optional(),
  }),
});
export type CubifiedPose = z.infer<typeof cubifiedPoseSchema>;

const cubifySchema = z.object({
  poses: z.record(z.string(), cubifiedPoseSchema),
  findings: z.array(drcFindingSchema),
});
export type CubifyResponse = z.infer<typeof cubifySchema>;

const drcSchema = z.object({ findings: z.array(drcFindingSchema) });
export type DrcResponse = z.infer<typeof drcSchema>;

/** /v1/compile: the optic dict is passed through opaquely (provenance files). */
const compileSchema = z.object({
  paths: z.record(
    z.string(),
    z.object({
      optic: z.record(z.string(), z.unknown()),
      manifest: z.array(z.record(z.string(), z.unknown())),
      warnings: z.array(z.string()).default([]),
    }),
  ),
});
export type CompileResponse = z.infer<typeof compileSchema>;

/** WP-35 T2: the Inventor-side fx changeset the service derives from the
 * optimized dof values (fx user-parameter name == dof name). */
const fxChangeSchema = z.object({
  component: z.string(),
  'template-id': z.string().nullable(),
  parameter: z.string(),
  'value-mm': anyNumber,
  groove: z
    .object({
      pair: z.array(z.number()),
      'midpoint-mm': anyNumber,
      'delta-mm': anyNumber,
    })
    .optional(),
});

const optimizeSchema = z.object({
  dof_values: z.record(z.string(), anyNumber),
  merit: z.object({
    rms_spot_before_mm: anyNumber,
    rms_spot_after_mm: anyNumber,
    iterations: z.number(),
  }),
  deltas: z.array(deltaSchema),
  findings: z.array(drcFindingSchema),
  fx: z
    .object({ schema: z.string(), changes: z.array(fxChangeSchema) })
    .optional(),
});
export type OptimizeResponse = z.infer<typeof optimizeSchema>;

// ── transport ─────────────────────────────────────────────────────────────────

async function post<T>(
  endpoint: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getCoreUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // A fetch TypeError covers BOTH "nothing listening" and "response blocked"
    // (a 500 kills the CORS middleware before headers are added, and the
    // browser then hides the response). Say so instead of always claiming the
    // service is down — that misled a real debugging session once.
    throw new CoreServiceError(
      'E_UNREACHABLE',
      `no usable response from ${getCoreUrl()} — either the service is not running ` +
        `(start: uv run optikit-core serve), its CORS config does not allow this ` +
        `origin (${typeof window === 'undefined' ? 'unknown' : window.location.origin}; ` +
        `set OPTIKIT_CORS_ORIGINS), or it crashed ` +
        `mid-request (check the service log; a stale venv shows up as ` +
        `"No module named anyio._backends" — restart the server)`,
      String(err),
      0,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (payload as {
      detail?: { code?: string; message?: string; context?: unknown; escapes?: unknown };
    })?.detail;
    const escapes = z.array(escapeSchema).safeParse(detail?.escapes);
    throw new CoreServiceError(
      detail?.code ?? `E_HTTP_${response.status}`,
      detail?.message ?? `${endpoint} failed with HTTP ${response.status}`,
      detail?.context ?? payload,
      response.status,
      escapes.success ? escapes.data : [],
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new CoreServiceError(
      'E_RESPONSE_SHAPE',
      `${endpoint} returned an unexpected shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      parsed.error.issues,
      response.status,
    );
  }
  return parsed.data;
}

// ── endpoints ─────────────────────────────────────────────────────────────────

export function validateDesign(files: DsnFiles, signal?: AbortSignal): Promise<ValidateResponse> {
  return post('/v1/validate', { files }, validateSchema, signal);
}

export function inferChains(files: DsnFiles, signal?: AbortSignal): Promise<ChainInferResponse> {
  return post('/v1/chain/infer', { files }, chainInferSchema, signal);
}

export function simulatePath(
  files: DsnFiles,
  path: string,
  opts: { numRays?: number; actions?: string[] } = {},
  signal?: AbortSignal,
): Promise<SimulateResponse> {
  return post(
    '/v1/simulate',
    {
      files,
      path,
      actions: opts.actions ?? ['trace', 'spot', 'paraxial'],
      num_rays: opts.numRays ?? 6,
    },
    simulateSchema,
    signal,
  );
}

export function cubifyDesign(files: DsnFiles, signal?: AbortSignal): Promise<CubifyResponse> {
  return post('/v1/cubify', { files }, cubifySchema, signal);
}

export function compileDesign(files: DsnFiles, signal?: AbortSignal): Promise<CompileResponse> {
  return post('/v1/compile', { files }, compileSchema, signal);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * STEP → GLB via the service's cadquery stack (WP-19). Returns the GLB bytes
 * (mm units). The STEP stays the mechanical source of truth.
 */
export async function convertStepToGlb(
  filename: string,
  stepBytes: Uint8Array,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(`${getCoreUrl()}/v1/convert/step-to-glb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, data_b64: bytesToBase64(stepBytes) }),
    signal,
  }).catch(err => {
    throw new CoreServiceError('E_UNREACHABLE', String(err), null, 0);
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: { code?: string; message?: string; context?: unknown };
    } | null;
    throw new CoreServiceError(
      payload?.detail?.code ?? `E_HTTP_${response.status}`,
      payload?.detail?.message ?? `conversion failed with HTTP ${response.status}`,
      payload?.detail?.context ?? null,
      response.status,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

const librarySaveSchema = z.object({ written: z.array(z.string()) });

/** Developer fast path: write records into the repo library (env-gated). */
export function saveLibraryRecords(
  records: string[],
  assets: Record<string, Uint8Array> = {},
  signal?: AbortSignal,
): Promise<{ written: string[] }> {
  return post(
    '/v1/library/save',
    {
      records,
      assets: Object.fromEntries(
        Object.entries(assets).map(([name, bytes]) => [name, bytesToBase64(bytes)]),
      ),
    },
    librarySaveSchema,
    signal,
  );
}

export function runDrc(files: DsnFiles, signal?: AbortSignal): Promise<DrcResponse> {
  return post('/v1/drc', { files }, drcSchema, signal);
}

export function optimizeDesign(
  files: DsnFiles,
  path: string,
  dofs: string[],
  opts: { maxIter?: number } = {},
  signal?: AbortSignal,
): Promise<OptimizeResponse> {
  return post(
    '/v1/optimize',
    { files, path, dofs, max_iter: opts.maxIter ?? 40 },
    optimizeSchema,
    signal,
  );
}

/**
 * WP-57: the design as one grouped STEP assembly. Unlike every other endpoint
 * this returns BINARY, so it bypasses `post()`'s JSON parsing — but it keeps
 * the same typed-error contract (a 422 still carries {code, message}).
 */
export async function exportStepAssembly(
  files: DsnFiles,
  opts: { beam?: 'solid' | 'wires' | 'off'; beamRadiusMm?: number } = {},
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(`${getCoreUrl()}/v1/export/step`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        files,
        beam: opts.beam ?? 'solid',
        'beam-radius-mm': opts.beamRadiusMm ?? 0.5,
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new CoreServiceError('E_UNREACHABLE', String(err), null, 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = (payload as { detail?: { code?: string; message?: string } })?.detail;
    throw new CoreServiceError(
      detail?.code ?? `E_HTTP_${response.status}`,
      detail?.message ?? `STEP export failed with HTTP ${response.status}`,
      payload,
      response.status,
    );
  }
  // The service names the file in Content-Disposition; fall back if a proxy
  // strips the header rather than downloading something called "undefined".
  const disposition = response.headers.get('content-disposition') ?? '';
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];
  return { blob: await response.blob(), filename: named || 'assembly.step' };
}

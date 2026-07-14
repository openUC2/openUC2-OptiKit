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
export const DEFAULT_CORE_URL = 'http://localhost:8000';

export function getCoreUrl(): string {
  return localStorage.getItem(URL_STORAGE_KEY) ?? DEFAULT_CORE_URL;
}

export function setCoreUrl(url: string): void {
  if (url && url !== DEFAULT_CORE_URL) localStorage.setItem(URL_STORAGE_KEY, url);
  else localStorage.removeItem(URL_STORAGE_KEY);
}

/** A typed engine error (E_* / DRC_*) or transport failure. */
export class CoreServiceError extends Error {
  readonly code: string;
  readonly context: unknown;
  readonly status: number;

  constructor(code: string, message: string, context: unknown, status: number) {
    super(message);
    this.name = 'CoreServiceError';
    this.code = code;
    this.context = context;
    this.status = status;
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

const chainInferSchema = z.object({
  paths: z.record(z.string(), z.object({ chain: z.array(z.string()) }).loose()),
  warnings: z.array(z.string()),
});
export type ChainInferResponse = z.infer<typeof chainInferSchema>;

const vec3 = z.tuple([anyNumber, anyNumber, anyNumber]);
const simulateSchema = z.object({
  path: z.string(),
  warnings: z.array(z.string()).default([]),
  rays_world: z.array(z.array(vec3)).optional(),
  spot: z.object({ x: z.array(numberOrNull), y: z.array(numberOrNull) }).optional(),
  paraxial: z.record(z.string(), anyNumber).optional(),
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

const optimizeSchema = z.object({
  dof_values: z.record(z.string(), anyNumber),
  merit: z.object({
    rms_spot_before_mm: anyNumber,
    rms_spot_after_mm: anyNumber,
    iterations: z.number(),
  }),
  deltas: z.array(deltaSchema),
  findings: z.array(drcFindingSchema),
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
    throw new CoreServiceError(
      'E_UNREACHABLE',
      `optikit-core service not reachable at ${getCoreUrl()} — start it with: uv run optikit-core serve`,
      String(err),
      0,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (payload as { detail?: { code?: string; message?: string; context?: unknown } })
      ?.detail;
    throw new CoreServiceError(
      detail?.code ?? `E_HTTP_${response.status}`,
      detail?.message ?? `${endpoint} failed with HTTP ${response.status}`,
      detail?.context ?? payload,
      response.status,
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

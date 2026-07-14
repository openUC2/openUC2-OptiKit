/**
 * WP-15: the typed service client — error surface and Infinity contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CoreServiceError,
  simulatePath,
  validateDesign,
} from '../coreClient';

const FILES = { 'optikit-design.yml': 'design: {name: t}\n' };

function mockFetch(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(text)),
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coreClient', () => {
  it('returns validated responses', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { ok: true, findings: [] }));
    const result = await validateDesign(FILES);
    expect(result.ok).toBe(true);
  });

  it('surfaces typed 422 engine errors with the stable code', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(422, {
        detail: { code: 'E_NO_OPTICS', message: 'chain component has no optics', context: 'x' },
      }),
    );
    const err = await validateDesign(FILES).catch(e => e as CoreServiceError);
    expect(err).toBeInstanceOf(CoreServiceError);
    expect((err as CoreServiceError).code).toBe('E_NO_OPTICS');
    expect((err as CoreServiceError).status).toBe(422);
  });

  it('rejects shape drift loudly instead of passing garbage through', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { totally: 'unexpected' }));
    const err = await validateDesign(FILES).catch(e => e as CoreServiceError);
    expect((err as CoreServiceError).code).toBe('E_RESPONSE_SHAPE');
  });

  it('maps unreachable services to E_UNREACHABLE with a start hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const err = await validateDesign(FILES).catch(e => e as CoreServiceError);
    expect((err as CoreServiceError).code).toBe('E_UNREACHABLE');
    expect((err as CoreServiceError).message).toMatch(/optikit-core serve/);
  });

  it('overflows the ±1e999 Infinity encoding back to Infinity on parse', async () => {
    // The service writes ±Infinity as ±1e999; JSON.parse overflows it back.
    const raw = '{"path":"p","warnings":[],"paraxial":{"f2":1e999,"F1":-1e999}}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(JSON.parse(raw)),
      }),
    );
    const result = await simulatePath(FILES, 'p');
    expect(result.paraxial?.f2).toBe(Infinity);
    expect(result.paraxial?.F1).toBe(-Infinity);
  });
});

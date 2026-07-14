/**
 * UI state for the optikit-core service round trip (WP-15): ERC findings,
 * authoritative simulation results (stamped with the document revision they
 * were computed at), and busy/error flags. Design data flows through
 * src/document + src/model/dsn/serviceExport — never appStore.
 */

import { create } from 'zustand';
import {
  CoreServiceError,
  inferChains,
  simulatePath,
  validateDesign,
} from '../../api/coreClient';
import type { SimulateResponse } from '../../api/coreClient';
import { getDocRevision, useDocRevision } from '../../document';
import { buildServiceDesign, serviceFiles } from '../../model/dsn/serviceExport';

export interface ErcMarker {
  id: string;
  source: 'validate' | 'chain';
  code: string;
  severity: 'error' | 'warning' | 'info';
  where: string;
  message: string;
  /** Resolved store part, when `where` names a mapped component. */
  partId: string | null;
}

export interface PathSimResult {
  raysWorld: [number, number, number][][];
  spot: { x: number[]; y: number[] } | null;
  paraxial: Record<string, number> | null;
  warnings: string[];
  /** Compile/trace failure for this path (other paths may still succeed). */
  error: { code: string; message: string } | null;
}

interface ServiceState {
  checkBusy: boolean;
  simBusy: boolean;
  /** Transport-level / whole-request failure. */
  error: { code: string; message: string } | null;
  markers: ErcMarker[];
  /** Chain proposals that are not yet declared in the document. */
  proposals: { name: string; chain: string[] }[];
  checkedAt: number | null;
  simByPath: Record<string, PathSimResult>;
  /** Document revision the simulation was computed at (null = never ran). */
  simRevision: number | null;
  live: boolean;
  runCheck: () => Promise<void>;
  runSimulate: (numRays?: number) => Promise<void>;
  setLive: (live: boolean) => void;
  clearError: () => void;
}

function toError(err: unknown): { code: string; message: string } {
  if (err instanceof CoreServiceError) return { code: err.code, message: err.message };
  return { code: 'E_CLIENT', message: String(err) };
}

/** Drop clipped rays (NaN → null in the service encoding) pairwise. */
function cleanSpot(
  spot: { x: (number | null)[]; y: (number | null)[] } | undefined,
): { x: number[]; y: number[] } | null {
  if (!spot) return null;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < spot.x.length; i++) {
    const xi = spot.x[i];
    const yi = spot.y[i];
    if (typeof xi === 'number' && typeof yi === 'number' && Number.isFinite(xi) && Number.isFinite(yi)) {
      x.push(xi);
      y.push(yi);
    }
  }
  return { x, y };
}

/** Best-effort `where` → part id using the component-key mapping. */
function resolveWhere(
  where: string,
  partIdByKey: Record<string, string>,
): string | null {
  const tokens = where.split(/[^a-zA-Z0-9_-]+/).filter(Boolean);
  // Longest key first so 'objective-2' wins over 'objective'.
  const keys = Object.keys(partIdByKey).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (tokens.includes(key)) return partIdByKey[key];
  }
  return null;
}

export const useServiceStore = create<ServiceState>((set, get) => ({
  checkBusy: false,
  simBusy: false,
  error: null,
  markers: [],
  proposals: [],
  checkedAt: null,
  simByPath: {},
  simRevision: null,
  live: false,

  clearError: () => set({ error: null }),
  setLive: live => set({ live }),

  runCheck: async () => {
    if (get().checkBusy) return;
    set({ checkBusy: true, error: null });
    try {
      const { design, keyByPartId } = buildServiceDesign();
      const partIdByKey = Object.fromEntries(
        Object.entries(keyByPartId).map(([id, key]) => [key, id]),
      );
      const files = serviceFiles();
      const markers: ErcMarker[] = [];
      let proposals: { name: string; chain: string[] }[] = [];

      const validation = await validateDesign(files);
      for (const f of validation.findings) {
        markers.push({
          id: `validate-${markers.length}`,
          source: 'validate',
          code: f.code,
          severity: f.severity === 'error' ? 'error' : 'warning',
          where: f.where,
          message: f.message,
          partId: resolveWhere(f.where, partIdByKey),
        });
      }

      // Chain-inference dry run: proposals not yet declared + walk warnings.
      try {
        const inferred = await inferChains(files);
        const declared = new Set(
          Object.values(design.paths ?? {}).map(p => JSON.stringify(p.chain ?? [])),
        );
        proposals = Object.entries(inferred.paths)
          .filter(([, spec]) => !declared.has(JSON.stringify(spec.chain)))
          .map(([name, spec]) => ({ name, chain: spec.chain }));
        for (const warning of inferred.warnings) {
          markers.push({
            id: `chain-${markers.length}`,
            source: 'chain',
            code: 'W_CHAIN',
            severity: 'info',
            where: '',
            message: warning,
            partId: resolveWhere(warning, partIdByKey),
          });
        }
      } catch (err) {
        const e = toError(err);
        markers.push({
          id: `chain-${markers.length}`,
          source: 'chain',
          code: e.code,
          severity: 'error',
          where: '',
          message: e.message,
          partId: null,
        });
      }

      set({ markers, proposals, checkedAt: Date.now(), checkBusy: false });
    } catch (err) {
      set({ error: toError(err), checkBusy: false });
    }
  },

  runSimulate: async (numRays = 6) => {
    if (get().simBusy) return;
    const revision = getDocRevision();
    set({ simBusy: true, error: null });
    try {
      const { design } = buildServiceDesign();
      const files = serviceFiles();
      const pathNames = Object.keys(design.paths ?? {});
      if (pathNames.length === 0) {
        set({
          simBusy: false,
          error: { code: 'E_NO_PATHS', message: 'no optical paths declared — chain ports first' },
        });
        return;
      }
      const simByPath: Record<string, PathSimResult> = {};
      for (const name of pathNames) {
        try {
          const result: SimulateResponse = await simulatePath(files, name, { numRays });
          simByPath[name] = {
            raysWorld: (result.rays_world ?? []) as [number, number, number][][],
            spot: cleanSpot(result.spot),
            paraxial: result.paraxial ?? null,
            warnings: result.warnings,
            error: null,
          };
        } catch (err) {
          if (err instanceof CoreServiceError && err.status !== 0) {
            simByPath[name] = {
              raysWorld: [], spot: null, paraxial: null, warnings: [], error: toError(err),
            };
          } else {
            throw err; // unreachable service: abort the whole run
          }
        }
      }
      set({ simByPath, simRevision: revision, simBusy: false });
    } catch (err) {
      set({ error: toError(err), simBusy: false });
    }
  },
}));

/** Fresh = computed at the current document revision. */
export function useSimFreshness(): 'none' | 'fresh' | 'stale' {
  const simRevision = useServiceStore(s => s.simRevision);
  const revision = useDocRevision();
  if (simRevision === null) return 'none';
  return simRevision === revision ? 'fresh' : 'stale';
}

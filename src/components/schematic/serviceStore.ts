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
import type { ChainEscape, SimulateResponse } from '../../api/coreClient';
import { getDocRevision, makePortRef, setPath, useDocRevision } from '../../document';
import type { Vec3 } from '../../document';
import { UC2_GRID_MM } from '../../document/types';
import { useAppStore } from '../../stores/appStore';
import { buildServiceDesign, serviceFiles, serviceFilesAtWavelength } from '../../model/dsn/serviceExport';

/**
 * Auto-chaining (WP-32): when the document declares NO paths, ask
 * /v1/chain/infer and ADOPT the result into the path store — the beam path
 * works out of the box; pin-to-pin wiring stays as the override. Returns the
 * adopted path names (empty when nothing could be inferred). Chain entries
 * whose component key has no placed part (location components in retained
 * designs) are dropped, mirroring the .dsn importer.
 */
async function inferAndAdoptChains(
  files: ReturnType<typeof serviceFiles>,
  keyByPartId: Record<string, string>,
): Promise<string[]> {
  const inferred = await inferChains(files);
  const partIdByKey = Object.fromEntries(
    Object.entries(keyByPartId).map(([id, key]) => [key, id]),
  );
  const adopted: string[] = [];
  for (const [name, spec] of Object.entries(inferred.paths)) {
    const chain = (spec.chain ?? [])
      .map(entry => {
        const dot = entry.lastIndexOf('.');
        return { key: entry.slice(0, dot), port: entry.slice(dot + 1) };
      })
      .filter(({ key }) => partIdByKey[key])
      .map(({ key, port }) => makePortRef(partIdByKey[key], port));
    if (chain.length >= 2) {
      setPath(name, chain);
      adopted.push(name);
    }
  }
  if (adopted.length > 0) {
    useAppStore.getState().addNotification({
      type: 'success',
      title: 'beam path inferred',
      message: `chained automatically: ${adopted.join(', ')} — edit pins to override`,
      duration: 6000,
    });
  }
  return adopted;
}

/** Surface an inference failure; ambiguity points at the manual wiring UI.
 * Returns the escape markers (WP-52) so the caller can draw them. */
function notifyChainFailure(
  err: unknown,
  partIdByKey: Record<string, string> = {},
): ChainEscapeMarker[] {
  const e = toError(err);
  const escapes =
    err instanceof CoreServiceError ? toEscapeMarkers(err.escapes, partIdByKey) : [];
  const hint = escapes.length > 0 ? ` The beam leaves at: ${escapes[0].hint}.` : '';
  useAppStore.getState().addNotification({
    type: 'warning',
    title: e.code === 'E_AMBIGUOUS_CHAIN' ? 'beam path is ambiguous' : 'auto-chaining failed',
    message:
      e.code === 'E_AMBIGUOUS_CHAIN'
        ? `${e.message} — chain the pins manually (click one pin, then the next)`
        : `${e.message}${hint}`,
    duration: 8000,
  });
  return escapes;
}

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
  /** null entries = NaN from the service (afocal paths, WP-32). */
  paraxial: Record<string, number | null> | null;
  /** WP-74: fraction (and mW) of the source reaching the sensor on this path. */
  photonBudget: SimulateResponse['photon_budget'] | null;
  warnings: string[];
  /** Compile/trace failure for this path (other paths may still succeed). */
  error: { code: string; message: string } | null;
  /** WP-91: one spot per source line ("simulate all lines"), overlaid in the
   * panel — null when the run traced a single wavelength. */
  multiSpot: { um: number; spot: { x: number[]; y: number[] } }[] | null;
}

interface ServiceState {
  checkBusy: boolean;
  simBusy: boolean;
  /** Transport-level / whole-request failure. */
  error: { code: string; message: string } | null;
  markers: ErcMarker[];
  /** Chain proposals that are not yet declared in the document. */
  proposals: { name: string; chain: string[] }[];
  /** Escaping rays (WP-52): a failed/partial chain, drawn dashed-red. */
  escapes: ChainEscapeMarker[];
  checkedAt: number | null;
  simByPath: Record<string, PathSimResult>;
  /** Document revision the simulation was computed at (null = never ran). */
  simRevision: number | null;
  live: boolean;
  runCheck: () => Promise<void>;
  runSimulate: (numRays?: number) => Promise<void>;
  /** WP-91: trace every path once per source line, spot per wavelength. */
  runSimulateAllLines: (linesUm: number[], numRays?: number) => Promise<void>;
  setLive: (live: boolean) => void;
  clearError: () => void;
  /** WP-78: silent inference dry run → `proposals` only (debounced by the
   * caller on document change; never toasts, never touches markers). */
  refreshProposals: () => Promise<void>;
  /** WP-78: declare one proposed path (the one-click "Adopt" chip). */
  adoptProposal: (name: string) => boolean;
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

/** The grid cell a point falls in (document mm → integer cell). */
function cellOf(mm: Vec3): [number, number, number] {
  return [
    Math.round(mm[0] / UC2_GRID_MM[0]),
    Math.round(mm[1] / UC2_GRID_MM[1]),
    Math.round(mm[2] / UC2_GRID_MM[2]),
  ];
}

/** A rendered escape (WP-52): where a ray left the system, in document mm,
 * with the empty cell it heads toward — for the dashed overlay + the hint. */
export interface ChainEscapeMarker {
  fromPartId: string | null;
  fromLabel: string;
  originMm: Vec3;
  direction: Vec3;
  cell: [number, number, number];
  reason: string;
  hint: string;
}

const AXES = ['x', 'y', 'z'] as const;

/** Nearest ±axis label of a (near axis-aligned) unit vector. */
function axisLabel(dir: Vec3): string {
  let i = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(dir[k]) > Math.abs(dir[i])) i = k;
  return `${dir[i] >= 0 ? '+' : '-'}${AXES[i]}`;
}

export function toEscapeMarkers(
  escapes: ChainEscape[],
  partIdByKey: Record<string, string>,
): ChainEscapeMarker[] {
  return escapes.map(e => {
    const originMm = e.origin_mm as Vec3;
    const direction = e.direction as Vec3;
    // The empty cell one grid step along the ray — what the user needs to fill.
    const cell = cellOf([
      originMm[0] + direction[0] * UC2_GRID_MM[0],
      originMm[1] + direction[1] * UC2_GRID_MM[1],
      originMm[2] + direction[2] * UC2_GRID_MM[2],
    ]);
    const label = e.from_port ? `${e.from_comp}.${e.from_port}` : e.from_comp;
    return {
      fromPartId: partIdByKey[e.from_comp] ?? null,
      fromLabel: label,
      originMm,
      direction,
      cell,
      reason: e.reason,
      hint: `${label} → ${axisLabel(direction)} — no part at cell [${cell.join(', ')}]`,
    };
  });
}

export const useServiceStore = create<ServiceState>((set, get) => ({
  checkBusy: false,
  simBusy: false,
  error: null,
  markers: [],
  proposals: [],
  escapes: [],
  checkedAt: null,
  simByPath: {},
  simRevision: null,
  live: false,

  clearError: () => set({ error: null }),
  setLive: live => set({ live }),

  refreshProposals: async () => {
    try {
      const { design } = buildServiceDesign();
      if (Object.keys(design.components ?? {}).length === 0) {
        set({ proposals: [] });
        return;
      }
      const inferred = await inferChains(serviceFiles());
      const declared = new Set(
        Object.values(design.paths ?? {}).map(p => JSON.stringify(p.chain ?? [])),
      );
      set({
        proposals: Object.entries(inferred.paths)
          .filter(([, spec]) => !declared.has(JSON.stringify(spec.chain)))
          .map(([name, spec]) => ({ name, chain: spec.chain })),
      });
    } catch {
      // A background dry run must never toast; ambiguity/dead ends surface
      // through the explicit check (and its escape markers) instead.
      set({ proposals: [] });
    }
  },

  adoptProposal: name => {
    const proposal = get().proposals.find(p => p.name === name);
    if (!proposal) return false;
    const { keyByPartId } = buildServiceDesign();
    const partIdByKey = Object.fromEntries(
      Object.entries(keyByPartId).map(([id, key]) => [key, id]),
    );
    const chain = proposal.chain
      .map(entry => {
        const dot = entry.lastIndexOf('.');
        return { key: entry.slice(0, dot), port: entry.slice(dot + 1) };
      })
      .filter(({ key }) => partIdByKey[key])
      .map(({ key, port }) => makePortRef(partIdByKey[key], port));
    if (chain.length < 2) return false;
    setPath(name, chain);
    set({ proposals: get().proposals.filter(p => p.name !== name) });
    useAppStore.getState().addNotification({
      type: 'success',
      title: 'path adopted',
      message: `${name}: ${proposal.chain.join(' → ')}`,
      duration: 5000,
    });
    return true;
  },

  runCheck: async () => {
    if (get().checkBusy) return;
    set({ checkBusy: true, error: null });
    try {
      let { design, keyByPartId } = buildServiceDesign();
      let files = serviceFiles();

      // Auto-chain (WP-32): with no declared paths, adopt the inference and
      // rebuild the export so validation sees the chained design.
      if (Object.keys(design.paths ?? {}).length === 0) {
        try {
          const adopted = await inferAndAdoptChains(files, keyByPartId);
          if (adopted.length > 0) {
            ({ design, keyByPartId } = buildServiceDesign());
            files = serviceFiles();
          }
        } catch (err) {
          notifyChainFailure(
            err,
            Object.fromEntries(Object.entries(keyByPartId).map(([id, key]) => [key, id])),
          );
        }
      }

      const partIdByKey = Object.fromEntries(
        Object.entries(keyByPartId).map(([id, key]) => [key, id]),
      );
      const markers: ErcMarker[] = [];
      let proposals: { name: string; chain: string[] }[] = [];
      let escapes: ChainEscapeMarker[] = [];

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
        // Pruned arms / dead ends that survived a partial inference (WP-52).
        escapes = toEscapeMarkers(inferred.escapes, partIdByKey);
      } catch (err) {
        const e = toError(err);
        escapes = err instanceof CoreServiceError ? toEscapeMarkers(err.escapes, partIdByKey) : [];
        // One marker per escape point so the ERC list names each dead end.
        if (escapes.length > 0) {
          for (const esc of escapes) {
            markers.push({
              id: `chain-${markers.length}`,
              source: 'chain',
              code: e.code,
              severity: 'error',
              where: esc.fromLabel,
              message: `${e.message.split('.')[0]} — ${esc.hint}`,
              partId: esc.fromPartId,
            });
          }
        } else {
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
      }

      set({ markers, proposals, escapes, checkedAt: Date.now(), checkBusy: false });
    } catch (err) {
      set({ error: toError(err), checkBusy: false });
    }
  },

  runSimulate: async (numRays = 6) => {
    if (get().simBusy) return;
    const revision = getDocRevision();
    set({ simBusy: true, error: null });
    try {
      let { design, keyByPartId } = buildServiceDesign();
      let files = serviceFiles();
      let pathNames = Object.keys(design.paths ?? {});

      // Auto-chain (WP-32): E_NO_PATHS disappears from the happy path.
      if (pathNames.length === 0) {
        try {
          const adopted = await inferAndAdoptChains(files, keyByPartId);
          if (adopted.length > 0) {
            ({ design, keyByPartId } = buildServiceDesign());
            files = serviceFiles();
            pathNames = Object.keys(design.paths ?? {});
          }
        } catch (err) {
          const partIdByKey = Object.fromEntries(
            Object.entries(keyByPartId).map(([id, key]) => [key, id]),
          );
          set({ escapes: notifyChainFailure(err, partIdByKey) });
        }
      }
      if (pathNames.length === 0) {
        set({
          simBusy: false,
          error: {
            code: 'E_NO_PATHS',
            message: 'no beam path could be inferred — chain the pins manually',
          },
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
            photonBudget: result.photon_budget ?? null,
            warnings: result.warnings,
            error: null,
            multiSpot: null,
          };
        } catch (err) {
          if (err instanceof CoreServiceError && err.status !== 0) {
            simByPath[name] = {
              raysWorld: [], spot: null, paraxial: null, photonBudget: null,
              warnings: [], error: toError(err), multiSpot: null,
            };
          } else {
            throw err; // unreachable service: abort the whole run
          }
        }
      }
      // Rays traced → the beam has a home; clear any stale escape overlay.
      set({ simByPath, simRevision: revision, simBusy: false, escapes: [] });
    } catch (err) {
      set({ error: toError(err), simBusy: false });
    }
  },

  // WP-91: the fluorescence case — trace every path once per source line and
  // keep a spot per wavelength. The first line's trace doubles as the main
  // result (rays, paraxial, budget); the overlay carries the rest.
  runSimulateAllLines: async (linesUm, numRays = 6) => {
    if (get().simBusy || linesUm.length === 0) return;
    const revision = getDocRevision();
    // Paths must exist first — the plain run auto-chains (WP-32) if needed.
    if (Object.keys(buildServiceDesign().design.paths ?? {}).length === 0) {
      await get().runSimulate(numRays);
      if (Object.keys(buildServiceDesign().design.paths ?? {}).length === 0) return;
    }
    set({ simBusy: true, error: null });
    try {
      const pathNames = Object.keys(buildServiceDesign().design.paths ?? {});
      const simByPath: Record<string, PathSimResult> = {};
      for (const name of pathNames) {
        try {
          let main: PathSimResult | null = null;
          const spots: { um: number; spot: { x: number[]; y: number[] } }[] = [];
          for (const um of linesUm) {
            const files = serviceFilesAtWavelength(um);
            const result: SimulateResponse = await simulatePath(files, name, { numRays });
            const spot = cleanSpot(result.spot);
            if (spot) spots.push({ um, spot });
            main ??= {
              raysWorld: (result.rays_world ?? []) as [number, number, number][][],
              spot,
              paraxial: result.paraxial ?? null,
              photonBudget: result.photon_budget ?? null,
              warnings: result.warnings,
              error: null,
              multiSpot: null,
            };
          }
          if (main) {
            main.multiSpot = spots.length > 1 ? spots : null;
            simByPath[name] = main;
          }
        } catch (err) {
          if (err instanceof CoreServiceError && err.status !== 0) {
            simByPath[name] = {
              raysWorld: [], spot: null, paraxial: null, photonBudget: null,
              warnings: [], error: toError(err), multiSpot: null,
            };
          } else {
            throw err;
          }
        }
      }
      set({ simByPath, simRevision: revision, simBusy: false, escapes: [] });
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

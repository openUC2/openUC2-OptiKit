/**
 * Retained source design: the last imported `.dsn` document, verbatim.
 *
 * The legacy store only represents what the editor can manipulate (poses,
 * paths, DOF values). Everything else a `.dsn` carries — `optics` fragments,
 * frames/ports, `template`/`dof` declarations, `category`, location
 * components — would be lost on a store round trip. The service round trip
 * (WP-15) needs those blocks, so the importer parks the imported YAML here
 * and `serviceExport` overlays the live document state onto it when calling
 * the optikit-core service.
 *
 * `keyByPartId` links store part ids to design component keys; parts placed
 * after the import are not in it (they export as bare components).
 * `provenance` is stamped when the user accepts optimization deltas and is
 * merged into every subsequent export.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parse } from 'yaml';

export interface SourceProvenance {
  optimized_by: string;
  run: string;
  merit: Record<string, unknown>;
}

interface SourceDesignState {
  /** Raw YAML text of the imported optikit-design.yml (null = never imported). */
  yamlText: string | null;
  /** Store part id → design component key, established at import. */
  keyByPartId: Record<string, string>;
  provenance: SourceProvenance | null;
  setSource: (yamlText: string, keyByPartId: Record<string, string>) => void;
  setProvenance: (p: SourceProvenance) => void;
  clear: () => void;
}

export const useSourceDesignStore = create<SourceDesignState>()(
  persist(
    set => ({
      yamlText: null,
      keyByPartId: {},
      provenance: null,
      setSource: (yamlText, keyByPartId) =>
        set({ yamlText, keyByPartId, provenance: null }),
      setProvenance: provenance => set({ provenance }),
      clear: () => set({ yamlText: null, keyByPartId: {}, provenance: null }),
    }),
    { name: 'optikit-source-design' },
  ),
);

/** Design component key for a store part id (undefined for post-import parts). */
export function componentKeyOf(partId: string): string | undefined {
  return useSourceDesignStore.getState().keyByPartId[partId];
}

/** Store part id for a design component key (reverse lookup). */
export function partIdOfComponent(key: string): string | undefined {
  const map = useSourceDesignStore.getState().keyByPartId;
  return Object.keys(map).find(id => map[id] === key);
}

// ── source optics (real ports/frames the store cannot represent) ─────────────

/** A port's beam direction: an axis literal ('+x' … '-z') or, since WP-39,
 * a continuous unit vector in component-local axes. */
export type PortDirection = string | [number, number, number];

export interface SourcePort {
  name: string;
  /** Beam direction in component-local document axes. */
  direction: PortDirection;
  /** Datum-frame offset in component-local mm. */
  positionMm: [number, number, number];
  afterSurface: number | null;
  /** WP-46: 'fiber' takes a patch cord; '' (default) is a free-space port. */
  coupling?: '' | 'fiber';
  /** WP-79: the datum frame's [x,y,z,w] quaternion (a tilted frame tilts the
   * beam) — preserved through placement so the fold survives simulation. */
  rotation?: [number, number, number, number];
  /** WP-79: the frame's measured clear aperture, mm. */
  clearApertureMm?: number;
}

interface RawOptics {
  frames?: Record<string, Record<string, unknown>>;
  ports?: Record<
    string,
    { frame?: string; direction?: string | number[]; 'after-surface'?: number | null }
  >;
}

// Parsed once per imported YAML (module-level cache keyed by the text).
let portsCacheKey: string | null = null;
let portsCache: Record<string, SourcePort[]> = {};

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function buildPortsCache(yamlText: string): Record<string, SourcePort[]> {
  const out: Record<string, SourcePort[]> = {};
  let doc: { components?: Record<string, { optics?: RawOptics } | null> };
  try {
    doc = parse(yamlText) ?? {};
  } catch {
    return out;
  }
  for (const [key, comp] of Object.entries(doc.components ?? {})) {
    const optics = comp?.optics;
    if (!optics?.ports) continue;
    const ports: SourcePort[] = [];
    for (const [name, port] of Object.entries(optics.ports)) {
      const frame = optics.frames?.[port.frame ?? ''] ?? {};
      const raw = port.direction;
      const direction: PortDirection = Array.isArray(raw) && raw.length === 3
        ? [num(raw[0]), num(raw[1]), num(raw[2])]
        : typeof raw === 'string' && raw
          ? raw
          : '+z';
      ports.push({
        name,
        direction,
        positionMm: [num(frame['x-mm']), num(frame['y-mm']), num(frame['z-mm'])],
        afterSurface: port['after-surface'] ?? null,
      });
    }
    if (ports.length > 0) out[key] = ports;
  }
  return out;
}

/**
 * The real `optics.ports` of the imported component a part maps to (with the
 * datum-frame offsets resolved to local mm), or null for parts without a
 * retained source. The schematic uses these for pin placement and for
 * orienting the glyph along the part's true optical axis.
 */
export function sourcePortsOf(partId: string): SourcePort[] | null {
  const { yamlText, keyByPartId } = useSourceDesignStore.getState();
  if (!yamlText) return null;
  const key = keyByPartId[partId];
  if (!key) return null;
  if (portsCacheKey !== yamlText) {
    portsCache = buildPortsCache(yamlText);
    portsCacheKey = yamlText;
  }
  return portsCache[key] ?? null;
}

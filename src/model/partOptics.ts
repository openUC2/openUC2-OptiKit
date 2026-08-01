/**
 * WP-89 — the part inspector's ONE code path over the index.
 *
 * A placed part's optical facts (EFL, aperture, the per-surface prescription,
 * emission lines, ports) live in three places depending on what the part is:
 * an UNBOUND primitive's palette entry carries its own `fragmentSurfaces`
 * (WP-60 ships them in the index component), a CUBE MODULE's entry carries
 * only a `componentId` whose fragment lives on `index.components`, and a
 * workspace draft carries its record's surfaces directly. `partOpticsFacts`
 * joins them so the schematic AND assembly inspectors render from one shape.
 *
 * Everything here is read-only derivation — the inspector explains, the
 * Parts editor changes (WP-64 `?open=` deep link).
 */

import type { LibraryPaletteEntry } from '../document/libraryPalette';
import type { SourcePort } from '../document/sourceDesignStore';
import type { IndexComponent } from './libraryIndex';
import {
  fragmentSurfacesToDrafts,
  glassElements,
  paraxialEflMm,
  type FragmentSurfaceJson,
  type SurfaceDraft,
} from './componentRecord';

export interface PartOpticsFacts {
  /** The component record behind the part (deep-link target), if known. */
  componentId: string | null;
  /** Effective focal length in mm, and where the number came from. */
  eflMm: number | null;
  eflSource: 'record' | 'paraxial' | null;
  /** Clear aperture (diameter, mm) — 2 × the largest surface semi-aperture. */
  apertureMm: number | null;
  /** The prescription as displayable rows ([] = the record carries none). */
  surfaces: SurfaceDraft[];
  /** Contiguous-glass element count over the stack (WP-75 grouping). */
  elementCount: number;
  /** A source's emission lines in µm (empty for non-sources). */
  wavelengthsUm: number[];
  vendor: { name: string; mpn: string } | null;
  description: string;
}

/** The canonical entry-port names (duplicated from `schematic/ports.ts` —
 * the role is name-derived in the whole engine, there is no role field). */
const INPUT_PORT_NAMES = /^(front|sensor|in|plane)$/;

export type PortRole = 'entry' | 'exit' | 'reflected' | 'transmitted';

/** WP-89: the KiCad-pin explanation of a port — its role in the netlist. */
export function portRoleOf(name: string): PortRole {
  if (INPUT_PORT_NAMES.test(name)) return 'entry';
  if (name === 'reflected') return 'reflected';
  if (name === 'transmitted') return 'transmitted';
  return 'exit';
}

/** A port direction as a compact human label ("faces −x", "faces (0.7, 0.7, 0)"). */
export function portDirectionLabel(direction: SourcePort['direction']): string {
  if (Array.isArray(direction)) {
    return `(${direction.map(v => (Math.round(v * 100) / 100).toString()).join(', ')})`;
  }
  return String(direction);
}

/**
 * Join a placed part's palette entry with the index components into the
 * inspector's facts. `entry` may be undefined (unregistered ref) — the
 * fallback treats the libraryRef itself as a component id, which is exactly
 * the unbound case the assembly page already special-cases.
 */
export function partOpticsFacts(
  libraryRef: string,
  entry: LibraryPaletteEntry | undefined,
  components: IndexComponent[],
): PartOpticsFacts {
  const componentId = entry?.componentId ?? libraryRef;
  const indexComponent = components.find(c => c.id === componentId);

  // The entry's own fragment (unbound/workspace records) outranks the index
  // component's — for module-backed entries it is empty and the join kicks in.
  const rawSurfaces =
    (entry?.fragmentSurfaces?.length ? entry.fragmentSurfaces : indexComponent?.fragment_surfaces) ?? [];
  const surfaces = fragmentSurfacesToDrafts(rawSurfaces as FragmentSurfaceJson[]);

  const recordEfl = entry?.eflMm ?? indexComponent?.efl_mm ?? null;
  const paraxial = surfaces.length > 0 ? paraxialEflMm(surfaces) : null;
  const eflMm = recordEfl ?? paraxial;

  // No maxSemiApertureMm here — its 12.7 mm fallback would be a made-up
  // aperture; the inspector shows only what the record actually declares.
  const semis = surfaces.map(s => s.semiApertureMm ?? 0).filter(v => v > 0);
  const semi = semis.length ? Math.max(...semis) : null;

  const vendorName = indexComponent?.vendor?.name ?? '';
  const vendorMpn = indexComponent?.vendor?.mpn ?? '';

  return {
    componentId: entry?.componentId ?? (indexComponent ? componentId : null),
    eflMm,
    eflSource: recordEfl !== null ? 'record' : paraxial !== null ? 'paraxial' : null,
    apertureMm: semi !== null ? semi * 2 : null,
    surfaces,
    elementCount: glassElements(surfaces).length,
    wavelengthsUm: entry?.wavelengthsUm ?? indexComponent?.wavelengths_um ?? [],
    vendor: vendorName || vendorMpn ? { name: vendorName, mpn: vendorMpn } : null,
    description: entry?.description ?? indexComponent?.description ?? '',
  };
}

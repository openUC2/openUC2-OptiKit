/**
 * The live BOM (WP-50): placed parts grouped by library id, WITH their grid
 * locations — which parts, how many, where they sit, what they cost.
 *
 * One generator, two consumers: the BOM panel renders this and the WP-18
 * release bundle writes `BOM.csv` from the exact same function, so the
 * numbers on screen can never disagree with the manufacturing export.
 * Prices come from the registry records (never invented); an unpriced line
 * stays visibly unpriced, and a review-flagged record is marked as a draft.
 */

import { libraryEntryOf } from './libraryPalette';
import type { TemplateClass } from './libraryPalette';
import type { DocPart, Vec3 } from './types';
import { slugOf } from '../model/librarySearch';

export interface DocBomLine {
  libraryRef: string;
  /** Human-readable short name (palette name, else the id's last segment). */
  name: string;
  category: string;
  /** Id namespace: openuc2 · thorlabs · user · … ("design" for unknowns). */
  namespace: string;
  tClass: TemplateClass | null;
  /** Component record behind the module — the ?open= deep-link target. */
  componentId: string | null;
  qty: number;
  /** Grid cell of every instance, in part order — the "where". */
  cells: Vec3[];
  /** Part ids matching `cells` index-for-index — the cross-probe handles. */
  partIds: string[];
  unitPriceEur: number | null;
  /** The record still carries review flags — a draft, price it cautiously. */
  review: boolean;
}

export interface DocBom {
  lines: DocBomLine[];
  totalParts: number;
  /** Sum over PRICED lines only (unpriced lines contribute nothing). */
  pricedTotalEur: number;
  unpricedLines: number;
}


/** Group the placed parts into BOM lines (qty-desc, then name). */
export function buildDocBom(parts: DocPart[]): DocBom {
  const byRef = new Map<string, DocBomLine>();
  for (const part of parts) {
    let line = byRef.get(part.libraryRef);
    if (!line) {
      const entry = libraryEntryOf(part.libraryRef);
      line = {
        libraryRef: part.libraryRef,
        name: entry?.name ?? slugOf(part.libraryRef),
        category: entry?.category ?? part.category,
        namespace: part.libraryRef.includes('.')
          ? part.libraryRef.split('.', 1)[0]
          : 'design',
        tClass: entry?.templateClass ?? null,
        componentId: entry?.componentId ?? null,
        qty: 0,
        cells: [],
        partIds: [],
        unitPriceEur: entry?.priceEur ?? null,
        review: entry?.review ?? false,
      };
      byRef.set(part.libraryRef, line);
    }
    line.qty += 1;
    line.cells.push([...part.gridPose.cell]);
    line.partIds.push(part.id);
  }
  const lines = [...byRef.values()].sort(
    (a, b) => b.qty - a.qty || a.name.localeCompare(b.name),
  );
  return {
    lines,
    totalParts: parts.length,
    pricedTotalEur: lines.reduce(
      (sum, l) => sum + (l.unitPriceEur != null ? l.unitPriceEur * l.qty : 0),
      0,
    ),
    unpricedLines: lines.filter(l => l.unitPriceEur == null).length,
  };
}

/** CSV for the panel download AND the release bundle's BOM.csv. */
export function docBomCsv(bom: DocBom): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    ['qty', 'part', 'library-id', 'category', 'class', 'cells', 'unit-eur', 'total-eur', 'status'],
    ...bom.lines.map(l => [
      String(l.qty),
      l.name,
      l.libraryRef,
      l.category,
      l.tClass ?? '',
      l.cells.map(c => `[${c.join(' ')}]`).join(' '),
      l.unitPriceEur != null ? l.unitPriceEur.toFixed(2) : '',
      l.unitPriceEur != null ? (l.unitPriceEur * l.qty).toFixed(2) : 'unpriced',
      l.review ? 'review' : '',
    ]),
    ['', 'TOTAL', '', '', '', '',
     '', bom.pricedTotalEur.toFixed(2),
     bom.unpricedLines > 0 ? `+${bom.unpricedLines} unpriced line(s)` : ''],
  ];
  return rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
}

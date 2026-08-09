/**
 * Two-point measurement tool state (the SolidWorks-style measure verb). Its
 * own store so pointer-move updates re-render ONLY the measure overlays,
 * never the page or the rest of the scene tree.
 *
 * A "point" carries the snap label it landed on (part anchor, port datum) or
 * null for a free pick on the working plane — the label is shown so a
 * measurement says WHAT it measured, not just how far.
 */

import { create } from 'zustand';
import type { Vec3 } from '../../document';

export interface SnapPoint {
  mm: Vec3;
  /** Snapped target ("L1" part anchor, "L1.back" port datum) or null = free. */
  label: string | null;
}

export interface Measurement {
  a: SnapPoint;
  b: SnapPoint;
}

interface MeasureState {
  active: boolean;
  /** First picked point of the in-progress measurement (null = none). */
  draftA: SnapPoint | null;
  /** Live cursor point while the tool is active (drives the rubber band). */
  cursor: SnapPoint | null;
  measurements: Measurement[];
  setActive: (on: boolean) => void;
  setCursor: (p: SnapPoint | null) => void;
  /** First pick starts a measurement, second completes it. */
  pick: (p: SnapPoint) => void;
  clearDraft: () => void;
}

export const useMeasureStore = create<MeasureState>(set => ({
  active: false,
  draftA: null,
  cursor: null,
  measurements: [],
  // Leaving the tool clears everything — re-entering starts a clean sheet,
  // the same contract SolidWorks users expect from the measure dialog.
  setActive: on =>
    set(on ? { active: true } : { active: false, draftA: null, cursor: null, measurements: [] }),
  setCursor: cursor => set({ cursor }),
  pick: p =>
    set(s =>
      s.draftA
        ? { measurements: [...s.measurements, { a: s.draftA, b: p }], draftA: null }
        : { draftA: p },
    ),
  clearDraft: () => set({ draftA: null }),
}));

/** "141.4 mm (Δx 100.0, Δz 100.0)" — deltas only when more than one axis moves. */
export function measureLabel(a: Vec3, b: Vec3): string {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const total = Math.hypot(d[0], d[1], d[2]);
  const axes = (['x', 'y', 'z'] as const)
    .map((n, i) => ({ n, v: d[i] }))
    .filter(({ v }) => Math.abs(v) > 0.05);
  const detail =
    axes.length > 1 ? ` (${axes.map(({ n, v }) => `Δ${n} ${v.toFixed(1)}`).join(', ')})` : '';
  return `${total.toFixed(1)} mm${detail}`;
}

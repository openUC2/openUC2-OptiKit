/**
 * Layer visibility (WP-65) — persisted per-layer view state shared by the
 * schematic and assembly editors. Hidden layers unmount from the scenes (no
 * raycast), dimmed layers render at low opacity and non-interactive.
 *
 * Appearance precedence (see `layerAppearance`):
 *   1. the "plates & joints" sub-toggle gates interface parts entirely;
 *   2. the ACTIVE working-plane layer is always visible (KiCad discipline:
 *      you can never accidentally edit a layer you cannot see — placing on a
 *      hidden layer force-shows it instead of silently editing the void);
 *   3. solo shows only the soloed layer;
 *   4. otherwise the per-layer override applies (default: visible).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LayerOverride {
  visible: boolean;
  dimmed: boolean;
}

export type LayerAppearance = 'visible' | 'dimmed' | 'hidden';

interface LayerVisibilityState {
  /** Per-layer view override; a missing entry means fully visible. */
  overrides: Record<number, LayerOverride>;
  /** Layer being soloed, or null. Engaged via the "solo active layer" toggle. */
  soloLayer: number | null;
  /** Sub-toggle for interface parts (plates/joints/baseplates, WP-64). */
  showInterface: boolean;
  /** The working-plane layer (schematic stepper). Not persisted — the
   * stepper itself resets to L0 on reload. */
  activeLayer: number;
  setVisible: (layer: number, visible: boolean) => void;
  setDimmed: (layer: number, dimmed: boolean) => void;
  /** Chip click: visible → dimmed → hidden → visible. */
  cycleLayer: (layer: number) => void;
  /** Solo the active working-plane layer on/off. */
  toggleSolo: () => void;
  setShowInterface: (v: boolean) => void;
  setActiveLayer: (layer: number) => void;
}

const VISIBLE: LayerOverride = { visible: true, dimmed: false };

export const useLayerStore = create<LayerVisibilityState>()(
  persist(
    set => ({
      overrides: {},
      soloLayer: null,
      showInterface: true,
      activeLayer: 0,
      setVisible: (layer, visible) =>
        set(s => ({
          overrides: {
            ...s.overrides,
            [layer]: { ...(s.overrides[layer] ?? VISIBLE), visible },
          },
        })),
      setDimmed: (layer, dimmed) =>
        set(s => ({
          overrides: {
            ...s.overrides,
            [layer]: { ...(s.overrides[layer] ?? VISIBLE), dimmed },
          },
        })),
      cycleLayer: layer =>
        set(s => {
          const o = s.overrides[layer] ?? VISIBLE;
          const next: LayerOverride = !o.visible
            ? { visible: true, dimmed: false } // hidden → visible
            : o.dimmed
              ? { visible: false, dimmed: false } // dimmed → hidden
              : { visible: true, dimmed: true }; // visible → dimmed
          return { overrides: { ...s.overrides, [layer]: next } };
        }),
      toggleSolo: () =>
        set(s => ({ soloLayer: s.soloLayer === null ? s.activeLayer : null })),
      setShowInterface: v => set({ showInterface: v }),
      setActiveLayer: layer => set({ activeLayer: layer }),
    }),
    {
      name: 'optikit-layer-visibility',
      partialize: s => ({
        overrides: s.overrides,
        soloLayer: s.soloLayer,
        showInterface: s.showInterface,
      }),
    },
  ),
);

/**
 * The pure appearance rule (WP-65) used by both scenes. `layer` and
 * `isInterface` come from `classifyPart`; interface parts follow their
 * classified layer AND the "plates & joints" sub-toggle.
 */
export function layerAppearance(
  layer: number,
  isInterface: boolean,
  state: Pick<
    LayerVisibilityState,
    'overrides' | 'soloLayer' | 'showInterface' | 'activeLayer'
  >,
): LayerAppearance {
  if (isInterface && !state.showInterface) return 'hidden';
  // The working plane is always visible — a drop can never land invisibly.
  if (layer === state.activeLayer) return 'visible';
  if (state.soloLayer !== null) {
    return layer === state.soloLayer ? 'visible' : 'hidden';
  }
  const o = state.overrides[layer];
  if (!o || (o.visible && !o.dimmed)) return 'visible';
  return o.visible ? 'dimmed' : 'hidden';
}

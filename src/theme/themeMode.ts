/**
 * App-wide light/dark mode (feedback round 3): light is the default (the
 * brand guide's body colours); the toolbar toggle flips everything —
 * chrome AND the 3D/2D canvases (see sceneColors.ts) — and persists.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeModeState {
  mode: 'light' | 'dark';
  toggle: () => void;
}

export const useThemeMode = create<ThemeModeState>()(
  persist(
    set => ({
      mode: 'light',
      toggle: () => set(s => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
    }),
    { name: 'optikit-theme-mode' },
  ),
);

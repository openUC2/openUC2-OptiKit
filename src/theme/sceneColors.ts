/**
 * Canvas (three.js scene) colours per theme mode (feedback round 3: the
 * canvases follow the light/dark toggle instead of being hardwired dark).
 * Derived from the brand tokens: light canvases sit on the guide's light
 * grey, dark ones on the navy editor surface.
 */

import { useTheme } from '@mui/material/styles';

export interface SceneColors {
  /** three.js scene background. */
  background: string;
  gridCell: string;
  gridSection: string;
  /** Part reference labels (unselected). */
  label: string;
  /** Part reference labels (selected). */
  labelSelected: string;
  /** Label outline (keeps text readable over geometry). */
  labelOutline: string;
}

export const SCENE_COLORS: Record<'light' | 'dark', SceneColors> = {
  dark: {
    background: '#171c24',
    gridCell: '#3c4654',
    gridSection: '#55637a',
    label: '#aeb6c2',
    labelSelected: '#ffd24d',
    labelOutline: '#00000088',
  },
  light: {
    background: '#eef1f5',
    gridCell: '#c9d2dd',
    gridSection: '#a4b4c6',
    label: '#42506077',
    labelSelected: '#a06a00',
    labelOutline: '#ffffff88',
  },
};

/** Scene colours for the ACTIVE MUI theme (inside a ThemeProvider). */
export function useSceneColors(): SceneColors {
  const theme = useTheme();
  return SCENE_COLORS[theme.palette.mode];
}

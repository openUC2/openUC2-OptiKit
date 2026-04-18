import { useState, useEffect, useContext, createContext } from 'react';

export interface Settings3D {
  theme: 'light' | 'dark';
  showGrid: boolean;
  showAxes: boolean;
  rayMode: 'lines' | 'beams';
}

const STORAGE_KEY = 'openuc2-3d-settings';

const DEFAULTS: Settings3D = {
  theme: 'light',
  showGrid: true,
  showAxes: true,
  rayMode: 'lines',
};

export const THEMES_3D = {
  light: {
    background: '#f0f2f5',
    gridColor: '#cccccc',
    sectionColor: '#999999',
    fogColor: '#f0f2f5',
  },
  dark: {
    background: '#1a1a2e',
    gridColor: '#333355',
    sectionColor: '#555577',
    fogColor: '#1a1a2e',
  },
} as const;

export type Theme3DPalette = (typeof THEMES_3D)[keyof typeof THEMES_3D];

/** Top-level hook — call once in Editor3DPage and share via context. */
export function use3DSettings() {
  const [settings, setSettings] = useState<Settings3D>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULTS, ...(JSON.parse(stored) as Partial<Settings3D>) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  return { settings, setSettings };
}

export type Settings3DContextValue = ReturnType<typeof use3DSettings>;

// Context — provide at Editor3DPage level, consume anywhere in the subtree.
export const Settings3DContext = createContext<Settings3DContextValue | null>(null);

/** Consume the shared 3-D settings. Must be used inside a Settings3DContext.Provider. */
export function useSettings3D(): Settings3DContextValue {
  const ctx = useContext(Settings3DContext);
  if (!ctx) throw new Error('useSettings3D must be used within Settings3DContext.Provider');
  return ctx;
}

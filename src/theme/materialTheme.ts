import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { BRAND, DERIVED, FONT_STACK, RADIUS, SPACING } from './tokens';

// Palette pieces shared by both light and dark themes. contrastText is left
// to MUI's contrast algorithm where the guide gives no explicit pairing.
const brandPalette = {
  secondary: { main: BRAND.green, light: '#a3cf46', dark: DERIVED.greenDark },
  error: { main: '#d32f2f' },
  warning: { main: '#ed6c02' },
  info: { main: BRAND.turquoise, dark: DERIVED.turquoiseDark },
  success: { main: BRAND.turquoise, dark: DERIVED.turquoiseDark },
};

// Typography / shape / spacing / component overrides shared by both themes.
// Stolzl weights per the brand guide: Regular (400) for headings/CTAs,
// Thin/Book (300/400) for body. Sizes keep the compact editor scale.
const baseOptions = {
  typography: {
    fontFamily: FONT_STACK,
    h1: { fontSize: '1.75rem', fontWeight: 500, lineHeight: 1.235 },
    h2: { fontSize: '1.3rem', fontWeight: 500, lineHeight: 1.334 },
    h3: { fontSize: '1.1rem', fontWeight: 500, lineHeight: 1.6 },
    h4: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
    h5: { fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.5 },
    h6: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.57 },
    subtitle1: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.75 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.57 },
    body1: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },
    body2: { fontSize: '0.8125rem', fontWeight: 400, lineHeight: 1.43 },
    caption: { fontSize: '0.6875rem', fontWeight: 400, lineHeight: 1.66 },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 400,
      lineHeight: 2.66,
      textTransform: 'uppercase',
    },
    button: { fontWeight: 500 },
  },
  shape: {
    borderRadius: RADIUS.sm,
  },
  spacing: SPACING,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: RADIUS.sm,
          minHeight: 32,
          padding: '4px 12px',
          fontSize: '0.8125rem',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: RADIUS.sm, padding: 6 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: RADIUS.md },
        elevation1: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
        elevation2: { boxShadow: '0 4px 8px rgba(0,0,0,0.12)' },
        elevation3: { boxShadow: '0 6px 12px rgba(0,0,0,0.15)' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { borderRadius: RADIUS.md },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { height: 3, borderRadius: '3px 3px 0 0' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.8125rem',
          minHeight: 40,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        // The header is always brand blue, in both themes (guide p.2).
        colorPrimary: { backgroundColor: BRAND.blue },
      },
    },
  },
} satisfies ThemeOptions;

export const materialTheme = createTheme({
  palette: {
    mode: 'light',
    ...brandPalette,
    primary: { main: BRAND.blue, light: DERIVED.blueLight, dark: DERIVED.blueDark },
    background: { default: BRAND.lightGrey, paper: '#ffffff' },
    text: { primary: DERIVED.lightTextPrimary, secondary: '#5c6773' },
    grey: {
      50: '#fafafa', 100: '#f5f5f5', 200: '#eeeeee', 300: '#e0e0e0', 400: '#bdbdbd',
      500: BRAND.grey, 600: '#757575', 700: '#616161', 800: '#424242', 900: '#212121',
    },
  },
  ...baseOptions,
});

// Dark theme used by the editor pages. Surfaces are desaturated navy derived
// from the brand blue; primary shifts to a readable tint of it.
export const materialThemeDark = createTheme({
  palette: {
    mode: 'dark',
    ...brandPalette,
    primary: { main: DERIVED.blueLight, light: '#6b93c6', dark: BRAND.blue },
    background: { default: DERIVED.darkBg, paper: DERIVED.darkPaper },
    text: { primary: DERIVED.darkTextPrimary, secondary: DERIVED.darkTextSecondary },
    divider: 'rgba(255,255,255,0.12)',
  },
  ...baseOptions,
});

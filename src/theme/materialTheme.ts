import { createTheme, type ThemeOptions } from '@mui/material/styles';

// OpenUC2 brand colors
const brandColors = {
  primary: '#1e4670', // OpenUC2 blue
  secondary: '#7cc142', // OpenUC2 green
  tertiary: '#00a19b', // OpenUC2 teal
  error: '#d32f2f',
  warning: '#ed6c02',
  info: '#0288d1',
  success: '#2e7d32',
};

// Palette pieces shared by both light and dark themes.
const brandPalette = {
  primary: { main: brandColors.primary, light: '#4a6fa5', dark: '#153350', contrastText: '#ffffff' },
  secondary: { main: brandColors.secondary, light: '#9dd368', dark: '#5a8a2e', contrastText: '#ffffff' },
  error: { main: brandColors.error },
  warning: { main: brandColors.warning },
  info: { main: brandColors.info },
  success: { main: brandColors.success },
};

// Typography / shape / spacing / component overrides shared by both themes.
const baseOptions = {
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '1.75rem',
      fontWeight: 500,
      lineHeight: 1.235,
    },
    h2: {
      fontSize: '1.3rem',
      fontWeight: 500,
      lineHeight: 1.334,
    },
    h3: {
      fontSize: '1.1rem',
      fontWeight: 500,
      lineHeight: 1.6,
    },
    h4: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h5: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '0.8125rem',
      fontWeight: 500,
      lineHeight: 1.57,
    },
    subtitle1: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.75,
    },
    subtitle2: {
      fontSize: '0.8125rem',
      fontWeight: 500,
      lineHeight: 1.57,
    },
    body1: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.8125rem',
      fontWeight: 400,
      lineHeight: 1.43,
    },
    caption: {
      fontSize: '0.6875rem',
      fontWeight: 400,
      lineHeight: 1.66,
    },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 400,
      lineHeight: 2.66,
      textTransform: 'uppercase',
    },
  },
  shape: {
    borderRadius: 6,
  },
  spacing: 7,
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 6,
          minHeight: 32,
          padding: '4px 12px',
          fontSize: '0.8125rem',
        },
        containedPrimary: {
          backgroundColor: brandColors.primary,
          '&:hover': {
            backgroundColor: '#153350',
          },
        },
        containedSecondary: {
          backgroundColor: brandColors.secondary,
          '&:hover': {
            backgroundColor: '#5a8a2e',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: 6,
          '&:hover': {
            backgroundColor: 'rgba(30, 70, 112, 0.04)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        elevation1: {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        },
        elevation2: {
          boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
        },
        elevation3: {
          boxShadow: '0 6px 12px rgba(0,0,0,0.15)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
        indicator: {
          backgroundColor: brandColors.primary,
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.8125rem',
          minHeight: 40,
          '&.Mui-selected': {
            color: brandColors.primary,
          },
        },
      },
    },
  },
} satisfies ThemeOptions;

export const materialTheme = createTheme({
  palette: {
    mode: 'light',
    ...brandPalette,
    background: { default: '#f5f5f5', paper: '#ffffff' },
    grey: {
      50: '#fafafa', 100: '#f5f5f5', 200: '#eeeeee', 300: '#e0e0e0', 400: '#bdbdbd',
      500: '#9e9e9e', 600: '#757575', 700: '#616161', 800: '#424242', 900: '#212121',
    },
  },
  ...baseOptions,
});

// Dark theme used by the 3D editor so the whole UI (toolbar, drawers, panels)
// switches, not just the 3D scene.
export const materialThemeDark = createTheme({
  palette: {
    mode: 'dark',
    ...brandPalette,
    primary: { ...brandPalette.primary, main: '#4a6fa5' },
    background: { default: '#12121c', paper: '#1c1c2b' },
    text: { primary: '#e6e8ee', secondary: '#a9adbb' },
    divider: 'rgba(255,255,255,0.12)',
  },
  ...baseOptions,
});
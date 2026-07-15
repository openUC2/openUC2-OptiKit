/**
 * The one app shell (WP-24): brand theme + global toolbar + content frame,
 * shared by every route so switching between grid / schematic / assembly /
 * components / FRAME / setups feels like one product.
 *
 * The shell owns the ThemeProvider — pages must NOT wrap themselves in
 * another one. The default is the dark editor theme (materialThemeDark);
 * pages with a document-style surface (setup browser, FRAME wizard) can ask
 * for the light theme via the `mode` prop on their route.
 */

import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Box } from '@mui/material';
import { materialTheme, materialThemeDark } from '../theme/materialTheme';
import { Toolbar } from './Toolbar';

export function AppShell({
  children,
  mode = 'dark',
}: {
  children: ReactNode;
  mode?: 'dark' | 'light';
}) {
  // No CssBaseline here — the app root owns it; the shell's Box paints the
  // themed background over the whole viewport.
  return (
    <ThemeProvider theme={mode === 'dark' ? materialThemeDark : materialTheme}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <Toolbar />
        <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

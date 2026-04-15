import { useEffect, useState, useCallback } from 'react';
import { Box, Button, Paper } from '@mui/material';
import { ArrowBack as BackIcon, ViewInAr as View3DIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Scene3D } from '../three/Scene3D';
import { PropertyPanel } from './PropertyPanel';
import { useAppStore } from '../stores/appStore';
import type { GizmoMode } from '../three/CubeGizmo';

/**
 * 3D editor view with full drag / rotate parity.
 * Rendered at /configurator/3d via React.lazy — not included in the 2D bundle.
 */
export function Editor3DPage() {
  const navigate = useNavigate();
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate-xz');

  const clearSelection = useAppStore(s => s.clearSelection);
  const selectedItemId = useAppStore(s => s.selectedItemId);
  const removeModule = useAppStore(s => s.removeModule);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore when typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key.toLowerCase()) {
      case 'g': setGizmoMode('translate-xz'); break;
      case 'y': setGizmoMode('translate-y'); break;
      case 'r': setGizmoMode('rotate-base'); break;
      case 't': setGizmoMode('rotate-top'); break;
      case 'escape': clearSelection(); break;
      case 'delete':
      case 'backspace':
        if (selectedItemId) removeModule(selectedItemId);
        break;
    }
  }, [clearSelection, selectedItemId, removeModule]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Minimal top bar */}
      <Paper
        elevation={2}
        square
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          bgcolor: 'primary.main',
          color: 'white',
          zIndex: 1300,
        }}
      >
        <View3DIcon sx={{ mr: 0.5 }} />
        <Box sx={{ fontWeight: 500, fontSize: '1.1rem', flex: 1 }}>
          OpenUC2 — 3D View
        </Box>
        <Button
          color="inherit"
          startIcon={<BackIcon />}
          onClick={() => navigate('/configurator')}
          size="small"
          sx={{ textTransform: 'none' }}
        >
          Back to 2D
        </Button>
      </Paper>

      {/* Main content: 3D canvas + right property panel */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* 3D canvas fills remaining space */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            bgcolor: '#1a1a2e',
          }}
        >
          <Scene3D gizmoMode={gizmoMode} onGizmoModeChange={setGizmoMode} />
        </Box>

        {/* Right panel: properties */}
        <Paper
          elevation={1}
          square
          sx={{
            width: 360,
            overflowY: 'auto',
            borderLeft: '1px solid',
            borderColor: 'divider',
            p: 2,
            flexShrink: 0,
            display: { xs: 'none', md: 'block' },
          }}
        >
          <PropertyPanel />
        </Paper>
      </Box>
    </Box>
  );
}

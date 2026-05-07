import { useEffect, useState, useCallback } from 'react';
import { Box, Button, ButtonGroup, CircularProgress, Divider, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import {
  ArrowBack as BackIcon,
  ViewInAr as View3DIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  GridOn as GridOnIcon,
  GridOff as GridOffIcon,
  Adjust as AxesOnIcon,
  RadioButtonUnchecked as AxesOffIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { Scene3D } from '../three/Scene3D';
import { PropertyPanel } from './PropertyPanel';
import { useAppStore } from '../stores/appStore';
import { use3DSettings, Settings3DContext, THEMES_3D } from '../three/use3DSettings';
import type { GizmoMode } from '../three/CubeGizmo';

/**
 * 3D editor view with full drag / rotate parity.
 * Rendered at /configurator/3d via React.lazy — not included in the 2D bundle.
 */
export function Editor3DPage() {
  const navigate = useNavigate();
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate-xz');
  const settingsCtx = use3DSettings();
  const { settings, setSettings } = settingsCtx;
  const theme = THEMES_3D[settings.theme];
  const isDark = settings.theme === 'dark';

  const clearSelection = useAppStore(s => s.clearSelection);
  const selectedItemId = useAppStore(s => s.selectedItemId);
  const activeLayerId = useAppStore(s => s.activeLayerId);
  const removeModule = useAppStore(s => s.removeModule);
  const modules = useAppStore(s => s.modules);
  const loadModules = useAppStore(s => s.loadModules);
  const loadStateFromStorage = useAppStore(s => s.loadStateFromStorage);
  const placedModules = useAppStore(s => s.placedModules);
  const rotateModule = useAppStore(s => s.rotateModule);
  const rotateModuleTop = useAppStore(s => s.rotateModuleTop);
  const moveModule = useAppStore(s => s.moveModule);
  const moveModuleToLayer = useAppStore(s => s.moveModuleToLayer);

  const selectedModule = selectedItemId ? placedModules.find(m => m.id === selectedItemId) : undefined;

  // Ensure modules are loaded when refreshing directly to /configurator/3d
  useEffect(() => {
    if (modules.length === 0) {
      loadModules().then(() => loadStateFromStorage());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <Settings3DContext.Provider value={settingsCtx}>
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

        {/* ── Settings toggles ── */}
        <Tooltip title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setSettings(s => ({ ...s, theme: isDark ? 'light' : 'dark' }))}
          >
            {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Tooltip title={settings.showGrid ? 'Hide grid' : 'Show grid'}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setSettings(s => ({ ...s, showGrid: !s.showGrid }))}
          >
            {settings.showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Tooltip title={settings.showAxes ? 'Hide axes' : 'Show axes'}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => setSettings(s => ({ ...s, showAxes: !s.showAxes }))}
          >
            {settings.showAxes ? <AxesOnIcon fontSize="small" /> : <AxesOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Button
          color="inherit"
          startIcon={<BackIcon />}
          onClick={() => {
            const params = new URLSearchParams();
            if (selectedItemId) params.set('selected', selectedItemId);
            if (activeLayerId) params.set('layer', activeLayerId);
            const query = params.toString();
            navigate(`/configurator${query ? '?' + query : ''}`);
          }}
          size="small"
          sx={{ textTransform: 'none', ml: 1 }}
        >
          Back to 2D
        </Button>
      </Paper>

      {/* Main content: 3D canvas + right property panel */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Left transform panel */}
        {selectedModule && (
          <Paper
            elevation={2}
            square
            sx={{ width: 160, overflowY: 'auto', p: 1, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Rotate</Typography>

            <Typography variant="caption">Base (Z)</Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Rotate base −90°">
                <Button onClick={() => rotateModule(selectedModule.id, ((selectedModule.rotation - 90) + 360) % 360)}>
                  <RotateLeftIcon fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title="Rotate base +90°">
                <Button onClick={() => rotateModule(selectedModule.id, (selectedModule.rotation + 90) % 360)}>
                  <RotateRightIcon fontSize="small" />
                </Button>
              </Tooltip>
            </ButtonGroup>

            <Typography variant="caption">Top (Y)</Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Rotate top −90°">
                <Button onClick={() => rotateModuleTop(selectedModule.id, (((selectedModule.topRotation ?? 0) - 90) + 360) % 360)}>
                  <RotateLeftIcon fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title="Rotate top +90°">
                <Button onClick={() => rotateModuleTop(selectedModule.id, ((selectedModule.topRotation ?? 0) + 90) % 360)}>
                  <RotateRightIcon fontSize="small" />
                </Button>
              </Tooltip>
            </ButtonGroup>

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Translate (50 mm)</Typography>

            <Typography variant="caption">X axis</Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Move −50 mm (X)">
                <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x - 1, y: selectedModule.position.y })}>−X</Button>
              </Tooltip>
              <Tooltip title="Move +50 mm (X)">
                <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x + 1, y: selectedModule.position.y })}>+X</Button>
              </Tooltip>
            </ButtonGroup>

            <Typography variant="caption">Y axis</Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Move −50 mm (Y)">
                <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x, y: selectedModule.position.y - 1 })}>−Y</Button>
              </Tooltip>
              <Tooltip title="Move +50 mm (Y)">
                <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x, y: selectedModule.position.y + 1 })}>+Y</Button>
              </Tooltip>
            </ButtonGroup>

            <Typography variant="caption">Z (layer)</Typography>
            <ButtonGroup size="small" fullWidth>
              <Tooltip title="Move down one layer (−Z)">
                <Button onClick={() => moveModuleToLayer(selectedModule.id, selectedModule.layer - 1)}>−Z</Button>
              </Tooltip>
              <Tooltip title="Move up one layer (+Z)">
                <Button onClick={() => moveModuleToLayer(selectedModule.id, selectedModule.layer + 1)}>+Z</Button>
              </Tooltip>
            </ButtonGroup>
          </Paper>
        )}
        {/* 3D canvas fills remaining space */}
        <Box
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            bgcolor: theme.background,
          }}
        >
          {modules.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">Loading setup…</Typography>
            </Box>
          ) : (
            <Scene3D gizmoMode={gizmoMode} onGizmoModeChange={setGizmoMode} />
          )}
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
    </Settings3DContext.Provider>
  );
}

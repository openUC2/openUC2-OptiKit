import { useEffect, useState, useCallback } from 'react';
import {
  Box, Button, ButtonGroup, CircularProgress, Divider, Drawer, IconButton, Paper,
  Tab, Tabs, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { materialTheme, materialThemeDark } from '../theme/materialTheme';
import {
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  GridOn as GridOnIcon,
  GridOff as GridOffIcon,
  Adjust as AxesOnIcon,
  RadioButtonUnchecked as AxesOffIcon,
  Info as InfoOnIcon,
  InfoOutlined as InfoOffIcon,
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { Scene3D } from '../three/Scene3D';
import { Toolbar } from './Toolbar';
import { PartLibrary } from './PartLibrary';
import { PropertyPanel } from './PropertyPanel';
import { LayerPanel } from './LayerPanel';
import { SimulationPanel } from './SimulationPanel';
import { AnnotationPanel } from './AnnotationPanel';
import { BOMPanel } from './BOMPanel';
import { ChatPanel } from './ChatPanel';
import { useAppStore } from '../stores/appStore';
import { use3DSettings, Settings3DContext, THEMES_3D } from '../three/use3DSettings';
import type { GizmoMode } from '../three/CubeGizmo';

/**
 * 3D-first editor. Shares the toolbar, part library and right-hand panels with
 * the 2D editor — only the center surface (Scene3D vs. the Konva grid) differs.
 */
export function Editor3DPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [leftOpen, setLeftOpen] = useState(!isMobile);
  const [rightOpen, setRightOpen] = useState(!isMobile);

  const settingsCtx = use3DSettings();
  const { settings, setSettings } = settingsCtx;
  const theme = THEMES_3D[settings.theme];
  const isDark = settings.theme === 'dark';

  const clearSelection = useAppStore(s => s.clearSelection);
  const selectedItemId = useAppStore(s => s.selectedItemId);
  const removeModule = useAppStore(s => s.removeModule);
  const modules = useAppStore(s => s.modules);
  const loadModules = useAppStore(s => s.loadModules);
  const loadStateFromStorage = useAppStore(s => s.loadStateFromStorage);
  const placedModules = useAppStore(s => s.placedModules);
  const rotateModule = useAppStore(s => s.rotateModule);
  const rotateModuleTop = useAppStore(s => s.rotateModuleTop);
  const rotateModuleTilt = useAppStore(s => s.rotateModuleTilt);
  const moveModule = useAppStore(s => s.moveModule);
  const moveModuleToLayer = useAppStore(s => s.moveModuleToLayer);
  const activeRightTab = useAppStore(s => s.activeRightTab);
  const setActiveRightTab = useAppStore(s => s.setActiveRightTab);

  const selectedModule = selectedItemId ? placedModules.find(m => m.id === selectedItemId) : undefined;

  // Ensure modules are loaded when refreshing directly onto /configurator/3d
  useEffect(() => {
    if (modules.length === 0) {
      loadModules().then(() => loadStateFromStorage());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLeftOpen(!isMobile);
    setRightOpen(!isMobile);
  }, [isMobile]);

  // Screenshot: the store's File ▸ Download Screenshot dispatches this event;
  // capture the WebGL canvas (preserveDrawingBuffer is enabled in Scene3D).
  useEffect(() => {
    const onShot = () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      try {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'optikit-3d.png';
        a.click();
      } catch (e) {
        console.warn('3D screenshot failed:', e);
      }
    };
    window.addEventListener('download-screenshot', onShot);
    return () => window.removeEventListener('download-screenshot', onShot);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key.toLowerCase()) {
      case 'g': setGizmoMode('translate'); break;
      case 'r': setGizmoMode('rotate'); break;
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

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 380;

  return (
    <ThemeProvider theme={isDark ? materialThemeDark : materialTheme}>
    <Settings3DContext.Provider value={settingsCtx}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        {/* Shared toolbar (File/save, Edit, Annotate, nav, View 2D) */}
        <Toolbar />

        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Left: part library (double-tap to place into the 3D scene) */}
          <Drawer
            variant={isMobile ? 'temporary' : 'persistent'}
            anchor="left"
            open={leftOpen}
            onClose={() => setLeftOpen(false)}
            sx={{
              width: sidebarWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderRight: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <PartLibrary glbThumbnails />
          </Drawer>

          {/* Center: 3D canvas + floating overlays */}
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden', bgcolor: theme.background }}>
            {/* Left drawer toggle */}
            <Tooltip title={leftOpen ? 'Collapse parts library' : 'Expand parts library'} placement="right">
              <IconButton
                onClick={() => setLeftOpen(o => !o)}
                size="small"
                sx={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 100,
                  bgcolor: 'primary.main', color: 'white', borderRadius: '0 6px 6px 0',
                  width: 18, height: 52, minWidth: 0, p: 0, boxShadow: 2,
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                {leftOpen ? <ChevronLeftIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>

            {modules.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">Loading setup…</Typography>
              </Box>
            ) : (
              <Scene3D gizmoMode={gizmoMode} onGizmoModeChange={setGizmoMode} />
            )}

            {/* Top-right: 3D view settings */}
            <Paper
              elevation={3}
              sx={{
                position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex',
                bgcolor: isDark ? 'rgba(30,30,46,0.88)' : 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(8px)', borderRadius: 2, p: 0.25,
              }}
            >
              <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
                <IconButton size="small" onClick={() => setSettings(s => ({ ...s, theme: isDark ? 'light' : 'dark' }))}>
                  {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={settings.showGrid ? 'Hide grid' : 'Show grid'}>
                <IconButton size="small" onClick={() => setSettings(s => ({ ...s, showGrid: !s.showGrid }))}>
                  {settings.showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={settings.showAxes ? 'Hide axes' : 'Show axes'}>
                <IconButton size="small" onClick={() => setSettings(s => ({ ...s, showAxes: !s.showAxes }))}>
                  {settings.showAxes ? <AxesOnIcon fontSize="small" /> : <AxesOffIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title={settings.showInfoCard ? 'Hide module info card' : 'Show module info card'}>
                <IconButton size="small" onClick={() => setSettings(s => ({ ...s, showInfoCard: !s.showInfoCard }))}>
                  {settings.showInfoCard ? <InfoOnIcon fontSize="small" /> : <InfoOffIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Paper>

            {/* Top-left floating transform panel (shown when a module is selected) */}
            {selectedModule && (
              <Paper
                elevation={3}
                sx={{
                  position: 'absolute', top: 12, left: 28, zIndex: 10, p: 1, width: 150,
                  display: 'flex', flexDirection: 'column', gap: 0.5,
                  bgcolor: isDark ? 'rgba(30,30,46,0.92)' : 'rgba(255,255,255,0.94)',
                  backdropFilter: 'blur(8px)', borderRadius: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, flex: 1 }}>Transform</Typography>
                  <Tooltip title="Deselect (Esc)">
                    <IconButton size="small" sx={{ p: 0.25 }} onClick={() => clearSelection()}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
                  </Tooltip>
                </Box>

                <Typography variant="caption">Turn · Y</Typography>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={() => rotateModule(selectedModule.id, ((selectedModule.rotation - 90) + 360) % 360)}><RotateLeftIcon fontSize="small" /></Button>
                  <Button onClick={() => rotateModule(selectedModule.id, (selectedModule.rotation + 90) % 360)}><RotateRightIcon fontSize="small" /></Button>
                </ButtonGroup>

                <Typography variant="caption">Tilt · X</Typography>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={() => rotateModuleTilt(selectedModule.id, (((selectedModule.tiltRotation ?? 0) - 90) + 360) % 360)}><RotateLeftIcon fontSize="small" /></Button>
                  <Button onClick={() => rotateModuleTilt(selectedModule.id, ((selectedModule.tiltRotation ?? 0) + 90) % 360)}><RotateRightIcon fontSize="small" /></Button>
                </ButtonGroup>

                <Typography variant="caption">Roll · Z</Typography>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={() => rotateModuleTop(selectedModule.id, (((selectedModule.topRotation ?? 0) - 90) + 360) % 360)}><RotateLeftIcon fontSize="small" /></Button>
                  <Button onClick={() => rotateModuleTop(selectedModule.id, ((selectedModule.topRotation ?? 0) + 90) % 360)}><RotateRightIcon fontSize="small" /></Button>
                </ButtonGroup>

                <Divider sx={{ my: 0.25 }} />
                <Typography variant="caption">Move X / Y (50 mm)</Typography>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x - 1, y: selectedModule.position.y })}>−X</Button>
                  <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x + 1, y: selectedModule.position.y })}>+X</Button>
                  <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x, y: selectedModule.position.y - 1 })}>−Y</Button>
                  <Button onClick={() => moveModule(selectedModule.id, { x: selectedModule.position.x, y: selectedModule.position.y + 1 })}>+Y</Button>
                </ButtonGroup>
                <Typography variant="caption">Layer (Z)</Typography>
                <ButtonGroup size="small" fullWidth>
                  <Button onClick={() => moveModuleToLayer(selectedModule.id, selectedModule.layer - 1)}>−Z</Button>
                  <Button onClick={() => moveModuleToLayer(selectedModule.id, selectedModule.layer + 1)}>+Z</Button>
                </ButtonGroup>
              </Paper>
            )}

            {/* Right drawer toggle */}
            <Tooltip title={rightOpen ? 'Collapse settings panel' : 'Expand settings panel'} placement="left">
              <IconButton
                onClick={() => setRightOpen(o => !o)}
                size="small"
                sx={{
                  position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 100,
                  bgcolor: 'primary.main', color: 'white', borderRadius: '6px 0 0 6px',
                  width: 18, height: 52, minWidth: 0, p: 0, boxShadow: 2,
                  '&:hover': { bgcolor: 'primary.dark' },
                }}
              >
                {rightOpen ? <ChevronRightIcon sx={{ fontSize: 14 }} /> : <ChevronLeftIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>
          </Box>

          {/* Right: identical tabbed panel to the 2D editor */}
          <Drawer
            variant={isMobile ? 'temporary' : 'persistent'}
            anchor="right"
            open={rightOpen}
            onClose={() => setRightOpen(false)}
            sx={{
              width: sidebarWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderLeft: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Tabs
                value={activeRightTab}
                onChange={(_, v) => setActiveRightTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 48, '& .MuiTab-root': { minWidth: 'auto', px: 2 } }}
              >
                <Tab label="Layers" value="layers" />
                <Tab label="Properties" value="properties" />
                <Tab label="Simulation" value="simulation" />
                <Tab label="Annotations" value="annotations" />
                <Tab label="BOM/Quote" value="bom" />
                <Tab label="Chat" value="chat" />
              </Tabs>
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {activeRightTab === 'layers' && <LayerPanel />}
                {activeRightTab === 'properties' && <PropertyPanel />}
                {activeRightTab === 'simulation' && <SimulationPanel />}
                {activeRightTab === 'annotations' && <AnnotationPanel />}
                {activeRightTab === 'bom' && <BOMPanel />}
                {activeRightTab === 'chat' && <ChatPanel />}
              </Box>
            </Box>
          </Drawer>
        </Box>
      </Box>
    </Settings3DContext.Provider>
    </ThemeProvider>
  );
}

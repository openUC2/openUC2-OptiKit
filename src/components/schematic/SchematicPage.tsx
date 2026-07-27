/**
 * 2.5D schematic ("optical layout") editor page — the 3DOptix-like view.
 * Layout mirrors Editor3DPage (shared Toolbar + PartLibrary), but the center
 * surface renders schematic glyphs on a working plane and all state flows
 * through the src/document facade.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  GridOn as SnapGridIcon,
  HelpOutline as HelpIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Rotate90DegreesCcw as SnapYawIcon,
  Timeline as RaysIcon,
  Cable as FiberIcon,
  Receipt as BomIcon,
  KeyboardArrowDown as DownIcon,
  KeyboardArrowUp as UpIcon,
} from '@mui/icons-material';
import * as THREE from 'three';
import { PartLibrary } from '../PartLibrary';
import { useAppStore } from '../../stores/appStore';
import type { PortRef } from '../../document';
import {
  addFiber,
  addPart,
  getPart,
  listParts,
  removePart,
  selectPart,
  setPath,
  useDocPaths,
  useSelectedPartId,
  UC2_GRID_MM,
} from '../../document';
import { isFiberPort } from './ports';
import { SchematicScene } from './SchematicScene';
import type { SchematicSettings } from './SchematicScene';
import { SchematicLegend, LEGEND_SEEN_KEY } from './SchematicLegend';
import { BomDialog } from '../bom/BomDialog';
import { SchematicPropertyPanel } from './SchematicPropertyPanel';
import { ServicePanel } from './ServicePanel';

export function SchematicPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [leftOpen, setLeftOpen] = useState(!isMobile);
  const [rightOpen, setRightOpen] = useState(!isMobile);

  const [settings, setSettings] = useState<SchematicSettings>({
    planeZMm: 0,
    snapGrid: false,
    snapYaw: false,
    showRays: true,
    lockView: true,
  });
  // Affordance legend (WP-23): opens itself once, then lives behind "?".
  const [legendOpen, setLegendOpen] = useState(
    () => localStorage.getItem(LEGEND_SEEN_KEY) !== '1',
  );
  const closeLegend = () => {
    localStorage.setItem(LEGEND_SEEN_KEY, '1');
    setLegendOpen(false);
  };
  // The live BOM (WP-50) — shared dialog, also mounted from the assembly.
  const [bomOpen, setBomOpen] = useState(false);
  const [chainDraft, setChainDraft] = useState<PortRef[] | null>(null);
  // WP-46: in fiber mode a pin click starts/ends a patch cord instead of
  // extending a beam chain.
  const [fiberMode, setFiberMode] = useState(false);
  const [fiberDraft, setFiberDraft] = useState<PortRef | null>(null);
  const paths = useDocPaths();
  const activePathName = `path-${paths.length + 1}`;

  const selectedId = useSelectedPartId();
  const modules = useAppStore(s => s.modules);
  const loadModules = useAppStore(s => s.loadModules);
  const loadStateFromStorage = useAppStore(s => s.loadStateFromStorage);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);

  /** ERC marker click: frame the part without changing the view direction. */
  const zoomToPart = useCallback((partId: string) => {
    const part = getPart(partId);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!part || !camera || !controls) return;
    const [x, y, z] = part.worldPose.positionMm;
    const target = new THREE.Vector3(x, z, -y);
    const offset = camera.position.clone().sub(controls.target);
    const distance = Math.max(180, Math.min(400, offset.length()));
    offset.setLength(distance);
    controls.target.copy(target);
    camera.position.copy(target.clone().add(offset));
    controls.update();
  }, []);

  useEffect(() => {
    if (modules.length === 0) {
      loadModules().then(() => loadStateFromStorage());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Share links (WP-54): ?d=<inline payload> / ?design=<hosted url> load a
  // design into the session once the palette modules are registered.
  const shareConsumedRef = useRef(false);
  useEffect(() => {
    if (shareConsumedRef.current || modules.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const inline = params.get('d');
    const hosted = params.get('design');
    if (!inline && !hosted) return;
    shareConsumedRef.current = true;
    (async () => {
      const { decodeShareParam, fetchDesignUrl } = await import('../../model/shareLink');
      const { importDsnFiles } = await import('../../model/dsn');
      const files = inline ? await decodeShareParam(inline) : await fetchDesignUrl(hosted!);
      const report = importDsnFiles(files);
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'shared design loaded',
        message: `${report.placed} part(s) placed as an editable copy`,
        duration: 6000,
      });
      // The link did its job — keep the URL clean for further sharing.
      params.delete('d');
      params.delete('design');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
    })().catch(err => {
      useAppStore.getState().addNotification({
        type: 'error',
        title: 'could not load the shared design',
        message: err instanceof Error ? err.message : String(err),
        duration: 8000,
      });
    });
  }, [modules.length]);

  // Cross-probing (WP-17): arriving from another view with a selection frames
  // the selected part here (selection itself is document-level already).
  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => zoomToPart(selectedId), 350); // scene mount
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DEV-only: expose the document facade + .dsn session for console debugging
  // and e2e drivers.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    import('../../document').then(doc => {
      (window as unknown as Record<string, unknown>).__optikitDoc = doc;
    });
    import('../../model/dsn/session').then(session => {
      (window as unknown as Record<string, unknown>).__optikitSession = session;
    });
  }, []);

  // ── chaining / fibers ───────────────────────────────────────────────────────
  const onPinClick = useCallback(
    (ref: PortRef) => {
      if (fiberMode) {
        // First click picks the near connector, second lays the cord.
        setFiberDraft(from => {
          if (from === null) return ref;
          if (from === ref) return null; // clicking the same pin cancels
          const id = addFiber(from, ref);
          const placed = listParts();
          const freeSpace = [from, ref].filter(r => !isFiberPort(placed, r));
          useAppStore.getState().addNotification({
            type: freeSpace.length > 0 ? 'warning' : 'success',
            title: freeSpace.length > 0 ? 'fiber on a free-space port' : 'fiber added',
            message:
              freeSpace.length > 0
                ? `${freeSpace.join(', ')} ${freeSpace.length > 1 ? 'are' : 'is'} not ` +
                  'declared `coupling: fiber` — the link is drawn, but check the record'
                : `${from} → ${ref} (${id})`,
            duration: 7000,
          });
          return null;
        });
        return;
      }
      setChainDraft(draft => {
        if (draft === null) return [ref];
        if (draft[draft.length - 1] === ref) return draft; // ignore double click on same pin
        return [...draft, ref];
      });
    },
    [fiberMode],
  );

  const finishChain = useCallback(() => {
    setChainDraft(draft => {
      if (draft && draft.length >= 2) setPath(activePathName, draft);
      return null;
    });
  }, [activePathName]);

  // ── keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case 'Escape':
          if (fiberDraft) setFiberDraft(null);
          else if (fiberMode) setFiberMode(false);
          else if (chainDraft) setChainDraft(null);
          else selectPart(null);
          break;
        case 'Enter':
          if (chainDraft) finishChain();
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedId) removePart(selectedId);
          break;
        case 's':
          setSettings(s => ({ ...s, snapGrid: !s.snapGrid }));
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chainDraft, fiberDraft, fiberMode, finishChain, selectedId]);

  // ── drop from the part library ─────────────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const moduleId = e.dataTransfer.getData('moduleId');
      const cam = cameraRef.current;
      const canvas = (e.currentTarget as HTMLElement).querySelector('canvas');
      if (!moduleId || !cam || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, cam);
      const hit = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -settings.planeZMm);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      let x = hit.x;
      let y = -hit.z;
      if (settings.snapGrid) {
        x = Math.round(x / UC2_GRID_MM[0]) * UC2_GRID_MM[0];
        y = Math.round(y / UC2_GRID_MM[1]) * UC2_GRID_MM[1];
      }
      addPart(moduleId, [x, y, settings.planeZMm]);
    },
    [settings.planeZMm, settings.snapGrid],
  );

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 380;
  const layerIndex = Math.round(settings.planeZMm / UC2_GRID_MM[2]);

  // Rendered inside the AppShell (WP-24): the shell provides theme + toolbar.
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Drawer
            variant={isMobile ? 'temporary' : 'persistent'}
            anchor="left"
            open={leftOpen}
            onClose={() => setLeftOpen(false)}
            sx={{
              // WP-64: a closed persistent drawer must release its flex width —
              // its root otherwise keeps reserving `sidebarWidth`, leaving a
              // dead white strip beside the canvas (the R3F canvas only tracks
              // its own container's size).
              width: leftOpen ? sidebarWidth : 0,
              flexShrink: 0,
              transition: muiTheme.transitions.create('width'),
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderRight: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            {/* Schematic palette: optical symbols, not cube renders (WP-23). */}
            <PartLibrary opticalGlyphs />
          </Drawer>

          <Box
            sx={{ flexGrow: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}
            onDragOver={e => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={handleDrop}
          >
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

            <SchematicScene
              settings={settings}
              chainDraft={chainDraft}
              onPinClick={onPinClick}
              cameraRef={cameraRef}
              controlsRef={controlsRef}
            />
            {legendOpen && <SchematicLegend onClose={closeLegend} />}
            <BomDialog open={bomOpen} onClose={() => setBomOpen(false)} />

            {/* Bottom toolbar: snap / rays / working plane */}
            <Paper
              elevation={3}
              sx={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5,
                bgcolor: 'background.paper', backdropFilter: 'blur(8px)', borderRadius: 2,
                border: '1px solid', borderColor: 'divider',
              }}
            >
              <Tooltip title="Snap to 50 mm grid (S) — off by default in the schematic">
                <ToggleButton
                  value="snapGrid"
                  selected={settings.snapGrid}
                  size="small"
                  onChange={() => setSettings(s => ({ ...s, snapGrid: !s.snapGrid }))}
                >
                  <SnapGridIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Snap yaw to 90°">
                <ToggleButton
                  value="snapYaw"
                  selected={settings.snapYaw}
                  size="small"
                  onChange={() => setSettings(s => ({ ...s, snapYaw: !s.snapYaw }))}
                >
                  <SnapYawIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Live 2D ray preview (in-plane approximation)">
                <ToggleButton
                  value="rays"
                  selected={settings.showRays}
                  size="small"
                  onChange={() => setSettings(s => ({ ...s, showRays: !s.showRays }))}
                  sx={{ '&.Mui-selected': { color: 'info.main' } }}
                >
                  <RaysIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Fiber tool (WP-46): click two port pins to lay a patch cord — no geometric constraint between them">
                <ToggleButton
                  value="fiber"
                  selected={fiberMode}
                  size="small"
                  onChange={() => {
                    setFiberMode(v => !v);
                    setFiberDraft(null);
                    setChainDraft(null);
                  }}
                  sx={{ '&.Mui-selected': { color: 'warning.main' } }}
                >
                  <FiberIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip
                title={settings.lockView
                  ? 'View locked (SimCity mode): left button is for parts; right-drag orbits. Click to unlock free orbit.'
                  : 'View unlocked: left-drag orbits. Click to lock the view for part editing.'}
              >
                <ToggleButton
                  value="lockView"
                  selected={settings.lockView}
                  size="small"
                  onChange={() => setSettings(s => ({ ...s, lockView: !s.lockView }))}
                >
                  {settings.lockView ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </ToggleButton>
              </Tooltip>
              <Tooltip title="What do the pins, rings and colors mean?">
                <ToggleButton
                  value="legend"
                  selected={legendOpen}
                  size="small"
                  onChange={() => (legendOpen ? closeLegend() : setLegendOpen(true))}
                >
                  <HelpIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Bill of materials — parts, quantities, grid cells, prices (WP-50)">
                <ToggleButton
                  value="bom"
                  selected={bomOpen}
                  size="small"
                  onChange={() => setBomOpen(v => !v)}
                >
                  <BomIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>

              <Stack alignItems="center" sx={{ px: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                  working plane
                </Typography>
                <Stack direction="row" alignItems="center">
                  <IconButton
                    size="small"
                    onClick={() => setSettings(s => ({ ...s, planeZMm: s.planeZMm - UC2_GRID_MM[2] }))}
                  >
                    <DownIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="body2" sx={{ minWidth: 86, textAlign: 'center' }}>
                    L{layerIndex} · {settings.planeZMm.toFixed(0)} mm
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setSettings(s => ({ ...s, planeZMm: s.planeZMm + UC2_GRID_MM[2] }))}
                  >
                    <UpIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>

            {/* Hint chip while chaining */}
            {chainDraft && (
              <Paper
                sx={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 10, px: 2, py: 0.75, bgcolor: 'success.main', color: 'success.contrastText',
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2">
                  Chaining “{activePathName}” — {chainDraft.length} port(s) · Enter to finish · Esc to cancel
                </Typography>
              </Paper>
            )}

            {/* Hint chip while laying a fiber (WP-46) */}
            {fiberMode && (
              <Paper
                sx={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 10, px: 2, py: 0.75, bgcolor: 'warning.main', color: 'warning.contrastText',
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2">
                  {fiberDraft
                    ? `Fiber from ${fiberDraft} — click the far connector · Esc to cancel`
                    : 'Fiber tool — click the first port pin · Esc to leave'}
                </Typography>
              </Paper>
            )}

            <Tooltip title={rightOpen ? 'Collapse properties' : 'Expand properties'} placement="left">
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

          <Drawer
            variant={isMobile ? 'temporary' : 'persistent'}
            anchor="right"
            open={rightOpen}
            onClose={() => setRightOpen(false)}
            sx={{
              // WP-64: see the left drawer — width 0 when closed.
              width: rightOpen ? sidebarWidth : 0,
              flexShrink: 0,
              transition: muiTheme.transitions.create('width'),
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderLeft: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <SchematicPropertyPanel
                chainDraft={chainDraft}
                activePathName={activePathName}
                onFinishChain={finishChain}
                onCancelChain={() => setChainDraft(null)}
              />
              <ServicePanel onZoomToPart={zoomToPart} />
            </Box>
          </Drawer>
    </Box>
  );
}

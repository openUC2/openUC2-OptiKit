/**
 * Assembly ("board") editor page — WP-16, the PCB-editor counterpart of the
 * schematic. Cube modules on the 50/50/55 grid, cubify review, DRC markers,
 * and constrained T2 insert dragging. All state flows through src/document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import {
  Apps as CubifyIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Rule as DrcIcon,
} from '@mui/icons-material';
import * as THREE from 'three';
import { materialThemeDark } from '../../theme/materialTheme';
import { Toolbar } from '../Toolbar';
// Same legacy bootstrap as SchematicPage/Editor3DPage: the module catalog and
// the stored layout live in appStore until the .dsn document replaces it.
import { useAppStore } from '../../stores/appStore';
import {
  getPart,
  selectPart,
  useDocParts,
  useDocRevision,
  useSelectedPartId,
} from '../../document';
import { listPartMechanics } from '../../model/dsn/serviceExport';
import { MarkerList } from '../schematic/MarkerList';
import { AssemblyScene } from './AssemblyScene';
import { CubifyDialog } from './CubifyDialog';
import { useAssemblyStore } from './assemblyStore';

export function AssemblyPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [rightOpen] = useState(true);
  const [lockView, setLockView] = useState(true);
  const store = useAssemblyStore();
  const revision = useDocRevision();
  const parts = useDocParts();
  const selectedId = useSelectedPartId();
  const selected = parts.find(p => p.id === selectedId);

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);

  const modules = useAppStore(s => s.modules);
  const loadModules = useAppStore(s => s.loadModules);
  const loadStateFromStorage = useAppStore(s => s.loadStateFromStorage);
  useEffect(() => {
    if (modules.length === 0) {
      loadModules().then(() => loadStateFromStorage());
    } else if (useAppStore.getState().placedModules.length === 0) {
      // Modules already loaded by another view; still restore the layout.
      loadStateFromStorage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mechanics (template classes + draggable DOFs) from the merged design.
  // Recomputed per document revision — cheap (pure YAML merge, no network).
  const mechanics = useMemo(() => {
    void revision;
    try {
      return listPartMechanics();
    } catch {
      return [];
    }
  }, [revision]);
  const selectedMechanics = mechanics.find(m => m.partId === selectedId);

  const zoomToPart = useCallback((partId: string) => {
    const part = getPart(partId);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!part || !camera || !controls) return;
    const [x, y, z] = part.worldPose.positionMm;
    const target = new THREE.Vector3(x, z, -y);
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(Math.max(200, Math.min(500, offset.length())));
    controls.target.copy(target);
    camera.position.copy(target.clone().add(offset));
    controls.update();
  }, []);

  const jump = (partId: string) => {
    selectPart(partId);
    zoomToPart(partId);
  };

  // Cross-probing (WP-17): frame the document-level selection on arrival.
  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => zoomToPart(selectedId), 350); // scene mount
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 360;
  const cubifyState =
    store.cubifiedRevision === null
      ? null
      : store.cubifiedRevision === revision
        ? ('current' as const)
        : ('outdated' as const);

  return (
    <ThemeProvider theme={materialThemeDark}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <Toolbar />
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
            <AssemblyScene
              mechanics={mechanics}
              lockView={lockView}
              cameraRef={cameraRef}
              controlsRef={controlsRef}
            />
            <Tooltip
              title={lockView
                ? 'View locked: left button selects/drags; right-drag orbits. Click to unlock.'
                : 'View unlocked: left-drag orbits. Click to lock for part editing.'}
            >
              <ToggleButton
                value="lockView" size="small" selected={lockView}
                onChange={() => setLockView(v => !v)}
                sx={{
                  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  bgcolor: 'rgba(23,28,36,0.88)', zIndex: 10,
                }}
              >
                {lockView ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
              </ToggleButton>
            </Tooltip>
            {parts.length === 0 && (
              <Alert
                severity="info"
                sx={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}
              >
                the document is empty — place parts in the schematic or import a .dsn
              </Alert>
            )}
          </Box>

          <Drawer
            variant="persistent"
            anchor="right"
            open={rightOpen}
            sx={{
              width: sidebarWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderLeft: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Assembly</Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
                <Button
                  size="small" variant="outlined"
                  startIcon={store.busy ? <CircularProgress size={12} /> : <CubifyIcon />}
                  onClick={() => void store.runCubify()} disabled={store.busy}
                >
                  cubify
                </Button>
                <Button
                  size="small" variant="outlined"
                  startIcon={store.busy ? <CircularProgress size={12} /> : <DrcIcon />}
                  onClick={() => void store.refreshDrc()} disabled={store.busy}
                >
                  run DRC
                </Button>
              </Stack>

              {cubifyState && (
                <Chip
                  size="small" variant="outlined" sx={{ mb: 1 }}
                  color={cubifyState === 'current' ? 'success' : 'default'}
                  label={cubifyState === 'current' ? 'grid poses: accepted' : 'grid poses: outdated (document changed)'}
                />
              )}

              {store.error && (
                <Alert severity="error" onClose={store.clearError} sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{store.error.code}</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>{store.error.message}</Typography>
                </Alert>
              )}

              {/* ── DRC markers ──────────────────────────────────────────── */}
              {store.markers.length > 0 ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    {store.markers.length} design-rule finding(s)
                  </Typography>
                  <MarkerList markers={store.markers} onJump={jump} maxHeight={260} />
                </>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  no design-rule findings
                </Typography>
              )}

              {/* ── selected part ────────────────────────────────────────── */}
              {selected && (
                <Box sx={{ mt: 2 }}>
                  <Divider sx={{ mb: 1 }}>
                    <Typography variant="overline">{selected.ref}</Typography>
                  </Divider>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    category: {selected.category}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    template:{' '}
                    {selectedMechanics?.templateClass
                      ? { fixed: 'T1 fixed (insert locked)', adaptive: 'T2 adaptive', generative: 'T3 generative' }[
                          selectedMechanics.templateClass
                        ] ?? selectedMechanics.templateClass
                      : 'none bound'}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    cell: [{selected.gridPose.cell.join(', ')}] · offset-mm: [
                    {selected.gridPose.offsetMm.map(v => v.toFixed(2)).join(', ')}]
                  </Typography>
                  {/* offset-deg: numeric display only, deliberately not draggable */}
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    offset-deg (residual yaw): {selected.gridPose.residualYawDeg.toFixed(3)}°
                  </Typography>
                  {selectedMechanics?.translationDofs.map(dof => {
                    const value = selected.dofs.find(d => d.name === dof.name)?.value ?? dof.value;
                    return (
                      <TextField
                        key={dof.key}
                        size="small" type="number" label={`${dof.name} (${dof.unit}) ∈ [${dof.range[0]}, ${dof.range[1]}]`}
                        value={value}
                        sx={{ mt: 1, width: 220 }}
                        InputProps={{ readOnly: true }}
                      />
                    );
                  })}
                </Box>
              )}
            </Box>
          </Drawer>
        </Box>
      </Box>
      <CubifyDialog />
    </ThemeProvider>
  );
}

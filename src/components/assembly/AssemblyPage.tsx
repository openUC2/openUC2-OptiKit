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
  IconButton,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Apps as CubifyIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Receipt as BomIcon,
  Rule as DrcIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
// Same legacy bootstrap as SchematicPage: the module catalog and the stored
// layout live in appStore until the .dsn document replaces it.
import { useAppStore } from '../../stores/appStore';
import {
  T_CLASS_LABEL,
  getPart,
  libraryEntryOf,
  selectPart,
  useDocParts,
  useDocRevision,
  useSelectedPartId,
} from '../../document';
import { assetsBaseUrl, useLibraryIndex } from '../../model/libraryIndex';
import { listPartMechanics } from '../../model/dsn/serviceExport';
import { BomDialog } from '../bom/BomDialog';
import { MarkerList } from '../schematic/MarkerList';
import { AssemblyScene } from './AssemblyScene';
import { CubifyDialog } from './CubifyDialog';
import { GenerateHolderDialog } from './GenerateHolderDialog';
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
  const navigate = useNavigate();
  // WP-37: View 3D retired here.
  const [showRetireNotice, setShowRetireNotice] = useState(
    () => new URLSearchParams(window.location.search).get('from') === '3d',
  );
  // The optical component this cube's insert realizes (WP-37): link to the editor.
  const selectedEntry = selected ? libraryEntryOf(selected.libraryRef) : undefined;
  // WP-51.1: the raw index module — versions, assets and electronics for the
  // composition card ("cube + insert + part" in one place).
  const index = useLibraryIndex();
  const selectedIndexModule = selected
    ? index.modules.find(m => m.id === selected.libraryRef)
    : undefined;
  const selectedStepUrl = selectedIndexModule?.assets?.step
    ? `${assetsBaseUrl(index.url)}${selectedIndexModule.assets.step}`
    : null;
  const selectedElectronics = (selectedIndexModule?.electronics ?? null) as {
    'firmware-contract'?: string;
    'axis-map': { dof: string; 'can-object': number | string }[];
  } | null;
  // WP-51.2: the T-class comes from the INDEX, not the palette entry — the
  // assembly does not mount PartLibrary, so palette registration is absent
  // here and an entry-derived chip would silently never render.
  const selectedTClass = selectedIndexModule?.template?.class ?? null;
  // WP-60: bare component ids no module binds — sourced from the INDEX for
  // the same reason as the T-class above.
  const unboundIds = useMemo(() => {
    const moduleIds = new Set(index.modules.map(m => m.id));
    return new Set(
      index.components.map(c => c.id).filter(id => !moduleIds.has(id)),
    );
  }, [index.modules, index.components]);
  const selectedUnbound = Boolean(selected && unboundIds.has(selected.libraryRef));
  const selectedIndexComponent = selectedUnbound
    ? index.components.find(c => c.id === selected!.libraryRef)
    : undefined;
  // The live BOM (WP-50) — the same dialog the schematic mounts.
  const [bomOpen, setBomOpen] = useState(false);
  // WP-61: "generate a holder…" on a placed unbound part.
  const [generateOpen, setGenerateOpen] = useState(false);

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

  // Rendered inside the AppShell (WP-24): the shell provides theme + toolbar.
  return (
    <>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
            <AssemblyScene
              mechanics={mechanics}
              unboundIds={unboundIds}
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
                  bgcolor: 'background.paper', boxShadow: 3, zIndex: 10,
                  border: '1px solid', borderColor: 'divider',
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
                <Button
                  size="small" variant="outlined" startIcon={<BomIcon />}
                  onClick={() => setBomOpen(true)}
                >
                  BOM
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
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="overline">{selected.ref}</Typography>
                      {/* WP-51.2: the T-class badge on the placed part */}
                      {selectedTClass && (
                        <Chip size="small" label={T_CLASS_LABEL[selectedTClass]}
                          sx={{ height: 16, fontSize: 10, fontWeight: 700 }} />
                      )}
                      {/* WP-60: a bare symbol — no mechanics at all */}
                      {selectedUnbound && (
                        <Tooltip title="an optical primitive with no mechanics yet — place it, then generate a holder (WP-61)">
                          <Chip size="small" label="UNBOUND" color="info" variant="outlined"
                            sx={{ height: 16, fontSize: 10, fontWeight: 700 }} />
                        </Tooltip>
                      )}
                    </Stack>
                  </Divider>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    category: {selected.category}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    cell: [{selected.gridPose.cell.join(', ')}] · offset-mm: [
                    {selected.gridPose.offsetMm.map(v => v.toFixed(2)).join(', ')}]
                  </Typography>
                  {/* offset-deg: numeric display only, deliberately not draggable */}
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    offset-deg (residual yaw): {selected.gridPose.residualYawDeg.toFixed(3)}°
                  </Typography>

                  {/* WP-51.1: the module composition card — cube + insert +
                      part in ONE place, each line deep-linking its editor. */}
                  {/* WP-60: an unbound part is the symbol alone — no module,
                      no template. Show the record facts and the one verb that
                      matters: put it in a cube (WP-61). */}
                  {selectedUnbound ? (
                    <Box sx={{ mt: 1.5, p: 1.5, border: '1px dashed', borderColor: 'info.main', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Optical primitive · {selected.libraryRef}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" sx={{ flex: 1 }}>
                          ◐ {selected.libraryRef}
                          {selectedIndexComponent && ` @ ${selectedIndexComponent.version}`}
                        </Typography>
                        <Tooltip title="open in the component editor">
                          <IconButton size="small" onClick={() =>
                            navigate(`/configurator/components?open=${encodeURIComponent(selected.libraryRef)}`)}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        ▣ no mechanics bound — floats freely, claims no grid cell
                      </Typography>
                      {selectedIndexComponent?.vendor?.name && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          vendor: {selectedIndexComponent.vendor.name}
                          {selectedIndexComponent.vendor.mpn && ` · ${selectedIndexComponent.vendor.mpn}`}
                        </Typography>
                      )}
                      {selectedIndexComponent?.efl_mm != null && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          EFL: {selectedIndexComponent.efl_mm.toFixed(2)} mm
                        </Typography>
                      )}
                      <Tooltip title="print a cube holder around the placed optic (WP-61)">
                        <Button
                          size="small" variant="contained" sx={{ mt: 1 }}
                          onClick={() => setGenerateOpen(true)}
                        >
                          generate a holder…
                        </Button>
                      </Tooltip>
                    </Box>
                  ) : (
                  <Box sx={{ mt: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Module composition · {selected.libraryRef}
                    </Typography>
                    {/* component (the optical "symbol") */}
                    {selectedIndexModule?.component ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" sx={{ flex: 1 }}>
                          ◐ {selectedIndexModule.component.ref}
                          {selectedIndexModule.component.resolved && ` → ${selectedIndexModule.component.resolved}`}
                        </Typography>
                        {selectedEntry?.componentId && (
                          <Tooltip title="open in the component editor">
                            <IconButton size="small" onClick={() =>
                              navigate(`/configurator/components?open=${encodeURIComponent(selectedEntry.componentId!)}`)}>
                              <EditIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="caption" sx={{ display: 'block' }}>◐ no component bound</Typography>
                    )}
                    {/* template (the mechanical "footprint") */}
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption" sx={{ flex: 1 }}>
                        ▣ {selectedIndexModule?.template?.ref ?? 'no template bound'}
                        {selectedIndexModule?.template?.resolved && ` → ${selectedIndexModule.template.resolved}`}
                      </Typography>
                      {selectedTClass && (
                        <Chip size="small" label={T_CLASS_LABEL[selectedTClass]}
                          sx={{ height: 14, fontSize: 9 }} />
                      )}
                    </Stack>
                    {/* mechanics assets */}
                    <Stack direction="row" spacing={1}>
                      {selectedEntry?.glbUrl && (
                        <Typography variant="caption" component="a" href={selectedEntry.glbUrl}
                          target="_blank" rel="noreferrer" sx={{ color: 'primary.main' }}>
                          GLB ↗
                        </Typography>
                      )}
                      {selectedStepUrl && (
                        <Typography variant="caption" component="a" href={selectedStepUrl}
                          target="_blank" rel="noreferrer" sx={{ color: 'primary.main' }}>
                          STEP ↗
                        </Typography>
                      )}
                      {!selectedEntry?.glbUrl && !selectedStepUrl && (
                        <Typography variant="caption" color="text.secondary">no mesh assets</Typography>
                      )}
                    </Stack>
                    {/* electronics (the WP-42 actuation contract) */}
                    {selectedElectronics && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                        ⚡ {selectedElectronics['firmware-contract'] || 'firmware'} ·{' '}
                        {selectedElectronics['axis-map']
                          .map(e => `${e.dof}→${typeof e['can-object'] === 'number'
                            ? '0x' + e['can-object'].toString(16) : e['can-object']}`)
                          .join(' · ')}
                      </Typography>
                    )}
                  </Box>
                  )}
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
      <CubifyDialog />
      <BomDialog open={bomOpen} onClose={() => setBomOpen(false)} />
      {selected && selectedUnbound && (
        <GenerateHolderDialog
          part={selected}
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
        />
      )}
      <Snackbar
        open={showRetireNotice}
        autoHideDuration={6000}
        onClose={() => setShowRetireNotice(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setShowRetireNotice(false)}>
          “View 3D” now lives here — the assembly renders the cubes in 3D and links each
          insert to its optical component.
        </Alert>
      </Snackbar>
    </>
  );
}

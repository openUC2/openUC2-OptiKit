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
  listParts,
  libraryEntryOf,
  selectPart,
  useDocParts,
  useDocRevision,
  useSelectedPartId,
} from '../../document';
import { saveAs } from 'file-saver';
import {
  CoreServiceError,
  base64ToBytes,
  exportStepPart,
  generateTemplate,
} from '../../api/coreClient';
import { zipDsn } from '../../model/dsn/io';
import { assetsBaseUrl } from '../../model/libraryIndex';
import { useLibraryRegistration } from '../../model/useLibraryRegistration';
import { buildServiceDesign, listPartMechanics, serviceFiles } from '../../model/dsn/serviceExport';
import { BomDialog } from '../bom/BomDialog';
import { MarkerList } from '../schematic/MarkerList';
import { LayerChips } from '../schematic/LayerChips';
import { AssemblyScene } from './AssemblyScene';
import { PartOpticsSection } from '../inspector/PartOpticsSection';
import { AttachInventorDialog } from './AttachInventorDialog';
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
  // WP-92: mounting the registration hook keeps the palette registry
  // (libraryEntryOf / renderInfoOf) live on this page too — a holder accepted
  // HERE re-registers its new T3 module on the index bump, so the fresh cube
  // renders its mesh instead of a "no template" ghost.
  const { libraryIndex: index } = useLibraryRegistration();
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
  // WP-84: the Inventor round-trip. The template the return leg attaches
  // onto: the bound module's template, or the housing named by the index.
  const [attachOpen, setAttachOpen] = useState(false);
  const selectedTemplateId =
    selectedIndexModule?.template?.id ??
    (selected
      ? index.housings.find(h => h.component.id === selected.libraryRef)?.id ?? null
      : null);
  // WP-85: the T2 road — parameterize the real Inventor master insert via
  // the bridge; without one, the fx-changeset download is the fallback.
  const [t2Busy, setT2Busy] = useState(false);
  const regenerateT2 = async () => {
    if (!selected || !selectedIndexModule?.template?.id) return;
    setT2Busy(true);
    const notify = useAppStore.getState().addNotification;
    try {
      const { keyByPartId } = buildServiceDesign();
      const result = await generateTemplate({
        templateId: selectedIndexModule.template.id,
        files: serviceFiles(),
        component: keyByPartId[selected.id],
      });
      const files: Record<string, Uint8Array> = {};
      for (const [name, b64] of Object.entries(result.artifacts)) {
        files[name] = base64ToBytes(b64);
      }
      const blob = await zipDsn(files, `${result.template_id}-${result.key}`);
      saveAs(blob, `${result.template_id}-${result.key}.zip`);
      notify({
        type: 'success',
        title: result.regenerated ? 'insert regenerated via Inventor' : 'insert cache hit',
        message: `${result.template_id} @ ${result.key} — ${Object.keys(result.artifacts).join(', ')} downloaded`,
        duration: 8000,
      });
    } catch (err) {
      const bridgeless =
        err instanceof CoreServiceError &&
        (err.code === 'E_NO_BRIDGE' || err.code === 'E_BRIDGE_UNREACHABLE');
      notify({
        type: bridgeless ? 'warning' : 'error',
        title: bridgeless ? 'no Inventor bridge — use the fx changeset' : 'T2 regenerate failed',
        message: bridgeless
          ? `${err.message} · Fallback: Optimize… → “download optikit-fx.json”, then run apply_fx_params.py on the Inventor machine.`
          : err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err),
        duration: 10000,
      });
    } finally {
      setT2Busy(false);
    }
  };

  const [exportBusy, setExportBusy] = useState(false);
  const exportForInventor = async () => {
    if (!selected) return;
    setExportBusy(true);
    const notify = useAppStore.getState().addNotification;
    try {
      const { keyByPartId } = buildServiceDesign();
      const key = keyByPartId[selected.id];
      const { blob, filename } = await exportStepPart(serviceFiles(), key);
      saveAs(blob, filename);
      notify({
        type: 'success',
        title: 'exported for Inventor',
        message: `${filename} — the part posed w.r.t. its cube frame; design the module around it, then “attach Inventor files…”`,
        duration: 8000,
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'export for Inventor failed',
        message: err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err),
        duration: 8000,
      });
    } finally {
      setExportBusy(false);
    }
  };

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);

  const modules = useAppStore(s => s.modules);
  const loadModules = useAppStore(s => s.loadModules);
  const loadStateFromStorage = useAppStore(s => s.loadStateFromStorage);
  useEffect(() => {
    if (modules.length === 0) {
      loadModules().then(() => loadStateFromStorage());
    } else if (listParts().length === 0) {
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
          <Box sx={{ flexGrow: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
            <AssemblyScene
              mechanics={mechanics}
              unboundIds={unboundIds}
              lockView={lockView}
              cameraRef={cameraRef}
              controlsRef={controlsRef}
            />
            <Stack
              direction="row" spacing={1} alignItems="center"
              sx={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10,
              }}
            >
              {/* WP-65: the layer-visibility chips shared with the schematic. */}
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', px: 1, py: 0.5,
                  bgcolor: 'background.paper', boxShadow: 3, borderRadius: 2,
                  border: '1px solid', borderColor: 'divider',
                }}
              >
                <LayerChips />
              </Box>
              <Tooltip
                title={lockView
                  ? 'View locked: left button selects/drags; right-drag orbits. Click to unlock.'
                  : 'View unlocked: left-drag orbits. Click to lock for part editing.'}
              >
                <ToggleButton
                  value="lockView" size="small" selected={lockView}
                  onChange={() => setLockView(v => !v)}
                  sx={{
                    bgcolor: 'background.paper', boxShadow: 3,
                    border: '1px solid', borderColor: 'divider',
                  }}
                >
                  {lockView ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                </ToggleButton>
              </Tooltip>
            </Stack>
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
              // WP-64: a closed persistent drawer must release its flex width
              // (same fix as the schematic page) or the canvas keeps a dead
              // white strip.
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
                  {/* WP-89: the record's optics + the port list — the same
                      read-only section the schematic inspector mounts. */}
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    <PartOpticsSection part={selected} />
                  </Stack>
                  {/* WP-84: the Inventor round-trip, both legs. Export the
                      part posed w.r.t. its cube frame; attach the resulting
                      STP/GLB back onto the SAME template record. */}
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
                    <Tooltip title="download this part as a STEP posed w.r.t. its cube frame — design the cube module around it in Inventor (WP-84)">
                      <span>
                        <Button size="small" variant="outlined" disabled={exportBusy}
                          startIcon={exportBusy ? <CircularProgress size={12} /> : undefined}
                          onClick={() => void exportForInventor()}>
                          export for Inventor
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title={selectedTemplateId
                      ? `attach the Inventor STEP/GLB back onto ${selectedTemplateId} — same record, no new id`
                      : 'no template record to attach onto — generate a holder or attach a housing first'}>
                      <span>
                        <Button size="small" variant="outlined" disabled={!selectedTemplateId}
                          onClick={() => setAttachOpen(true)}>
                          attach Inventor files…
                        </Button>
                      </span>
                    </Tooltip>
                    {/* WP-85: the T2 loop — the master insert parameterized
                        from THIS part's prescription + dz via the bridge. */}
                    {selectedTClass === 'adaptive' && (
                      <Tooltip title="set the Inventor master insert's fx parameters from this part's prescription + dof values and re-export the STP/GLB (needs the WP-85 bridge; falls back to the fx-changeset download)">
                        <span>
                          <Button size="small" variant="outlined" color="secondary"
                            disabled={t2Busy}
                            startIcon={t2Busy ? <CircularProgress size={12} /> : undefined}
                            onClick={() => void regenerateT2()}>
                            regenerate insert (Inventor)…
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>
                  {[...(selectedMechanics?.translationDofs ?? []),
                    ...(selectedMechanics?.rotationDofs ?? [])].map(dof => {
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
      {selectedTemplateId && (
        <AttachInventorDialog
          templateId={selectedTemplateId}
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
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

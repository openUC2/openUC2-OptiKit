/**
 * Part-binding workbench page (WP-19) — /configurator/bind.
 *
 * Load an STP (converted server-side via /v1/convert/step-to-glb) or a GLB,
 * place it against the ghost 50 mm cube, click optical datums onto its
 * surfaces, and emit bound component + template + module records.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  FileUpload as LoadIcon,
  GridView as QuadViewIcon,
  OpenWith as TranslateIcon,
  Rotate90DegreesCcw as RotateIcon,
  RadioButtonChecked as DatumIcon,
  Save as SaveIcon,
  Storage as DevWriteIcon,
  ViewInAr as CubeIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { CoreServiceError, convertStepToGlb, saveLibraryRecords } from '../../api/coreClient';
import {
  bindToRecords,
  recordsToFiles,
  snapToAxis,
  type BindAssets,
  type BindInput,
  type DatumKind,
} from '../../model/bindRecord';
import type { Vec3 } from '../../document';
import { useLibraryIndex } from '../../model/libraryIndex';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { zipDsn } from '../../model/dsn/io';
import { BindScene } from './BindScene';
import { useBindStore } from './bindStore';

const DATUM_KINDS: { value: DatumKind; label: string }[] = [
  { value: 'source', label: 'source plane' },
  { value: 'sensor', label: 'sensor plane' },
  { value: 'reflective', label: 'reflective plane' },
  { value: 'front', label: 'front port' },
  { value: 'back', label: 'back port' },
  { value: 'custom', label: 'custom' },
];

/**
 * The record category constrains which datum kinds make sense (WP-31):
 * a lens gets front/back ports, a source its emit plane, and so on.
 * 'custom' stays available everywhere.
 */
const KINDS_BY_CATEGORY: Record<string, DatumKind[]> = {
  source: ['source', 'custom'],
  detector: ['sensor', 'custom'],
  mirror: ['reflective', 'custom'],
  lens: ['front', 'back', 'custom'],
  filter: ['front', 'back', 'custom'],
  beamsplitter: ['front', 'back', 'reflective', 'custom'],
  dichroic: ['front', 'back', 'reflective', 'custom'],
  sample: ['front', 'custom'],
  other: ['source', 'sensor', 'reflective', 'front', 'back', 'custom'],
};

const DIRECTION_AXES: { value: string; vec: Vec3 }[] = [
  { value: '+x', vec: [1, 0, 0] }, { value: '-x', vec: [-1, 0, 0] },
  { value: '+y', vec: [0, 1, 0] }, { value: '-y', vec: [0, -1, 0] },
  { value: '+z', vec: [0, 0, 1] }, { value: '-z', vec: [0, 0, -1] },
];

/** Downscaled PNG snapshot of the bind viewport, as data URL (WP-31). */
function captureThumbnail(): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>('#bind-scene canvas');
  if (!canvas || canvas.width === 0) return null;
  const size = 256;
  const out = document.createElement('canvas');
  const scale = Math.min(size / canvas.width, size / canvas.height);
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function BindPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const store = useBindStore();
  const saveComponent = useWorkspaceLibrary(s => s.save);
  const saveThumbnail = useWorkspaceLibrary(s => s.saveThumbnail);
  const workspaceRecords = useWorkspaceLibrary(s => s.records);
  const index = useLibraryIndex();
  const fileInput = useRef<HTMLInputElement>(null);

  const [namespace, setNamespace] = useState('user');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('source');
  const [templateClass, setTemplateClass] = useState<BindInput['templateClass']>('fixed');
  // '' = generate a fresh stub component; otherwise an existing component id
  // from the index or the workspace (the KiCad symbol↔footprint link, WP-31).
  const [existingId, setExistingId] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  // Existing-component options: published index + local workspace drafts.
  const componentOptions = useMemo(() => {
    const opts = new Map<string, string>(); // id → version
    for (const c of index.components) opts.set(c.id, c.version);
    for (const r of Object.values(workspaceRecords)) opts.set(r.id, r.version);
    return [...opts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [index.components, workspaceRecords]);

  const allowedKinds = KINDS_BY_CATEGORY[category] ?? KINDS_BY_CATEGORY.other;
  // Category change constrains the datum-kind dropdown; keep nextKind legal.
  const setNextKind = store.setNextKind;
  useEffect(() => {
    if (!allowedKinds.includes(useBindStore.getState().nextKind)) {
      setNextKind(allowedKinds[0]);
    }
  }, [allowedKinds, setNextKind]);

  const bound = useMemo(() => {
    if (!name || store.datums.length === 0) return null;
    const existing = componentOptions.find(([id]) => id === existingId);
    return bindToRecords({
      namespace,
      name,
      category,
      templateClass,
      meshFile: store.meshFile || 'part.step',
      meshTransform: store.transform,
      datums: store.datums,
      existingComponent: existing ? { id: existing[0], version: existing[1] } : null,
    });
  }, [namespace, name, category, templateClass, existingId, componentOptions,
      store.meshFile, store.transform, store.datums]);

  const bindAssets = (): BindAssets => {
    const thumb = captureThumbnail();
    return {
      step: store.stepBytes,
      glb: store.glbBytes,
      thumbnailPng: thumb ? dataUrlToBytes(thumb) : null,
    };
  };

  const loadFile = () => fileInput.current?.click();

  const onFile = async (file: File) => {
    store.setBusy(true);
    store.setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.(step|stp)$/i.test(file.name)) {
        const glb = await convertStepToGlb(file.name, bytes);
        store.loadMesh(file.name, glb, bytes);
      } else if (/\.(glb|gltf)$/i.test(file.name)) {
        store.loadMesh(file.name, bytes, null);
      } else {
        store.setError(`unsupported file type: ${file.name} (STEP or GLB)`);
      }
    } catch (err) {
      store.setError(
        err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err),
      );
    } finally {
      store.setBusy(false);
    }
  };

  const download = async () => {
    if (!bound) return;
    // Assets ship with the records (WP-31): STP (source of truth) + GLB
    // (render copy) + a thumbnail — a record without its mesh is not
    // reviewable.
    const files = recordsToFiles(bound, store.meshFile || 'part.step', bindAssets());
    const blob = await zipDsn(files, `${namespace}-${name}-records`);
    saveAs(blob, `${namespace}-${name}-records.zip`);
  };

  const saveWorkspace = () => {
    if (!bound?.component) return;
    saveComponent(bound.component as unknown as ComponentRecord);
    const thumb = captureThumbnail();
    if (thumb) saveThumbnail(bound.component.id as string, thumb);
    setFlash(`saved ${bound.component.id as string} to the workspace library`);
    setTimeout(() => setFlash(null), 3000);
  };

  const devWrite = async () => {
    if (!bound) return;
    store.setBusy(true);
    try {
      const files = recordsToFiles(bound, store.meshFile || 'part.step', bindAssets());
      const records: string[] = [];
      const assets: Record<string, Uint8Array> = {};
      for (const [path, content] of Object.entries(files)) {
        if (typeof content === 'string') records.push(content);
        else assets[path] = content;
      }
      const result = await saveLibraryRecords(records, assets);
      setFlash(`wrote ${result.written.length} file(s) into ../optikit-core/library`);
      setTimeout(() => setFlash(null), 5000);
    } catch (err) {
      store.setError(
        err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err),
      );
    } finally {
      store.setBusy(false);
    }
  };

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 380;

  // Rendered inside the AppShell (WP-24): the shell provides theme + toolbar.
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Box id="bind-scene" sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
            <BindScene />

            {/* mode + view toolbar */}
            <Stack
              direction="row" spacing={1} alignItems="center"
              sx={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                bgcolor: 'rgba(23,28,36,0.88)', backdropFilter: 'blur(8px)', borderRadius: 2,
                px: 1.5, py: 0.5, zIndex: 10,
              }}
            >
              <ToggleButtonGroup
                size="small" exclusive value={store.mode}
                onChange={(_, mode) => mode && store.setMode(mode)}
              >
                <ToggleButton value="translate">
                  <Tooltip title="move the part"><TranslateIcon fontSize="small" /></Tooltip>
                </ToggleButton>
                <ToggleButton value="rotate">
                  <Tooltip title="rotate the part"><RotateIcon fontSize="small" /></Tooltip>
                </ToggleButton>
                <ToggleButton value="datum">
                  <Tooltip title="datum mode: click the part surface to author an optical datum">
                    <DatumIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
              {store.mode === 'datum' && (
                <TextField
                  select size="small" label="datum kind" value={store.nextKind}
                  onChange={e => store.setNextKind(e.target.value as DatumKind)}
                  sx={{ width: 160 }}
                >
                  {/* Constrained by the record category (WP-31). */}
                  {DATUM_KINDS.filter(k => allowedKinds.includes(k.value)).map(k => (
                    <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>
                  ))}
                </TextField>
              )}
              <Tooltip title="snap: 1 mm / 15°">
                <ToggleButton
                  value="snap" size="small" selected={store.snap}
                  onChange={() => store.toggleSnap()}
                >
                  snap
                </ToggleButton>
              </Tooltip>
              <Tooltip title="toggle the ghost 50 mm cube">
                <ToggleButton
                  value="cube" size="small" selected={store.ghostCube}
                  onChange={() => store.toggleGhostCube()}
                >
                  <CubeIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="linked 2×2 views: perspective + top/front/side (each flippable)">
                <ToggleButton
                  value="quad" size="small" selected={store.quadView}
                  onChange={() => store.toggleQuadView()}
                >
                  <QuadViewIcon fontSize="small" />
                </ToggleButton>
              </Tooltip>
            </Stack>

            {!store.glbBytes && (
              <Alert
                severity="info"
                sx={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}
              >
                load an STP (converted via the service) or a GLB to start binding
              </Alert>
            )}
          </Box>

          <Drawer
            variant="persistent" anchor="right" open
            sx={{
              width: sidebarWidth, flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderLeft: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Part binding</Typography>

              <input
                ref={fileInput} type="file" hidden accept=".step,.stp,.glb,.gltf"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = '';
                }}
              />
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button
                  size="small" variant="outlined"
                  startIcon={store.busy ? <CircularProgress size={12} /> : <LoadIcon />}
                  onClick={loadFile} disabled={store.busy}
                >
                  load STP / GLB
                </Button>
                {store.meshFile && (
                  <Chip size="small" label={store.meshFile} sx={{ maxWidth: 180 }} />
                )}
              </Stack>
              {store.error && (
                <Alert severity="error" onClose={() => store.setError(null)} sx={{ mb: 1 }}>
                  {store.error}
                </Alert>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                placement: [{store.transform.positionMm.map(v => v.toFixed(1)).join(', ')}] mm ·
                rot [{store.transform.rotationDeg.map(v => v.toFixed(1)).join(', ')}]°
              </Typography>

              {/* ── datums ─────────────────────────────────────────────── */}
              <Divider sx={{ my: 1.5 }}>
                <Typography variant="overline">optical datums ({store.datums.length})</Typography>
              </Divider>
              <Stack spacing={1}>
                {store.datums.map(datum => {
                  const snap = snapToAxis(datum.direction);
                  const setAxis = (i: 0 | 1 | 2) => (v: string) => {
                    const next = [...datum.pointMm] as Vec3;
                    next[i] = Number(v) || 0;
                    store.updateDatum(datum.id, { pointMm: next });
                  };
                  return (
                    <Stack
                      key={datum.id} spacing={0.5}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.75 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                          size="small" variant="standard" value={datum.name}
                          onChange={e => store.updateDatum(datum.id, { name: e.target.value })}
                          sx={{ width: 90 }}
                        />
                        <Chip size="small" label={datum.kind} sx={{ height: 18, fontSize: 10 }} />
                        {snap.deviationDeg > 2 && (
                          <Typography variant="caption" color="warning.main">
                            +{snap.deviationDeg.toFixed(1)}° off {snap.axis}
                          </Typography>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <IconButton size="small" onClick={() => store.removeDatum(datum.id)}>
                          <DeleteIcon fontSize="inherit" />
                        </IconButton>
                      </Stack>
                      {/* Numeric editing, PART frame (WP-31): the pin follows. */}
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {(['x', 'y', 'z'] as const).map((axis, i) => (
                          <TextField
                            key={axis} size="small" variant="standard" label={axis}
                            type="number" value={datum.pointMm[i]}
                            onChange={e => setAxis(i as 0 | 1 | 2)(e.target.value)}
                            inputProps={{ step: 0.1, style: { width: 52, fontSize: 12 } }}
                          />
                        ))}
                        <TextField
                          select size="small" variant="standard" label="dir"
                          value={snap.axis}
                          onChange={e => {
                            const axis = DIRECTION_AXES.find(a => a.value === e.target.value);
                            if (axis) store.updateDatum(datum.id, { direction: axis.vec });
                          }}
                          sx={{ width: 56 }}
                        >
                          {DIRECTION_AXES.map(a => (
                            <MenuItem key={a.value} value={a.value}>{a.value}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          size="small" variant="standard" label="⌀mm" type="number"
                          value={datum.areaDiameterMm ?? ''}
                          onChange={e =>
                            store.updateDatum(datum.id, {
                              areaDiameterMm: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          inputProps={{ style: { width: 44, fontSize: 12 } }}
                        />
                      </Stack>
                    </Stack>
                  );
                })}
                {store.datums.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    switch to datum mode and click the part surface — pin + arrow +
                    optional aperture disc; positions are in the part frame and
                    follow the part
                  </Typography>
                )}
              </Stack>

              {/* ── identity + output ──────────────────────────────────── */}
              <Divider sx={{ my: 1.5 }}>
                <Typography variant="overline">records</Typography>
              </Divider>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField select size="small" label="ns" value={namespace}
                  onChange={e => setNamespace(e.target.value)} sx={{ width: 90 }}>
                  {['user', 'openuc2'].map(ns => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
                </TextField>
                <TextField size="small" label="name" value={name} placeholder="laser-pointer"
                  onChange={e => setName(e.target.value.toLowerCase())} sx={{ flex: 1 }} />
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField select size="small" label="category" value={category}
                  onChange={e => setCategory(e.target.value)} sx={{ flex: 1 }}>
                  {['source', 'detector', 'mirror', 'lens', 'filter', 'beamsplitter', 'dichroic', 'sample', 'other'].map(c => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" label="template" value={templateClass}
                  onChange={e => setTemplateClass(e.target.value as BindInput['templateClass'])}
                  sx={{ width: 130 }}>
                  {['fixed', 'adaptive', 'generative'].map(c => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>
              </Stack>
              {/* The KiCad symbol↔footprint link (WP-31): bind the mechanics
                  to an existing optical component instead of a fresh stub. */}
              <TextField
                select size="small" fullWidth sx={{ mb: 1 }}
                label="optical component" value={existingId}
                onChange={e => setExistingId(e.target.value)}
                helperText={existingId
                  ? 'the module references this component; no stub is generated'
                  : 'a fresh user.* stub component will be generated from the datums'}
              >
                <MenuItem value="">— generate a new component from the datums —</MenuItem>
                {componentOptions.map(([id, version]) => (
                  <MenuItem key={id} value={id}>{id}@{version}</MenuItem>
                ))}
              </TextField>

              {bound?.warnings.map((w, i) => (
                <Alert key={i} severity="warning" sx={{ mb: 0.5 }}>
                  <Typography variant="caption">{w}</Typography>
                </Alert>
              ))}
              {flash && <Alert severity="success" sx={{ mb: 1 }}>{flash}</Alert>}

              <Stack spacing={1}>
                <Button variant="contained" startIcon={<DownloadIcon />} disabled={!bound}
                  onClick={() => void download()}>
                  Download records for library PR
                </Button>
                <Button variant="outlined" startIcon={<SaveIcon />}
                  disabled={!bound?.component}
                  onClick={saveWorkspace}>
                  Save to workspace
                </Button>
                <Tooltip title="requires the service started with OPTIKIT_ALLOW_LIBRARY_WRITE=1">
                  <span>
                    <Button variant="outlined" color="warning" startIcon={<DevWriteIcon />}
                      disabled={!bound || store.busy} onClick={() => void devWrite()} fullWidth>
                      Write into ../optikit-core/library
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          </Drawer>
    </Box>
  );
}

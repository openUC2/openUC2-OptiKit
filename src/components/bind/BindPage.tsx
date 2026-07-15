/**
 * Part-binding workbench page (WP-19) — /configurator/bind.
 *
 * Load an STP (converted server-side via /v1/convert/step-to-glb) or a GLB,
 * place it against the ghost 50 mm cube, click optical datums onto its
 * surfaces, and emit bound component + template + module records.
 */

import { useMemo, useRef, useState } from 'react';
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
import { ThemeProvider } from '@mui/material/styles';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  FileUpload as LoadIcon,
  OpenWith as TranslateIcon,
  Rotate90DegreesCcw as RotateIcon,
  RadioButtonChecked as DatumIcon,
  Save as SaveIcon,
  Storage as DevWriteIcon,
  ViewInAr as CubeIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { materialThemeDark } from '../../theme/materialTheme';
import { Toolbar } from '../Toolbar';
import { CoreServiceError, convertStepToGlb, saveLibraryRecords } from '../../api/coreClient';
import {
  bindToRecords,
  recordsToFiles,
  snapToAxis,
  type BindInput,
  type DatumKind,
} from '../../model/bindRecord';
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

export function BindPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const store = useBindStore();
  const saveComponent = useWorkspaceLibrary(s => s.save);
  const fileInput = useRef<HTMLInputElement>(null);

  const [namespace, setNamespace] = useState('user');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('source');
  const [templateClass, setTemplateClass] = useState<BindInput['templateClass']>('fixed');
  const [flash, setFlash] = useState<string | null>(null);

  const bound = useMemo(() => {
    if (!name || store.datums.length === 0) return null;
    return bindToRecords({
      namespace,
      name,
      category,
      templateClass,
      meshFile: store.meshFile || 'part.step',
      meshTransform: store.transform,
      datums: store.datums,
    });
  }, [namespace, name, category, templateClass, store.meshFile, store.transform, store.datums]);

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
    const files = recordsToFiles(bound);
    const blob = await zipDsn(files, `${namespace}-${name}-records`);
    saveAs(blob, `${namespace}-${name}-records.zip`);
  };

  const saveWorkspace = () => {
    if (!bound) return;
    saveComponent(bound.component as unknown as ComponentRecord);
    setFlash(`saved ${bound.component.id as string} to the workspace library`);
    setTimeout(() => setFlash(null), 3000);
  };

  const devWrite = async () => {
    if (!bound) return;
    store.setBusy(true);
    try {
      const files = recordsToFiles(bound);
      const assets: Record<string, Uint8Array> = {};
      const templateId = bound.template.id as string;
      if (store.stepBytes) assets[`templates/${templateId}/${store.meshFile}`] = store.stepBytes;
      if (store.glbBytes) {
        assets[`templates/${templateId}/${store.meshFile.replace(/\.(step|stp)$/i, '.glb')}`] =
          store.glbBytes;
      }
      const result = await saveLibraryRecords(Object.values(files), assets);
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

  return (
    <ThemeProvider theme={materialThemeDark}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <Toolbar />
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
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
                  {DATUM_KINDS.map(k => (
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
                  return (
                    <Stack key={datum.id} direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small" variant="standard" value={datum.name}
                        onChange={e => store.updateDatum(datum.id, { name: e.target.value })}
                        sx={{ width: 90 }}
                      />
                      <Chip size="small" label={datum.kind} sx={{ height: 18, fontSize: 10 }} />
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        [{datum.pointMm.map(v => v.toFixed(1)).join(',')}] {snap.axis}
                        {snap.deviationDeg > 2 && ` (+${snap.deviationDeg.toFixed(1)}°!)`}
                      </Typography>
                      <TextField
                        size="small" variant="standard" placeholder="⌀mm"
                        value={datum.areaDiameterMm ?? ''}
                        onChange={e =>
                          store.updateDatum(datum.id, {
                            areaDiameterMm: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        inputProps={{ style: { width: 36, fontSize: 12 } }}
                      />
                      <IconButton size="small" onClick={() => store.removeDatum(datum.id)}>
                        <DeleteIcon fontSize="inherit" />
                      </IconButton>
                    </Stack>
                  );
                })}
                {store.datums.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    switch to datum mode and click the part surface — pin + arrow +
                    optional aperture disc
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
                <Button variant="outlined" startIcon={<SaveIcon />} disabled={!bound}
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
      </Box>
    </ThemeProvider>
  );
}

/**
 * The mechanics half of the component editor (WP-33): the former bind
 * workbench, embedded as a tab so the SYMBOL (optics, on the other tab) and
 * the FOOTPRINT (mesh + datums + template class) of one part are authored
 * together and saved as ONE linked record pair.
 *
 * Identity (namespace/name/category) comes from the shared RecordDraft —
 * never duplicated here. The emitted pair:
 *   - the draft's component record (when it validates), referenced by the
 *     template/module — or an EXISTING library component via the picker —
 *     or, as a fallback, the datum-derived stub (the WP-19 quick-bind road);
 *   - template + module from the mesh placement, datums and template class.
 */

import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  FileUpload as LoadIcon,
  GridView as QuadViewIcon,
  OpenWith as TranslateIcon,
  Rotate90DegreesCcw as RotateIcon,
  RadioButtonChecked as DatumIcon,
  Storage as DevWriteIcon,
  Visibility as OpticsIcon,
  ViewInAr as CubeIcon,
  CenterFocusStrong as FitIcon,
  ControlCamera as OpticsPlaceIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { CoreServiceError, convertStepToGlb, saveLibraryRecords } from '../../api/coreClient';
import {
  bindToRecords,
  recordsToFiles,
  snapToAxis,
  type BindAssets,
  type DatumKind,
} from '../../model/bindRecord';
import type { Vec3 } from '../../document';
import { recordToYaml, type RecordDraft } from '../../model/componentRecord';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { bumpLibraryIndex, useLibraryIndex } from '../../model/libraryIndex';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
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

/** Category → allowed datum kinds (WP-31). */
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

/** WP-38: how the open record's mesh resolution went (null = nothing opened). */
export type MeshStatus = 'loading' | 'loaded' | 'none' | null;

export function MechanicsPanel({
  draft,
  record,
  meshStatus = null,
}: {
  draft: RecordDraft;
  /** The draft's validated component record (null while incomplete). */
  record: ComponentRecord | null;
  meshStatus?: MeshStatus;
}) {
  const store = useBindStore();
  const saveThumbnail = useWorkspaceLibrary(s => s.saveThumbnail);
  const workspaceRecords = useWorkspaceLibrary(s => s.records);
  const index = useLibraryIndex();
  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const allowedKinds = KINDS_BY_CATEGORY[draft.category] ?? KINDS_BY_CATEGORY.other;

  // Existing-component options: published index + local workspace drafts.
  const componentOptions = useMemo(() => {
    const opts = new Map<string, string>();
    for (const c of index.components) opts.set(c.id, c.version);
    for (const r of Object.values(workspaceRecords)) opts.set(r.id, r.version);
    return [...opts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [index.components, workspaceRecords]);

  // The record pair (WP-33): template/module reference — in priority order —
  // the picked existing component, the validating DRAFT, or the datum stub.
  const bound = useMemo(() => {
    if (!draft.name || store.datums.length === 0) return null;
    const picked = componentOptions.find(([id]) => id === store.existingComponentId);
    const existing = picked
      ? { id: picked[0], version: picked[1] }
      : record
        ? { id: record.id, version: record.version }
        : null;
    return bindToRecords({
      namespace: draft.namespace,
      name: draft.name,
      category: draft.category,
      templateClass: store.templateClass,
      meshFile: store.meshFile || 'part.step',
      meshTransform: store.transform,
      datums: store.datums,
      existingComponent: existing,
      wholeModule: store.wholeModule,
    });
  }, [draft, record, componentOptions, store.existingComponentId, store.templateClass,
      store.meshFile, store.transform, store.datums, store.wholeModule]);

  const pairFiles = () => {
    if (!bound) return null;
    const thumb = captureThumbnail();
    const assets: BindAssets = {
      step: store.stepBytes,
      glb: store.glbBytes,
      thumbnailPng: thumb ? dataUrlToBytes(thumb) : null,
    };
    const files = recordsToFiles(bound, store.meshFile || 'part.step', assets);
    // The draft IS the component half of the pair (unless an existing
    // library component was picked).
    if (!store.existingComponentId && record) {
      files[`components/${record.id}/component.yml`] = recordToYaml(record);
      const dataUrl = thumb;
      if (dataUrl) saveThumbnail(record.id, dataUrl);
    }
    return files;
  };

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
    const files = pairFiles();
    if (!files) return;
    const blob = await zipDsn(files, `${draft.namespace}-${draft.name}-records`);
    saveAs(blob, `${draft.namespace}-${draft.name}-records.zip`);
  };

  const devWrite = async () => {
    const files = pairFiles();
    if (!files) return;
    store.setBusy(true);
    try {
      const records: string[] = [];
      const assets: Record<string, Uint8Array> = {};
      for (const [path, content] of Object.entries(files)) {
        if (typeof content === 'string') records.push(content);
        else assets[path] = content;
      }
      const result = await saveLibraryRecords(records, assets);
      // WP-34: the registry index is rebuilt per request — bumping makes the
      // new part appear in the schematic palette without a manual reload.
      bumpLibraryIndex();
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

  return (
    <Stack spacing={1.5}>
      <input
        ref={fileInput} type="file" hidden accept=".step,.stp,.glb,.gltf"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = '';
        }}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small" variant="outlined"
          startIcon={store.busy ? <CircularProgress size={12} /> : <LoadIcon />}
          onClick={() => fileInput.current?.click()} disabled={store.busy}
        >
          load STP / GLB
        </Button>
        {store.meshFile && <Chip size="small" label={store.meshFile} sx={{ maxWidth: 200 }} />}
        <Box sx={{ flex: 1 }} />
        {/* WP-41: the loaded STEP is the whole cube module — place the optic
            against it rather than treating the mesh as an insert body. */}
        <Tooltip title="the loaded STEP is the WHOLE cube module (cube + insert + optic + screws)">
          <FormControlLabel
            control={
              <Switch size="small" checked={store.wholeModule} onChange={() => store.toggleWholeModule()} />
            }
            label={<Typography variant="caption">whole module</Typography>}
            sx={{ mr: 0 }}
          />
        </Tooltip>
        <TextField
          select size="small" label="template class" value={store.templateClass}
          onChange={e => store.setTemplateClass(e.target.value as 'fixed' | 'adaptive' | 'generative')}
          sx={{ width: 150 }}
        >
          <MenuItem value="fixed">T1 · fixed</MenuItem>
          <MenuItem value="adaptive">T2 · adaptive</MenuItem>
          <MenuItem value="generative">T3 · generative</MenuItem>
        </TextField>
      </Stack>

      {store.wholeModule && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small" variant="outlined" startIcon={<FitIcon />}
            disabled={!store.meshBboxCenter} onClick={() => store.fitToCube()}
          >
            fit to cube
          </Button>
          <Typography variant="caption" color="text.secondary">
            then place the optical primitive on its face:
          </Typography>
          <TextField
            select size="small" label="add optic" value=""
            onChange={e => e.target.value && store.addOptic(e.target.value as DatumKind)}
            sx={{ width: 140 }}
          >
            {DATUM_KINDS.filter(k => allowedKinds.includes(k.value)).map(k => (
              <MenuItem key={k.value} value={k.value}>+ {k.label}</MenuItem>
            ))}
          </TextField>
        </Stack>
      )}

      {store.error && (
        <Alert severity="error" onClose={() => store.setError(null)}>{store.error}</Alert>
      )}

      {/* ── the workbench scene ─────────────────────────────────────────── */}
      <Box id="bind-scene" sx={{ position: 'relative', height: '46vh', minHeight: 320, borderRadius: 1, overflow: 'hidden' }}>
        <BindScene draft={draft} />
        <Stack
          direction="row" spacing={1} alignItems="center"
          sx={{
            position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
            bgcolor: 'background.paper', boxShadow: 3, borderRadius: 2,
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
            {store.wholeModule && (
              <ToggleButton value="optics">
                <Tooltip title="place mode: drag the selected optical primitive onto its face">
                  <OpticsPlaceIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          {store.mode === 'optics' && (
            <ToggleButtonGroup
              size="small" exclusive value={store.opticsGizmoMode}
              onChange={(_, m) => m && store.setOpticsGizmoMode(m)}
            >
              <ToggleButton value="translate">
                <Tooltip title="move the optic"><TranslateIcon fontSize="small" /></Tooltip>
              </ToggleButton>
              <ToggleButton value="rotate">
                <Tooltip title="rotate the optic onto its face (15° snap — three clicks to 45°)">
                  <RotateIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          {store.mode === 'datum' && (
            <TextField
              select size="small" label="datum kind" value={store.nextKind}
              onChange={e => store.setNextKind(e.target.value as DatumKind)}
              sx={{ width: 150 }}
            >
              {DATUM_KINDS.filter(k => allowedKinds.includes(k.value)).map(k => (
                <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>
              ))}
            </TextField>
          )}
          <Tooltip title="snap: 1 mm / 15°">
            <ToggleButton value="snap" size="small" selected={store.snap} onChange={() => store.toggleSnap()}>
              snap
            </ToggleButton>
          </Tooltip>
          <Tooltip title="toggle the ghost 50 mm cube">
            <ToggleButton value="cube" size="small" selected={store.ghostCube} onChange={() => store.toggleGhostCube()}>
              <CubeIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="linked 2×2 views: perspective + top/front/side">
            <ToggleButton value="quad" size="small" selected={store.quadView} onChange={() => store.toggleQuadView()}>
              <QuadViewIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="overlay the optical model at the datum poses (WP-40) — the visual verify-t1">
            <ToggleButton
              value="optics" size="small" selected={store.showOptics}
              onChange={() => store.toggleShowOptics()}
            >
              <OpticsIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          {store.showOptics && ['mirror', 'beamsplitter', 'dichroic'].includes(draft.category) && (
            <Tooltip title="galvo groundwork: tilt the mirror normal by θ — the reflected arm swings by 2θ">
              <Slider
                size="small" min={-30} max={30} step={1}
                value={store.galvoTiltDeg}
                onChange={(_, v) => store.setGalvoTiltDeg(v as number)}
                valueLabelDisplay="auto"
                valueLabelFormat={v => `θ ${v}°`}
                sx={{ width: 90, mx: 1 }}
              />
            </Tooltip>
          )}
        </Stack>
        {!store.glbBytes && meshStatus === 'loading' && (
          <Chip
            icon={<CircularProgress size={12} />}
            label="fetching the record's mesh from the registry…"
            sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
        {!store.glbBytes && meshStatus === 'none' && (
          <Alert
            severity="info"
            sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }}
          >
            no STP bound to this record yet — load one or bind it in the workbench
          </Alert>
        )}
        {!store.glbBytes && meshStatus === null && (
          <Alert
            severity="info"
            sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }}
          >
            load an STP (converted via the service) or a GLB to start binding
          </Alert>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        placement: [{store.transform.positionMm.map(v => v.toFixed(1)).join(', ')}] mm ·
        rot [{store.transform.rotationDeg.map(v => v.toFixed(1)).join(', ')}]°
      </Typography>

      {/* ── datums ─────────────────────────────────────────────────────── */}
      <Divider>
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
          const isPlaced = Boolean(datum.quaternion);
          const isSelected = isPlaced && store.selectedOpticId === datum.id;
          return (
            <Stack
              key={datum.id} spacing={0.5}
              onClick={() => isPlaced && store.selectOptic(datum.id)}
              sx={{
                border: '1px solid',
                borderColor: isSelected ? 'warning.main' : 'divider',
                borderRadius: 1, p: 0.75,
                cursor: isPlaced ? 'pointer' : 'default',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small" variant="standard" value={datum.name}
                  onChange={e => store.updateDatum(datum.id, { name: e.target.value })}
                  sx={{ width: 110 }}
                />
                <Chip
                  size="small"
                  label={isPlaced ? `${datum.kind} · placed` : datum.kind}
                  color={isPlaced ? 'warning' : 'default'}
                  variant={isSelected ? 'filled' : 'outlined'}
                  sx={{ height: 18, fontSize: 10 }}
                />
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
              <Stack direction="row" spacing={0.5} alignItems="center">
                {(['x', 'y', 'z'] as const).map((axis, i) => (
                  <TextField
                    key={axis} size="small" variant="standard" label={axis}
                    type="number" value={datum.pointMm[i]}
                    onChange={e => setAxis(i as 0 | 1 | 2)(e.target.value)}
                    inputProps={{ step: 0.1, style: { width: 56, fontSize: 12 } }}
                  />
                ))}
                <Tooltip
                  title={isPlaced
                    ? 'a placed optic\'s direction comes from the rotate gizmo — the readout snaps to the nearest axis'
                    : ''}
                >
                  <TextField
                    select size="small" variant="standard" label="dir" value={snap.axis}
                    disabled={isPlaced}
                    onChange={e => {
                      const axis = DIRECTION_AXES.find(a => a.value === e.target.value);
                      if (axis) store.updateDatum(datum.id, { direction: axis.vec });
                    }}
                    sx={{ width: 60 }}
                  >
                    {DIRECTION_AXES.map(a => (
                      <MenuItem key={a.value} value={a.value}>{a.value}</MenuItem>
                    ))}
                  </TextField>
                </Tooltip>
                <TextField
                  size="small" variant="standard" label="⌀mm" type="number"
                  value={datum.areaDiameterMm ?? ''}
                  onChange={e =>
                    store.updateDatum(datum.id, {
                      areaDiameterMm: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  inputProps={{ style: { width: 48, fontSize: 12 } }}
                />
              </Stack>
              {/* WP-42: a per-mirror actuation tilt — sweeping it swings ONLY
                  this mirror's reflected arrow about its own pivot. */}
              {isPlaced && datum.kind === 'reflective' && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="actuation tilt: swings only this mirror about its pivot (WP-42)">
                    <Chip size="small" color="warning" label="⚡ tilt" sx={{ height: 18, fontSize: 10 }} />
                  </Tooltip>
                  <Slider
                    size="small" min={-15} max={15} step={0.5}
                    value={store.opticTilt[datum.id] ?? 0}
                    onChange={(_, v) => store.setOpticTilt(datum.id, v as number)}
                    valueLabelDisplay="auto" valueLabelFormat={v => `${v}°`}
                    sx={{ flex: 1 }}
                  />
                </Stack>
              )}
            </Stack>
          );
        })}
        {store.datums.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            switch to datum mode and click the part surface — positions are in the
            part frame and follow the part
          </Typography>
        )}
      </Stack>

      {/* ── the pair ───────────────────────────────────────────────────── */}
      <Divider>
        <Typography variant="overline">record pair</Typography>
      </Divider>
      <TextField
        select size="small" fullWidth
        label="optical component" value={store.existingComponentId}
        onChange={e => store.setExistingComponentId(e.target.value)}
        helperText={store.existingComponentId
          ? 'the module references this existing component'
          : record
            ? `the module references THIS draft: ${record.id}@${record.version}`
            : 'draft incomplete — a datum-derived stub component will be generated'}
      >
        <MenuItem value="">— this draft (the optics tab) —</MenuItem>
        {componentOptions.map(([id, version]) => (
          <MenuItem key={id} value={id}>{id}@{version}</MenuItem>
        ))}
      </TextField>

      {bound?.warnings.map((w, i) => (
        <Alert key={i} severity="warning"><Typography variant="caption">{w}</Typography></Alert>
      ))}
      {flash && <Alert severity="success">{flash}</Alert>}

      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <Button variant="contained" startIcon={<DownloadIcon />} disabled={!bound}
          onClick={() => void download()}>
          Download record pair (PR zip)
        </Button>
        <Tooltip title="dev fast path — on by default when the service runs from a checkout">
          <span>
            <Button variant="outlined" color="warning" startIcon={<DevWriteIcon />}
              disabled={!bound || store.busy} onClick={() => void devWrite()}>
              Write into ../optikit-core/library
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

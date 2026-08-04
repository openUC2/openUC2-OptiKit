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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Slider,
  Stack,
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
  Deblur as MeshIcon,
  GpsFixed as PoseIcon,
  Filter1 as InsertOnlyIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { CoreServiceError, convertStepToGlb } from '../../api/coreClient';
import {
  asMountedDirection,
  bindToRecords,
  eulerDegToQuat,
  quatFromDirection,
  quatToEulerDeg,
  recordsToFiles,
  snapToAxis,
  type BindAssets,
  type DatumKind,
} from '../../model/bindRecord';
import type { Vec3 } from '../../document';
import {
  paraxialEflMm,
  recordToYaml,
  type RecordDraft,
} from '../../model/componentRecord';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { useLibraryIndex } from '../../model/libraryIndex';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import { publishRecordFiles } from '../../model/publishLibrary';
import { zipDsn } from '../../model/dsn/io';
import { GenerateDraftHolderDialog } from '../component-editor/GenerateDraftHolderDialog';
import { BindScene } from './BindScene';
import { DecimalField } from '../common/DecimalField';
import { AttachInventorDialog } from '../assembly/AttachInventorDialog';
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
/**
 * WP-38 mesh resolution, WP-107 honesty: 'none' means the registry has no
 * mesh for this record; 'error' means it HAS one and we could not fetch it.
 * Collapsing the two told users "no STP bound to this record yet" when the
 * real problem was an unreachable service — which is how a registry outage
 * looked like a missing record.
 */
export type MeshStatus =
  | 'loading'
  | 'loaded'
  | 'none'
  | { kind: 'error'; reason: string; url: string }
  | null;

/** WP-110: which expert controls to hide when a wizard step MOUNTS this
 * panel (route, don't duplicate — the wizard owns the mount mode and the
 * exits, so their controls would contradict it). */
export interface MechanicsEmbed {
  /** The wizard's road fixes the mount mode and template class — hide their
   * selects and the per-class route alerts. */
  hideMountControls?: boolean;
  /** The wizard's terminal step IS the exit — hide the record-pair section
   * and the download/write/generate buttons. */
  hideExits?: boolean;
  /** WP-117: step scoping — every visible control must act on the STEP's
   * question. Defaults are all-true (the expert tab shows everything). */
  showFitToCube?: boolean;
  /** Datum tools: the datum/optics modes, kind select, add-optic, the list. */
  showDatumTools?: boolean;
  /** The insert-pose panel + pose mode (WP-116). */
  showPoseTools?: boolean;
  /** The optical overlay — off on steps where nothing optical is declared
   * yet (the round-16 "phantom 45° mirror in an empty cube"). */
  showOverlay?: boolean;
}

export function MechanicsPanel({
  draft,
  record,
  meshStatus = null,
  onDraftChange,
  embed,
}: {
  draft: RecordDraft;
  /** The draft's validated component record (null while incomplete). */
  record: ComponentRecord | null;
  meshStatus?: MeshStatus;
  /** WP-90: the mechanics tab writes the draft's `mechanics:` reference. */
  onDraftChange?: (draft: RecordDraft) => void;
  embed?: MechanicsEmbed;
}) {
  const store = useBindStore();
  const show = {
    fitToCube: embed?.showFitToCube ?? true,
    datumTools: embed?.showDatumTools ?? true,
    poseTools: embed?.showPoseTools ?? true,
    overlay: embed?.showOverlay ?? true,
  };
  const saveThumbnail = useWorkspaceLibrary(s => s.saveThumbnail);
  const workspaceRecords = useWorkspaceLibrary(s => s.records);
  const index = useLibraryIndex();
  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // WP-77: the record-pair chooser presents as ONE line (the answer is the
  // draft you are editing) until the user asks for a different component.
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  // WP-77: the T3 verb from the editor — the draft-driven holder dialog.
  const [holderOpen, setHolderOpen] = useState(false);
  // WP-90: the T1 route — attach Inventor files onto the resolved template.
  const [attachOpen, setAttachOpen] = useState(false);

  const allowedKinds = KINDS_BY_CATEGORY[draft.category] ?? KINDS_BY_CATEGORY.other;
  // WP-114: the pending datum kind must be one this category allows. The
  // default is 'source', which a mirror does not offer — the select rendered
  // BLANK and a click would have authored a 'source' datum on a mirror. It
  // showed up once the wizard kept the viewport mounted across steps.
  useEffect(() => {
    if (!allowedKinds.includes(useBindStore.getState().nextKind)) {
      useBindStore.getState().setNextKind(allowedKinds[0]);
    }
  }, [allowedKinds]);
  // WP-77: the live lensmaker number, without switching to the optics tab.
  // null (reflective stack / afocal / no surfaces) renders as "—".
  const eflMm = paraxialEflMm(draft.surfaces);

  // WP-90: the template the T1 attach road targets — the draft's own
  // `mechanics:` reference first, else a published template already bound to
  // this component (module template or WP-67 housing).
  const attachTemplateId = useMemo(() => {
    if (draft.mechanicsTemplate) return draft.mechanicsTemplate;
    const cid = record?.id ?? null;
    if (!cid) return null;
    const viaModule = index.modules.find(
      m => (m.component?.ref ?? '').split('@')[0] === cid,
    )?.template?.id;
    const viaHousing = index.housings.find(h => h.component.id === cid)?.id;
    return viaModule ?? viaHousing ?? null;
  }, [draft.mechanicsTemplate, record?.id, index.modules, index.housings]);

  // WP-90: known housing/template ids for the `mechanics:` reference field.
  const mechanicsTemplateOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const m of index.modules) if (m.template?.id) ids.add(m.template.id);
    for (const h of index.housings) ids.add(h.id);
    return [...ids].sort();
  }, [index.modules, index.housings]);

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
      // WP-109: the measured box, so the record's envelope is true.
      envelopeMm: store.meshSizeMm ?? undefined,
      datums: store.datums,
      existingComponent: existing,
      wholeModule: store.wholeModule,
      housingOnly: store.housingOnly,
      meshFrame: store.meshFrameDetected,
      // WP-116: the F2 side, verbatim from the draft — the pose transforms it.
      insertPose: store.insertPose,
      recordFrames: Object.fromEntries(
        draft.frames.map(f => [f.name, [0, 0, f.zMm] as [number, number, number]]),
      ),
      recordPorts: draft.ports.map(p => ({
        name: p.name,
        frame: p.frame,
        direction: p.direction,
        afterSurface: p.afterSurface,
      })),
    });
  }, [draft, record, componentOptions, store.existingComponentId, store.templateClass,
      store.meshFile, store.transform, store.meshSizeMm, store.datums, store.wholeModule,
      store.housingOnly, store.insertPose, store.meshFrameDetected]);

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
    // library component was picked). WP-114: the draft's optics carry the
    // workbench's frames/ports — writing the draft verbatim erased them and
    // shipped a component whose frames the template contradicted.
    if (!store.existingComponentId && record) {
      // WP-116: the record ships VERBATIM — F2, exactly as authored. The
      // template carries the pose and the posed frames.
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
      // WP-102 merge-on-write, WP-110: shared with the wizard's terminal
      // step (publishRecordFiles) — bumps the index so the new part appears
      // in the schematic palette without a manual reload (WP-34).
      const result = await publishRecordFiles(files, index.url);
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
        {/* WP-67: HOW the mesh mounts. Three modes: an insert body inside a
            cube (the default), the WHOLE cube module (WP-41), or a bare
            HOUSING with no cube at all — a Thorlabs laser body, a kinematic
            mount. A housing saves component + template only. */}
        {!embed?.hideMountControls && (<>
        <TextField
          select size="small" label="mount" sx={{ width: 190 }}
          value={store.housingOnly ? 'housing' : store.wholeModule ? 'whole' : 'insert'}
          onChange={e => {
            const mode = e.target.value;
            // toggleWholeModule clears housingOnly, so order matters: settle
            // wholeModule first, then the housing flag.
            if ((mode === 'whole') !== store.wholeModule) store.toggleWholeModule();
            store.setHousingOnly(mode === 'housing');
          }}
        >
          <MenuItem value="insert">insert in a cube</MenuItem>
          <MenuItem value="whole">whole cube module</MenuItem>
          <MenuItem value="housing">housing only (no cube)</MenuItem>
        </TextField>
        <TextField
          select size="small" label="template class" value={store.templateClass}
          onChange={e => store.setTemplateClass(e.target.value as 'fixed' | 'adaptive' | 'generative')}
          sx={{ width: 150 }}
        >
          <MenuItem value="fixed">T1 · fixed</MenuItem>
          <MenuItem value="adaptive">T2 · adaptive</MenuItem>
          <MenuItem value="generative">T3 · generative</MenuItem>
        </TextField>
        </>)}
      </Stack>

      {/* WP-90: the template-class ROUTE — each class leads to its real
          road instead of a dead record. T3's buttons live below (WP-77). */}
      {!embed?.hideMountControls && store.templateClass === 'fixed' && (
        <Alert severity="info" sx={{ py: 0 }}>
          <Typography variant="caption">
            T1 · fixed: attach an EXISTING Inventor cube (WP-84).{' '}
            {attachTemplateId ? (
              <Button size="small" sx={{ py: 0 }} onClick={() => setAttachOpen(true)}>
                attach Inventor files… ({attachTemplateId})
              </Button>
            ) : (
              'Publish the record pair first (below), then attach the STP/GLB onto its template — or do it from the assembly page with the part placed.'
            )}
          </Typography>
        </Alert>
      )}
      {!embed?.hideMountControls && store.templateClass === 'adaptive' && (
        <Alert severity="info" sx={{ py: 0 }}>
          <Typography variant="caption">
            T2 · adaptive: the Inventor MASTER INSERT road (WP-85) — the insert is
            parameterized from the placed part's prescription and regenerated through the
            Inventor bridge. Place the part, then use “regenerate insert” on the assembly page
            (fallback: the fx-changeset download from Optimize…). The workbench cannot author
            DOFs, so the record pair below stays refused for T2 (WP-77 guard).
          </Typography>
        </Alert>
      )}

      {/* WP-90: `mechanics:` — a hand-authored record naming its housing
          template directly (the laser_488 case), no workbench round trip. */}
      {!embed?.hideMountControls && (
      <Autocomplete
        freeSolo
        size="small"
        options={mechanicsTemplateOptions}
        value={draft.mechanicsTemplate}
        onInputChange={(_, v) => onDraftChange?.({ ...draft, mechanicsTemplate: (v ?? '').trim() })}
        renderInput={params => (
          <TextField
            {...params}
            size="small"
            label="mechanics: housing template (record reference)"
            placeholder="user.tpl.laser_488_housing"
            helperText="written onto the component record as `mechanics: {template: …}` — points at the housing that carries the Inventor STEP"
          />
        )}
      />
      )}
      {attachTemplateId && (
        <AttachInventorDialog
          templateId={attachTemplateId}
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
        />
      )}

      {store.wholeModule && (show.fitToCube || show.datumTools) && (
        <Stack direction="row" spacing={1} alignItems="center">
          {show.fitToCube && (
            <Button
              size="small" variant="outlined" startIcon={<FitIcon />}
              disabled={!store.meshBboxCenter} onClick={() => store.fitToCube()}
            >
              fit to cube
            </Button>
          )}
          {show.datumTools && (
            <>
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
            </>
          )}
        </Stack>
      )}

      {store.error && (
        <Alert severity="error" onClose={() => store.setError(null)}>{store.error}</Alert>
      )}

      {/* ── the workbench scene ─────────────────────────────────────────── */}
      <Box id="bind-scene" sx={{ position: 'relative', height: '46vh', minHeight: 320, borderRadius: 1, overflow: 'hidden' }}>
        <BindScene draft={show.overlay ? draft : undefined} />
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
            {show.datumTools && (
            <ToggleButton value="datum">
              <Tooltip title="datum mode: click the part surface to author an optical datum">
                <DatumIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            )}
            {show.poseTools && store.insertPose && (
              <ToggleButton value="pose">
                <Tooltip title="pose mode (WP-116): click the optical surface to set the record frame's ORIGIN in the cube — rotation comes from the 90° steppers below">
                  <PoseIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            )}
            {show.datumTools && store.wholeModule && (
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
          {show.datumTools && store.mode === 'datum' && (
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
          <Tooltip title="toggle the ghost 50 × 50 × 55 mm cell">
            <ToggleButton value="cube" size="small" selected={store.ghostCube} onChange={() => store.toggleGhostCube()}>
              <CubeIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          {/* WP-114: a whole-cube export hides the cell and the datums inside
              it — hiding the mesh is how you see what you are authoring. */}
          <Tooltip title="show the loaded STP/GLB — turn it off to see the ghost cell and the datums inside a solid cube">
            <ToggleButton value="mesh" size="small" selected={store.showMesh} onChange={() => store.toggleShowMesh()}>
              <MeshIcon fontSize="small" />
            </ToggleButton>
          </Tooltip>
          {/* WP-117: the cube is fixed; the insert is what the pose rotates.
              Hiding only the PRT-CUBHLF halves shows the insert in place. */}
          {store.wholeModule && (
            <Tooltip title="hide the cube halves (the PRT-CUBHLF nodes) — see the INSERT in place">
              <ToggleButton
                value="halves" size="small" selected={store.hideCubeHalves}
                onChange={() => store.toggleHideCubeHalves()}
              >
                <InsertOnlyIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          )}
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
          {show.overlay && store.showOptics && ['mirror', 'beamsplitter', 'dichroic'].includes(draft.category) && (
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
        {/* WP-107: the record HAS a mesh; we could not get it. Say which. */}
        {!store.glbBytes && typeof meshStatus === 'object' && meshStatus !== null && (
          <Alert
            severity="warning"
            sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', maxWidth: '90%' }}
          >
            this record has a published mesh, but it could not be fetched
            ({meshStatus.reason}) — the registry may be unreachable.
            <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {meshStatus.url}
            </Typography>
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
        {' · '}
        <Tooltip title="paraxial EFL of the draft's optics tab (2×2 ABCD walk) — '—' for a reflective stack, where it is undefined">
          <span>EFL ≈ {eflMm === null ? '—' : `${eflMm.toFixed(2)} mm`}</span>
        </Tooltip>
      </Typography>

      {/* ── insert pose (WP-116): where the record frame sits in the cube ── */}
      {show.poseTools && store.insertPose && (
        <>
          <Divider>
            <Typography variant="overline">insert pose · record → cube</Typography>
          </Divider>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Tooltip title="which cube axis the record's optical axis (+z) points along — one of the 24 discrete insert orientations">
                <Chip size="small" color="primary" variant="outlined"
                  label={`optical axis → ${store.insertPose.rot24.z}`} />
              </Tooltip>
              <Chip size="small" variant="outlined" label={`record +x → ${store.insertPose.rot24.x}`} />
              <Typography variant="caption" color="text.secondary">rotate 90° about the cube's</Typography>
              {(['x', 'y', 'z'] as const).map(axis => (
                <Button key={axis} size="small" variant="outlined" sx={{ minWidth: 40, px: 0.5 }}
                  onClick={() => store.rotateInsert90(axis, 1)}>
                  {axis.toUpperCase()} ↻
                </Button>
              ))}
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 110 }}>
                frame origin (mm)
              </Typography>
              {(['x', 'y', 'z'] as const).map((axis, i) => (
                <DecimalField
                  key={axis} size="small" variant="standard" label={axis}
                  value={store.insertPose!.offsetMm[i]}
                  onValue={v => {
                    const next = [...store.insertPose!.offsetMm] as Vec3;
                    next[i] = v ?? 0;
                    store.setInsertOffsetMm(next);
                  }}
                  slotProps={{ htmlInput: { style: { width: 56, fontSize: 12 } } }}
                />
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ width: 90, ml: 1 }}>
                residual (°)
              </Typography>
              {(['x', 'y', 'z'] as const).map((axis, i) => (
                <DecimalField
                  key={axis} size="small" variant="standard" label={axis}
                  value={store.insertPose!.offsetDeg[i]}
                  onValue={v => {
                    const next = [...store.insertPose!.offsetDeg] as Vec3;
                    next[i] = v ?? 0;
                    store.setInsertOffsetDeg(next);
                  }}
                  slotProps={{ htmlInput: { style: { width: 52, fontSize: 12 } } }}
                />
              ))}
            </Stack>
            {/* the as-mounted sentence — computed, never asked (WP-116) */}
            {draft.ports.length > 0 && (
              <Alert severity="info" sx={{ py: 0 }}>
                <Typography variant="caption">
                  as mounted:{' '}
                  {draft.ports
                    .map(p => {
                      const d = asMountedDirection(store.insertPose!, p.direction);
                      return `${p.name} faces ${Array.isArray(d) ? `[${d.join(', ')}]` : d}`;
                    })
                    .join(' · ')}
                  {' — '}derived from the record's ports through the pose.
                </Typography>
              </Alert>
            )}
          </Stack>
        </>
      )}

      {/* ── datums (hidden on steps that do not ask about them, WP-117) ── */}
      {show.datumTools && (<>
      <Divider>
        <Typography variant="overline">optical datums ({store.datums.length})</Typography>
      </Divider>
      <Stack spacing={1}>
        {store.datums.map(datum => {
          const snap = snapToAxis(datum.direction);
          const setAxis = (i: 0 | 1 | 2) => (v: number | null) => {
            const next = [...datum.pointMm] as Vec3;
            next[i] = v ?? 0;
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
                  <DecimalField
                    key={axis} size="small" variant="standard" label={axis}
                    value={datum.pointMm[i]}
                    onValue={setAxis(i as 0 | 1 | 2)}
                    slotProps={{ htmlInput: { style: { width: 56, fontSize: 12 } } }}
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
                <DecimalField
                  size="small" variant="standard" label="⌀mm"
                  value={datum.areaDiameterMm ?? null}
                  onValue={v => store.updateDatum(datum.id, { areaDiameterMm: v })}
                  slotProps={{ htmlInput: { style: { width: 48, fontSize: 12 } } }}
                />
              </Stack>
              {/* WP-41 follow-up: dial in the placed orientation by typing
                  exact pitch/roll/yaw after the coarse gizmo drop.
                  WP-114: available on EVERY datum, not only gizmo-placed
                  ones — a clicked datum had no way to be rotated at all, so
                  a mirror was stuck at whatever angle the clicked face
                  implied. Typing an angle promotes the datum to a placed
                  optic (it gains a quaternion), which also gives it the
                  rotate gizmo in the viewport. */}
              {(
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ width: 34 }}>
                    rot°
                  </Typography>
                  {(['x', 'y', 'z'] as const).map(axis => {
                    // WP-114: a clicked datum has no quaternion yet — seed it from
                    // the direction it was clicked at, so typing an angle nudges the
                    // optic from where it is instead of snapping it to +y.
                    const euler = quatToEulerDeg(datum.quaternion ?? quatFromDirection(datum.direction));
                    const label = axis === 'x' ? 'pitch' : axis === 'y' ? 'roll' : 'yaw';
                    return (
                      <DecimalField
                        key={axis} size="small" variant="standard" label={`${label} ${axis}°`}
                        value={euler[axis]}
                        onValue={v => {
                          const next = { ...euler, [axis]: v ?? 0 };
                          store.updateDatum(datum.id, { quaternion: eulerDegToQuat(next) });
                        }}
                        slotProps={{ htmlInput: { style: { width: 52, fontSize: 12 } } }}
                      />
                    );
                  })}
                </Stack>
              )}
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

      </>)}

      {/* ── the pair (hidden when the wizard's terminal step is the exit) ── */}
      {!embed?.hideExits && (<>
      <Divider>
        <Typography variant="overline">record pair</Typography>
      </Divider>
      {/* WP-77: when the mechanics tab is open on the draft you are editing,
          the "which component?" question has an obvious answer — show it as
          ONE line, with the dropdown behind an explicit link. */}
      {!showComponentPicker && !store.existingComponentId ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Typography variant="body2">
            mechanics for{' '}
            <b>{record ? `${record.id}@${record.version}` : `${draft.namespace}.${draft.category}.${draft.name || '…'}`}</b>
            {' '}(this draft)
          </Typography>
          <Button size="small" onClick={() => setShowComponentPicker(true)}>
            bind to a different published component…
          </Button>
        </Stack>
      ) : (
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
      )}

      {bound?.errors.map((e, i) => (
        <Alert key={i} severity="error"><Typography variant="caption">{e}</Typography></Alert>
      ))}
      {bound?.warnings.map((w, i) => (
        <Alert key={i} severity="warning"><Typography variant="caption">{w}</Typography></Alert>
      ))}
      {flash && <Alert severity="success">{flash}</Alert>}

      {/* WP-67: a housing saves component + template only (footprint_grid:
          null, no module) — the part places freely with its mesh travelling,
          and "package as cube module…" stays the deliberate later step. */}
      {store.housingOnly && (
        <Alert severity="info">
          <Typography variant="caption">
            housing only: saves the symbol + its housing (no cube module). The part places
            freely on the schematic with its mesh; “package as cube module…” generates a
            T3 holder around the housing whenever you want it on the grid.
          </Typography>
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" startIcon={<DownloadIcon />}
          disabled={!bound || bound.errors.length > 0}
          onClick={() => void download()}>
          {store.housingOnly ? 'Download part records (zip)' : 'Download record pair (PR zip)'}
        </Button>
        {/* WP-102: say WHY it is disabled. The old text ("dev fast path — on
            by default when the service runs from a checkout") described the
            service gate, while the real blocker is almost always the datum
            count — and opening a record clears the datums. */}
        <Tooltip
          title={
            !draft.name
              ? 'name the record first (optics tab → name/id slug)'
              : store.datums.length === 0
                ? 'author at least one datum first: load a mesh, switch the viewport to datum mode, and click the surface'
                : bound && bound.errors.length > 0
                  ? bound.errors.join(' · ')
                  : 'writes component + template + module (and their assets) into ../optikit-core/library'
          }
        >
          <span>
            <Button variant="outlined" color="warning" startIcon={<DevWriteIcon />}
              disabled={!bound || bound.errors.length > 0 || store.busy}
              onClick={() => void devWrite()}>
              {store.housingOnly
                ? 'Attach housing · write into library'
                : 'Package · write into ../optikit-core/library'}
            </Button>
          </span>
        </Tooltip>
        {/* WP-77: the ACTUAL T3 road — a generated holder around the draft's
            own prescription; WP-67: on a housing, the holder is carved around
            the housing STEP instead ("package as cube module…"). */}
        <Tooltip
          title={store.housingOnly
            ? (bound
              ? 'generate a T3 holder around the housing STEP — write the housing into the library first, then accept writes template + module'
              : 'load a housing mesh and name the draft first')
            : record && draft.surfaces.length > 0
              ? 'generate a printable two-half holder from the draft prescription — accepting writes component + template (WITH generator) + module'
              : 'complete the optics tab first — the holder is carved from the draft prescription'}
        >
          <span>
            <Button variant="outlined" color="secondary"
              disabled={store.housingOnly ? !bound || !record : !record || draft.surfaces.length === 0}
              onClick={() => setHolderOpen(true)}>
              {store.housingOnly ? 'package as cube module… (T3)' : 'generate a holder… (T3)'}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      </>)}
      {record && (
        <GenerateDraftHolderDialog
          draft={draft}
          record={record}
          open={holderOpen}
          onClose={() => setHolderOpen(false)}
          partStepPath={
            store.housingOnly && bound
              ? `library/templates/${bound.template.id as string}/${(store.meshFile || 'part.step').replace(/\.(glb|gltf)$/i, '.step')}`
              : undefined
          }
        />
      )}
    </Stack>
  );
}

/**
 * WP-110 — the step BODIES of the three roads: thin compositions that mount
 * the existing panels (RecordForm, MechanicsPanel) with irrelevant controls
 * hidden. Guidance lives in the road definitions (roads.ts); machinery lives
 * in the panels. Only components are exported here (react-refresh rule).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { saveAs } from 'file-saver';
import { stringify as stringifyYaml } from 'yaml';
import {
  derivedPortWarnings,
  foldDegOfDraft,
  paraxialEflMm,
  recordToYaml,
} from '../../../model/componentRecord';
import { useLibraryIndex } from '../../../model/libraryIndex';
import { publishRecordFiles } from '../../../model/publishLibrary';
import { zipDsn } from '../../../model/dsn/io';
import { OpticGlyph } from '../../bind/OpticsOverlay';
import { PreviewCanvas } from '../../common/PreviewCanvas';
import { DecimalField } from '../../common/DecimalField';

import { useBindStore } from '../../bind/bindStore';
import { IDENTITY_INSERT_POSE } from '../../../model/bindRecord';
import {
  CoreServiceError,
  base64ToBytes,
  generateTemplate,
  importGlb,
  optimizeDesign,
  verifyProposedT1,
  type GenerateResponse,
  type VerifyT1Response,
} from '../../../api/coreClient';
import { GenerateDraftHolderDialog } from '../GenerateDraftHolderDialog';
import { RecordForm } from '../RecordForm';
import { usePartWizard } from './wizardStore';
import { buildWizardOutput } from './wizardOutput';
import {
  fxChangesetJson,
  onePartDesignFiles,
  probeDesignFiles,
  t2ModuleRecord,
} from './onePartDesign';
import {
  cellMismatch,
  expectedDatumOf,
  insertFit,
  offCentreNote,
  type WizardCtx,
} from './wizardTypes';

// ── shared bits ──────────────────────────────────────────────────────────────

/** The draft's ports, read-only — "what this will do to a beam". */
export function DerivedPortsSummary({ ctx }: { ctx: WizardCtx }) {
  const fold = foldDegOfDraft(ctx.draft);
  const efl = paraxialEflMm(ctx.draft.surfaces);
  const warnings = derivedPortWarnings(ctx.draft);
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        what this will do to a beam
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, mb: 0.5 }}>
        {ctx.draft.ports.map(p => (
          <Chip
            key={p.name}
            size="small"
            variant="outlined"
            label={`${p.name} · ${p.direction}`}
          />
        ))}
        {fold !== null && <Chip size="small" label={`folds the beam ${fold.toFixed(0)}°`} />}
        {efl !== null && <Chip size="small" label={`EFL ≈ ${efl.toFixed(1)} mm`} />}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        derived from the surfaces and the category — the wizard writes these ports for you;
        the full editor can change them later.
      </Typography>
      {warnings.map((w, i) => (
        <Alert key={i} severity="warning" sx={{ mt: 1 }}>
          <Typography variant="caption">{w}</Typography>
        </Alert>
      ))}
    </Box>
  );
}

export function DraftErrors({ ctx }: { ctx: WizardCtx }) {
  if (ctx.errors.length === 0) return null;
  return (
    <Alert severity="info" sx={{ mt: 1 }}>
      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
        still needed before the record is complete:
      </Typography>
      {ctx.errors.map((e, i) => (
        <Typography key={i} variant="caption" sx={{ display: 'block' }}>
          • {e}
        </Typography>
      ))}
    </Alert>
  );
}

// ── road A · "I know the optical numbers" (WP-111) ───────────────────────────

export function NumbersWhatIsIt({ ctx }: { ctx: WizardCtx }) {
  return (
    <Stack spacing={2.5}>
      <RecordForm
        draft={ctx.draft}
        onChange={ctx.setDraft}
        sections={{ framesPorts: false }}
      />
      <DerivedPortsSummary ctx={ctx} />
      <DraftErrors ctx={ctx} />
    </Stack>
  );
}

/** WP-111.2: ONE 50 × 50 × 55 cell with the optic inside it, and the number
 * that matters — the front-vertex offset from the CUBE ORIGIN along the
 * optical axis. Slider + typed field + "find the best position". */
export function NumbersWhereDoesItSit({ ctx }: { ctx: WizardCtx }) {
  const vertexOffsetMm = usePartWizard(s => s.vertexOffsetMm);
  const setVertexOffsetMm = usePartWizard(s => s.setVertexOffsetMm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merit, setMerit] = useState<{ before: number; after: number; at: number } | null>(null);

  const findBest = async () => {
    if (!ctx.record) return;
    setBusy(true);
    setError(null);
    setMerit(null);
    try {
      const probe = probeDesignFiles(
        ctx.record,
        { vertexOffsetMm, holdClass: 'adaptive', dzRangeMm: [-27.5, 27.5] },
        ctx.draft.sourceWavelengthsUm[0] ?? 0.532,
      );
      const res = await optimizeDesign(probe.files, probe.path, [probe.dofKey]);
      const v = res.dof_values[probe.dofKey];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const rounded = Math.round(v * 100) / 100;
        setVertexOffsetMm(rounded);
        setMerit({
          before: res.merit.rms_spot_before_mm,
          after: res.merit.rms_spot_after_mm,
          at: rounded,
        });
      }
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
      <Box sx={{ height: 240, borderRadius: 1, overflow: 'hidden' }}>
        <PreviewCanvas camera={{ position: [80, 45, 80], fov: 38 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[60, 100, 50]} intensity={1.0} />
          {/* the cell — 55 mm along the optical (vertical) axis */}
          <mesh>
            <boxGeometry args={[50, 55, 50]} />
            <meshBasicMaterial color="#4a90d9" wireframe transparent opacity={0.35} />
          </mesh>
          {/* the beam through the cell */}
          <mesh rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 55, 8]} />
            <meshBasicMaterial color="#39c07f" transparent opacity={0.5} />
          </mesh>
          <group position={[0, vertexOffsetMm, 0]}>
            <OpticGlyph
              category={ctx.draft.category}
              surfaces={ctx.draft.surfaces}
              mountAngleDeg={ctx.draft.mirrorAngleDeg ?? 0}
            />
          </group>
          <OrbitControls enablePan={false} minDistance={60} maxDistance={220} />
        </PreviewCanvas>
      </Box>
      <Stack direction="row" spacing={2} alignItems="center">
        <Slider
          size="small"
          min={-27.5}
          max={27.5}
          step={0.1}
          value={vertexOffsetMm}
          onChange={(_, v) => setVertexOffsetMm(v as number)}
          valueLabelDisplay="auto"
          valueLabelFormat={v => `${v} mm`}
          sx={{ flex: 1, maxWidth: 300 }}
        />
        <DecimalField
          size="small"
          label="front vertex offset (mm)"
          value={vertexOffsetMm}
          onValue={v => setVertexOffsetMm(v ?? 0)}
          sx={{ width: 180 }}
        />
        <Button size="small" variant="outlined" disabled={busy || !ctx.record} onClick={() => void findBest()}>
          {busy ? 'optimising…' : 'find the best position'}
        </Button>
      </Stack>
      {merit && (
        <Alert severity="success" onClose={() => setMerit(null)}>
          <Typography variant="caption">
            optimised for <b>RMS spot at the exit face</b>: {merit.before.toFixed(4)} mm →{' '}
            {merit.after.toFixed(4)} mm at an offset of {merit.at} mm. It is written into the
            field above — override it if the design needs the focal plane somewhere else; an
            optimiser result you cannot argue with is a black box.
          </Typography>
        </Alert>
      )}
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          <Typography variant="caption">
            the optimiser could not run ({error}) — position the optic by hand; 0 mm (front
            vertex at the cube centre) is the safe default.
          </Typography>
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        0 mm = the front vertex sits at the cube centre — what every generated holder assumes
        today. Positive values move the optic toward the beam exit.
      </Typography>
    </Stack>
  );
}

export function NumbersHowIsItHeld() {
  const holdClass = usePartWizard(s => s.holdClass);
  const setHoldClass = usePartWizard(s => s.setHoldClass);
  const dzRangeMm = usePartWizard(s => s.dzRangeMm);
  const setDzRangeMm = usePartWizard(s => s.setDzRangeMm);
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 620 }}>
      <ToggleButtonGroup
        exclusive
        orientation="vertical"
        value={holdClass}
        onChange={(_, v) => v && setHoldClass(v)}
        sx={{ alignItems: 'stretch' }}
      >
        <ToggleButton value="fixed" sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>
          <Stack sx={{ py: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'none' }}>
              fixed in place
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'none' }}>
              one insert, the optic cannot move. (This is what the records call T1.)
            </Typography>
          </Stack>
        </ToggleButton>
        <ToggleButton value="adaptive" sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>
          <Stack sx={{ py: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'none' }}>
              adjustable along the beam
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'none' }}>
              the insert is parameterized and the position becomes a knob in the assembly (T2).
              Declare how far it may travel:
            </Typography>
          </Stack>
        </ToggleButton>
      </ToggleButtonGroup>
      {holdClass === 'adaptive' && (
        <Stack direction="row" spacing={1.5} alignItems="center">
          <DecimalField
            size="small" label="dz min (mm)" value={dzRangeMm[0]}
            onValue={v => setDzRangeMm([v ?? -5, dzRangeMm[1]])} sx={{ width: 130 }}
          />
          <DecimalField
            size="small" label="dz max (mm)" value={dzRangeMm[1]}
            onValue={v => setDzRangeMm([dzRangeMm[0], v ?? 5])} sx={{ width: 130 }}
          />
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary">
        A third road — a printable holder generated around the prescription (T3) — stays
        available on the next step as the fallback when no Inventor machine is reachable.
      </Typography>
    </Stack>
  );
}

/** Render one returned-GLB artifact and report its measured bbox up. */
function BuiltGlbPreview({
  url,
  onSize,
}: {
  url: string;
  onSize: (size: [number, number, number]) => void;
}) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const s = new THREE.Vector3();
    box.getSize(s);
    onSize([s.x, s.y, s.z]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  return <primitive object={scene} />;
}

/** WP-111.4/5: BUILD IT — the T2 branch of /v1/generate over the synthesized
 * one-part design, review the returned mesh against the cell, then write the
 * trio. No bridge is a TYPED outcome with two fallbacks: the fx-changeset
 * download, and the printable T3 holder. */
export function NumbersBuildIt({ ctx }: { ctx: WizardCtx }) {
  const [holderOpen, setHolderOpen] = useState(false);
  const holdClass = usePartWizard(s => s.holdClass);
  const dzRangeMm = usePartWizard(s => s.dzRangeMm);
  const vertexOffsetMm = usePartWizard(s => s.vertexOffsetMm);
  const index = useLibraryIndex();
  const [busy, setBusy] = useState(false);
  const [bridgeless, setBridgeless] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [builtSize, setBuiltSize] = useState<[number, number, number] | null>(null);
  const [written, setWritten] = useState<string | null>(null);

  // The master inserts the bridge can parameterize: adaptive templates known
  // to the index (via the modules that bind them).
  const adaptiveTemplates = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of index.modules) {
      if (m.template?.class === 'adaptive' && m.template.id) {
        out.set(m.template.id, m.template.resolved ?? '1.0.0');
      }
    }
    return [...out.entries()];
  }, [index.modules]);
  const [templateId, setTemplateId] = useState('');
  useEffect(() => {
    if (templateId || adaptiveTemplates.length === 0) return;
    const preferred = adaptiveTemplates.find(([id]) => id.includes('lens_insert'));
    setTemplateId((preferred ?? adaptiveTemplates[0])[0]);
  }, [adaptiveTemplates, templateId]);

  const opts = { vertexOffsetMm, holdClass, dzRangeMm };
  const glbUrl = useMemo(() => {
    const b64 = result?.artifacts['model.glb'];
    if (!b64) return null;
    return URL.createObjectURL(
      new Blob([base64ToBytes(b64) as BlobPart], { type: 'model/gltf-binary' }),
    );
  }, [result]);
  useEffect(
    () => () => {
      if (glbUrl) {
        URL.revokeObjectURL(glbUrl);
        useGLTF.clear(glbUrl);
      }
    },
    [glbUrl],
  );
  const fitWarning = insertFit(builtSize);

  const build = async () => {
    if (!ctx.record || !templateId) return;
    setBusy(true);
    setError(null);
    setBridgeless(null);
    setResult(null);
    setBuiltSize(null);
    try {
      const design = onePartDesignFiles(ctx.record, opts);
      setResult(
        await generateTemplate({
          templateId,
          files: design.files,
          component: design.component,
        }),
      );
    } catch (err) {
      if (
        err instanceof CoreServiceError &&
        (err.code === 'E_NO_BRIDGE' || err.code === 'E_BRIDGE_UNREACHABLE')
      ) {
        // A typed outcome, not an error: the machine is not there.
        setBridgeless(`${err.code}: ${err.message}`);
      } else {
        setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadFx = () => {
    if (!ctx.record) return;
    const blob = new Blob([fxChangesetJson(ctx.record, templateId || null, opts)], {
      type: 'application/json',
    });
    saveAs(blob, 'optikit-fx.json');
  };

  /** Accept: component + module (the master template is REFERENCED, not
   * rewritten — its record already lives in the library). */
  const acceptFiles = () => {
    if (!ctx.record) return null;
    const version = adaptiveTemplates.find(([id]) => id === templateId)?.[1] ?? '1.0.0';
    const module = t2ModuleRecord(ctx.record, templateId, version);
    return {
      files: {
        [`components/${ctx.record.id}/component.yml`]: recordToYaml(ctx.record),
        [`modules/${module.id as string}/module.yml`]: stringifyYaml(module),
      },
      moduleId: module.id as string,
    };
  };

  const acceptPublish = async () => {
    const m = acceptFiles();
    if (!m) return;
    setBusy(true);
    setError(null);
    try {
      const res = await publishRecordFiles(m.files, index.url);
      setWritten(`${m.moduleId} written (${res.written.length} file(s)) — place it from the palette`);
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const acceptDownload = async () => {
    const m = acceptFiles();
    if (!m || !result) return;
    const files: Record<string, string | Uint8Array> = { ...m.files };
    for (const [name, b64] of Object.entries(result.artifacts)) {
      files[`out/${result.template_id}/${result.key}/${name}`] = base64ToBytes(b64);
    }
    const blob = await zipDsn(files, `${m.moduleId}-records`);
    saveAs(blob, `${m.moduleId}-records.zip`);
    setWritten(`${m.moduleId} records + build artifacts downloaded`);
  };

  if (holdClass !== 'adaptive') {
    return (
      <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
        <Alert severity="info">
          <Typography variant="caption">
            A FIXED insert has no knob for the bridge to parameterize — the working build for
            “fixed in place” is the printable T3 holder below (boolean-carved from the
            prescription at the position you chose), or a manual Inventor design via the
            WP-84 round trip. Pick “adjustable along the beam” one step back if you wanted the
            machinable T2 insert.
          </Typography>
        </Alert>
        <Button
          variant="contained"
          disabled={!ctx.record || ctx.draft.surfaces.length === 0}
          onClick={() => setHolderOpen(true)}
          sx={{ alignSelf: 'flex-start' }}
        >
          generate a printable holder… (T3)
        </Button>
        {ctx.record && (
          <GenerateDraftHolderDialog
            draft={ctx.draft}
            record={ctx.record}
            open={holderOpen}
            onClose={() => setHolderOpen(false)}
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 680 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <TextField
          select
          size="small"
          label="master insert (adaptive template)"
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          sx={{ minWidth: 260 }}
          disabled={adaptiveTemplates.length === 0}
          helperText={
            adaptiveTemplates.length === 0
              ? 'no adaptive template in the library index — the bridge needs a master insert to parameterize'
              : undefined
          }
        >
          {adaptiveTemplates.map(([id, version]) => (
            <MenuItem key={id} value={id}>
              {id}@{version}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          disabled={busy || !ctx.record || !templateId}
          onClick={() => void build()}
        >
          {busy ? 'building…' : 'build the insert (Inventor bridge)'}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        The wizard synthesizes a one-part design (your prescription, the position from two
        steps back as the dz value, the travel range you declared) and hands it to the bridge
        — the exact contract the assembly’s “regenerate insert” uses.
      </Typography>

      {bridgeless && (
        <Alert severity="warning">
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
            no Inventor machine is reachable ({bridgeless.split(':')[0]}) — two working roads:
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            1 · take the fx changeset to the Inventor machine and apply it there
            (apply_fx_params.py); 2 · print a T3 holder instead — the same four answers, a
            printable part today, the machinable insert when the bridge is back.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={downloadFx}>
              download optikit-fx.json
            </Button>
            <Button size="small" variant="outlined" onClick={() => setHolderOpen(true)}>
              generate a printable holder… (T3)
            </Button>
          </Stack>
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
        </Alert>
      )}

      {result && (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Chip size="small" label={`key ${result.key}`} sx={{ fontFamily: 'monospace' }} />
            <Chip
              size="small"
              label={result.regenerated ? 'regenerated via the bridge' : 'cache hit'}
              color={result.regenerated ? 'default' : 'success'}
            />
            {builtSize && (
              <Chip
                size="small"
                color={fitWarning ? 'error' : 'success'}
                label={`measured ${builtSize.map(v => v.toFixed(1)).join(' × ')} mm`}
              />
            )}
            {Object.keys(result.artifacts).map(name => (
              <Chip key={name} size="small" variant="outlined" label={name} />
            ))}
          </Stack>
          {fitWarning && (
            <Alert severity="error">
              <Typography variant="caption">{fitWarning}</Typography>
            </Alert>
          )}
          {glbUrl && (
            <Box sx={{ height: 220, borderRadius: 1, overflow: 'hidden' }}>
              <PreviewCanvas camera={{ position: [70, 55, 70], fov: 40 }}>
                <ambientLight intensity={0.8} />
                <directionalLight position={[80, 120, 60]} intensity={1.1} />
                {/* the cell outline the insert must live inside */}
                <mesh>
                  <boxGeometry args={[50, 55, 50]} />
                  <meshBasicMaterial color="#4a90d9" wireframe transparent opacity={0.3} />
                </mesh>
                <BuiltGlbPreview url={glbUrl} onSize={setBuiltSize} />
                <OrbitControls enableDamping />
              </PreviewCanvas>
            </Box>
          )}
          {written && <Alert severity="success">{written}</Alert>}
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="contained"
              disabled={busy || Boolean(fitWarning)}
              onClick={() => void acceptPublish()}
            >
              accept · write component + module into the library
            </Button>
            <Button variant="outlined" disabled={busy} onClick={() => void acceptDownload()}>
              accept · download records + artifacts
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            The module binds your prescription to the master insert ({templateId}) — the
            template record itself is referenced, not rewritten. The build artifacts live in
            the service’s out/ tree (and in the download).
          </Typography>
        </>
      )}
      {ctx.record && (
        <GenerateDraftHolderDialog
          draft={ctx.draft}
          record={ctx.record}
          open={holderOpen}
          onClose={() => setHolderOpen(false)}
        />
      )}
    </Stack>
  );
}

// ── road B · "I have a CAD file of a device" (WP-112) ────────────────────────

export function DeviceMechanics() {
  const meshSizeMm = useBindStore(s => s.meshSizeMm);
  if (!meshSizeMm) return null;
  return (
    <Chip
      size="small"
      sx={{ alignSelf: 'flex-start' }}
      label={`measured bounding box: ${meshSizeMm.map(v => v.toFixed(1)).join(' × ')} mm`}
    />
  );
}

export function DeviceOptics({ ctx }: { ctx: WizardCtx }) {
  return (
    <Stack spacing={2.5}>
      <RecordForm
        draft={ctx.draft}
        onChange={ctx.setDraft}
        sections={{ framesPorts: false }}
      />
      <DerivedPortsSummary ctx={ctx} />
      <DraftErrors ctx={ctx} />
    </Stack>
  );
}

export function DeviceAlign({ ctx }: { ctx: WizardCtx }) {
  const expected = expectedDatumOf(ctx.draft.category);
  const datums = useBindStore(s => s.datums);
  const isFold = ['mirror', 'beamsplitter', 'dichroic'].includes(ctx.draft.category);
  // WP-112.3: the step opens READY to click — datum mode, the category's
  // datum kind preselected, the optical overlay on so the beam renders live
  // and a wrong axis is visibly wrong.
  useEffect(() => {
    useBindStore.setState({ mode: 'datum', nextKind: expected.kind, showOptics: true });
  }, [expected.kind]);
  return (
    <Stack spacing={1}>
      <Alert severity={datums.length > 0 ? 'success' : 'info'}>
        <Typography variant="caption">
          {datums.length > 0
            ? `${datums.length} datum${datums.length > 1 ? 's' : ''} placed — check the beam
               overlay: the arrow must leave through the real ${expected.what}, then confirm
               the direction on the datum row below the viewport.`
            : `A datum is the point on the part the optical model is measured from. For a
               ${ctx.draft.category}, click ${expected.what} — the viewport is already in
               datum mode with “${expected.kind}” selected.`}
          {isFold &&
            ' The incoming and outgoing beam arms update live as the plane is picked — if the fold looks wrong here, it will be wrong in the schematic too.'}
        </Typography>
      </Alert>
    </Stack>
  );
}

// ── road C · "I have an Inventor cube" (WP-113) ──────────────────────────────

export function CubeMesh() {
  const meshSizeMm = useBindStore(s => s.meshSizeMm);
  const fitToCube = useBindStore(s => s.fitToCube);
  const meshBboxCenter = useBindStore(s => s.meshBboxCenter);
  // WP-113.1: the WP-109 cell check runs HERE, at import — a mesh that is no
  // cell in any orientation is the wrong file or the wrong units, and finding
  // out in the wizard beats finding out when it renders on its side. An
  // off-centre origin is a fixable note, not a refusal.
  const mismatch = cellMismatch(meshSizeMm);
  const offCentre = offCentreNote(meshBboxCenter);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        {meshSizeMm && (
          <Chip
            size="small"
            color={mismatch ? 'error' : 'success'}
            label={`measured: ${meshSizeMm.map(v => v.toFixed(1)).join(' × ')} mm — a cell is 50 × 50 × 55`}
          />
        )}
        <Button size="small" variant="outlined" disabled={!meshBboxCenter} onClick={fitToCube}>
          fit to cube
        </Button>
      </Stack>
      {mismatch && (
        <Alert severity="error">
          <Typography variant="caption">{mismatch}</Typography>
        </Alert>
      )}
      {!mismatch && offCentre && (
        <Alert severity="warning">
          <Typography variant="caption">{offCentre}</Typography>
        </Alert>
      )}
    </Stack>
  );
}

/** WP-116: the POSE step — "place the record frame". The click is a
 * position picker, the rotation is one of 24 discrete steps, and the beam
 * directions are COMPUTED from the record's ports through the pose — never
 * asked. Marker-stamped exports (WP-113.2) still extract the origin
 * automatically through the same importer the CLI uses. */
export function CubeDatums({ ctx }: { ctx: WizardCtx }) {
  const glbBytes = useBindStore(s => s.glbBytes);
  const meshFile = useBindStore(s => s.meshFile);
  const insertPose = useBindStore(s => s.insertPose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{
    frames: [string, { x: number; y: number; z: number; apertureMm: number | null }][];
    review: string[];
    opticalFrame: string;
  } | null>(null);

  // The step opens READY: identity pose seeded, pose mode active, overlay on.
  useEffect(() => {
    const st = useBindStore.getState();
    if (!st.insertPose) st.setInsertPose({ ...IDENTITY_INSERT_POSE });
    useBindStore.setState({ mode: 'pose', showOptics: true });
  }, []);

  const extract = async () => {
    if (!glbBytes) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const res = await importGlb(meshFile || 'cube.glb', glbBytes, {
        namespace: ctx.draft.namespace,
      });
      const optics = (res.component as {
        optics?: {
          frames?: Record<string, Record<string, unknown>>;
          ports?: Record<string, { frame?: string; direction?: string }>;
        };
      }).optics;
      const frames = Object.entries(optics?.frames ?? {}).map(
        ([name, f]) =>
          [
            name,
            {
              x: Number(f['x-mm'] ?? 0),
              y: Number(f['y-mm'] ?? 0),
              z: Number(f['z-mm'] ?? 0),
              apertureMm:
                f['clear-aperture-mm'] != null ? Number(f['clear-aperture-mm']) : null,
            },
          ] as [string, { x: number; y: number; z: number; apertureMm: number | null }],
      );
      const front = optics?.ports?.front;
      setFound({
        frames,
        review: res.review,
        opticalFrame: front?.frame ?? frames[0]?.[0] ?? '',
      });
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!found) return;
    const opt = found.frames.find(([name]) => name === found.opticalFrame) ?? found.frames[0];
    if (opt) {
      const st = useBindStore.getState();
      if (!st.insertPose) st.setInsertPose({ ...IDENTITY_INSERT_POSE });
      st.setInsertOffsetMm([opt[1].x, opt[1].y, opt[1].z]);
    }
    setFound(null);
  };

  return (
    <Stack spacing={1}>
      <Alert severity={insertPose ? 'success' : 'info'}>
        <Typography variant="caption">
          The record already says what the optic does — this step only says WHERE its frame
          sits in the cube. Click the optical surface to set the origin, use the 90° buttons
          for the orientation (one of the 24 insert rotations); the beam directions below the
          viewport are computed from the record through the pose, never asked.
        </Typography>
      </Alert>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="outlined" disabled={!glbBytes || busy} onClick={() => void extract()}>
          {busy ? 'reading markers…' : 'set the origin from the markers'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          for exports following the Inventor naming contract (PLN / AXIS / PT nodes) — an
          unstamped file just reports what it guessed, and you click instead.
        </Typography>
      </Stack>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
        </Alert>
      )}
      {found && (
        <Alert
          severity={found.frames.length > 0 ? 'success' : 'warning'}
          action={
            found.frames.length > 0 ? (
              <Button size="small" onClick={confirm}>use as origin</Button>
            ) : undefined
          }
        >
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
            {found.frames.length > 0
              ? `found ${found.frames.length} datum frame(s):`
              : 'no marker frames found in this export:'}
          </Typography>
          {found.frames.map(([name, f]) => (
            <Typography key={name} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
              • {name} at ({f.x.toFixed(1)}, {f.y.toFixed(1)}, {f.z.toFixed(1)}) mm
              {f.apertureMm !== null ? ` · Ø${f.apertureMm} mm` : ''}
            </Typography>
          ))}
          {found.review.map((r, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block' }}>
              ⚠ {r}
            </Typography>
          ))}
        </Alert>
      )}
    </Stack>
  );
}

/** WP-113.4: verify BEFORE publish — do the optical model and the mechanics
 * agree? Runs optikit-core's verify_t1 over the PROPOSED trio via the
 * service; nothing has been written yet. */
export function CubeVerify({ ctx }: { ctx: WizardCtx }) {
  const bind = useBindStore();
  const [result, setResult] = useState<VerifyT1Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const output = useMemo(
    () => buildWizardOutput('cube', ctx.draft, ctx.record, bind),
    [ctx.draft, ctx.record, bind],
  );
  const records = useMemo(
    () =>
      Object.entries(output.files)
        .filter(([p, c]) => typeof c === 'string' && p.endsWith('.yml'))
        .map(([, c]) => c as string),
    [output.files],
  );

  const run = useCallback(async () => {
    if (records.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await verifyProposedT1(records));
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  }, [records]);

  // Run once when the step opens with a complete trio.
  useEffect(() => {
    if (records.length >= 3 && result === null && !busy && !error) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);

  const vacuous = result?.findings.some(f => f.code === 'W_NO_INSERT_FRAME') ?? false;

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 680 }}>
      {records.length < 3 && (
        <Alert severity="warning">
          <Typography variant="caption">
            the trio is not complete yet — verify-t1 checks a module’s bound pair, so it needs
            the component, the template and the module. Go back to the steps that are missing.
          </Typography>
        </Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="outlined" disabled={busy || records.length < 3} onClick={() => void run()}>
          {busy ? 'verifying…' : result ? 're-run verify-t1' : 'run verify-t1'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          compares the component’s optical frame against the template’s declared insert frame
          (tolerance 0.05 mm).
        </Typography>
      </Stack>
      {error && (
        <Alert severity="warning" onClose={() => setError(null)}>
          <Typography variant="caption">
            verify-t1 could not run ({error}) — you can still publish, but nothing has checked
            that the model and the metal agree.
          </Typography>
        </Alert>
      )}
      {result && (
        <>
          {result.ok && !vacuous && result.findings.length === 0 && (
            <Alert severity="success">
              <Typography variant="caption">
                the optical model and the mechanics agree — every declared insert frame matches
                the component’s pose within 0.05 mm.
              </Typography>
            </Alert>
          )}
          {vacuous && (
            <Alert severity="warning">
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                this OK is vacuous — the template declares no insert frames, so no pose was
                ever compared.
              </Typography>
              <Typography variant="caption">
                That is precisely how a wrong record ships. Stamp the PLN datum markers in the
                Inventor export (or place datums on the previous step) so verify-t1 has
                something to check.
              </Typography>
            </Alert>
          )}
          {result.findings
            .filter(f => f.code !== 'W_NO_INSERT_FRAME')
            .map((f, i) => (
              <Alert key={i} severity={f.level === 'error' ? 'error' : 'warning'}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  {f.code}
                </Typography>
                <Typography variant="caption">{f.message}</Typography>
              </Alert>
            ))}
        </>
      )}
    </Stack>
  );
}


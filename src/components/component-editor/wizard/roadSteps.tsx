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
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  PORT_AXIS_VECTORS,
  derivedPortWarnings,
  foldDegOfDraft,
  paraxialEflMm,
} from '../../../model/componentRecord';
import { DecimalField } from '../../common/DecimalField';
import { MechanicsPanel } from '../../bind/MechanicsPanel';

import { useBindStore } from '../../bind/bindStore';
import {
  CoreServiceError,
  importGlb,
  verifyProposedT1,
  type VerifyT1Response,
} from '../../../api/coreClient';
import { GenerateDraftHolderDialog } from '../GenerateDraftHolderDialog';
import { RecordForm } from '../RecordForm';
import { usePartWizard } from './wizardStore';
import { buildWizardOutput } from './wizardOutput';
import { cellMismatch, expectedDatumOf, type WizardCtx } from './wizardTypes';

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

export function NumbersWhereDoesItSit() {
  const vertexOffsetMm = usePartWizard(s => s.vertexOffsetMm);
  const setVertexOffsetMm = usePartWizard(s => s.setVertexOffsetMm);
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 560 }}>
      <DecimalField
        size="small"
        label="front vertex offset from the cube origin, along the optical axis (mm)"
        value={vertexOffsetMm}
        onValue={v => setVertexOffsetMm(v ?? 0)}
        sx={{ maxWidth: 420 }}
      />
      <Typography variant="caption" color="text.secondary">
        0 mm = the front vertex sits at the cube centre — the default every generated holder
        assumes today. Positive values move the optic toward the beam exit.
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

export function NumbersBuildIt({ ctx }: { ctx: WizardCtx }) {
  const [holderOpen, setHolderOpen] = useState(false);
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 620 }}>
      <Alert severity="info">
        <Typography variant="caption">
          The Inventor-bridge build (a machinable insert parameterized from this prescription)
          lands with WP-111 — it needs a placed one-part design and a reachable bridge. The
          printable T3 holder below is the working road today: a two-half insert boolean-carved
          from the prescription, generated by the service.
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
      <Typography variant="caption" color="text.secondary">
        Accepting the holder writes the full trio (component + template + module) through the
        dialog itself — the final step then only needs to save the component record if you skip
        the holder.
      </Typography>
    </Stack>
  );
}

// ── road B · "I have a CAD file of a device" (WP-112) ────────────────────────

export function DeviceMechanics({ ctx }: { ctx: WizardCtx }) {
  const meshSizeMm = useBindStore(s => s.meshSizeMm);
  return (
    <Stack spacing={1}>
      {meshSizeMm && (
        <Chip
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          label={`measured bounding box: ${meshSizeMm.map(v => v.toFixed(1)).join(' × ')} mm`}
        />
      )}
      <MechanicsPanel
        draft={ctx.draft}
        record={ctx.record}
        onDraftChange={ctx.setDraft}
        embed={{ hideMountControls: true, hideExits: true }}
      />
    </Stack>
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
      <MechanicsPanel
        draft={ctx.draft}
        record={ctx.record}
        onDraftChange={ctx.setDraft}
        embed={{ hideMountControls: true, hideExits: true }}
      />
    </Stack>
  );
}

// ── road C · "I have an Inventor cube" (WP-113) ──────────────────────────────

export function CubeMesh({ ctx }: { ctx: WizardCtx }) {
  const meshSizeMm = useBindStore(s => s.meshSizeMm);
  const fitToCube = useBindStore(s => s.fitToCube);
  const meshBboxCenter = useBindStore(s => s.meshBboxCenter);
  // WP-113.1: the WP-109 cell check runs HERE, at import — a mesh that does
  // not measure a cell is the wrong file or the wrong units, and finding out
  // in the wizard beats finding out when it renders on its side.
  const mismatch = cellMismatch(meshSizeMm, meshBboxCenter);
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
      <MechanicsPanel
        draft={ctx.draft}
        record={ctx.record}
        onDraftChange={ctx.setDraft}
        embed={{ hideMountControls: true, hideExits: true }}
      />
    </Stack>
  );
}

/** WP-113.2: the datums step — marker-stamped exports extract them
 * automatically through the SAME importer the CLI uses; the manual click
 * road (DeviceAlign) stays underneath for unstamped files. */
export function CubeDatums({ ctx }: { ctx: WizardCtx }) {
  const glbBytes = useBindStore(s => s.glbBytes);
  const meshFile = useBindStore(s => s.meshFile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{
    frames: [string, { x: number; y: number; z: number; apertureMm: number | null }][];
    review: string[];
    opticalFrame: string;
    frontDirection: string;
  } | null>(null);

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
        frontDirection: front?.direction ?? '-z',
      });
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!found) return;
    const expected = expectedDatumOf(ctx.draft.category);
    useBindStore.setState({
      datums: found.frames.map(([name, f], i) => ({
        id: `marker-${i + 1}`,
        name,
        kind: name === found.opticalFrame ? expected.kind : ('custom' as const),
        pointMm: [f.x, f.y, f.z] as [number, number, number],
        direction: (PORT_AXIS_VECTORS[found.frontDirection] ?? [0, 0, -1]) as [
          number, number, number,
        ],
        areaDiameterMm: f.apertureMm,
      })),
    });
    setFound(null);
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button size="small" variant="outlined" disabled={!glbBytes || busy} onClick={() => void extract()}>
          {busy ? 'reading markers…' : 'extract datum frames from the markers'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          for exports following the Inventor naming contract (PLN / AXIS / PT nodes) — an
          unstamped file just reports what it guessed, and you click the datums instead.
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
              <Button size="small" onClick={confirm}>use these</Button>
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
              {name === found.opticalFrame ? ` · beam ${found.frontDirection}` : ''}
            </Typography>
          ))}
          {found.review.map((r, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block' }}>
              ⚠ {r}
            </Typography>
          ))}
        </Alert>
      )}
      <DeviceAlign ctx={ctx} />
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


/**
 * WP-110 — the step BODIES of the three roads: thin compositions that mount
 * the existing panels (RecordForm, MechanicsPanel) with irrelevant controls
 * hidden. Guidance lives in the road definitions (roads.ts); machinery lives
 * in the panels. Only components are exported here (react-refresh rule).
 */

import { useState } from 'react';
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
  derivedPortWarnings,
  foldDegOfDraft,
  paraxialEflMm,
} from '../../../model/componentRecord';
import { DecimalField } from '../../common/DecimalField';
import { MechanicsPanel } from '../../bind/MechanicsPanel';
import { useBindStore } from '../../bind/bindStore';
import { GenerateDraftHolderDialog } from '../GenerateDraftHolderDialog';
import { RecordForm } from '../RecordForm';
import { usePartWizard } from './wizardStore';
import type { WizardCtx } from './wizardTypes';

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
  return (
    <MechanicsPanel
      draft={ctx.draft}
      record={ctx.record}
      onDraftChange={ctx.setDraft}
      embed={{ hideMountControls: true, hideExits: true }}
    />
  );
}

// ── road C · "I have an Inventor cube" (WP-113) ──────────────────────────────

export function CubeMesh({ ctx }: { ctx: WizardCtx }) {
  const meshSizeMm = useBindStore(s => s.meshSizeMm);
  const fitToCube = useBindStore(s => s.fitToCube);
  const meshBboxCenter = useBindStore(s => s.meshBboxCenter);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        {meshSizeMm && (
          <Chip
            size="small"
            label={`measured: ${meshSizeMm.map(v => v.toFixed(1)).join(' × ')} mm — a cell is 50 × 50 × 55`}
          />
        )}
        <Button size="small" variant="outlined" disabled={!meshBboxCenter} onClick={fitToCube}>
          fit to cube
        </Button>
      </Stack>
      <MechanicsPanel
        draft={ctx.draft}
        record={ctx.record}
        onDraftChange={ctx.setDraft}
        embed={{ hideMountControls: true, hideExits: true }}
      />
    </Stack>
  );
}


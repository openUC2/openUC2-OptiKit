/**
 * Live kernel preview controls (EMB-G): the sampling policy /v1/scene3
 * applies to every source (§9.5 — rendering policy, never physics) plus a
 * one-line status of the settled trace. The full detector/readout panel is
 * the G4 slice; this exposes what the kernel already supports.
 */

import { Alert, Box, Divider, MenuItem, Slider, Stack, TextField, Typography } from '@mui/material';
import { KERNEL_SEQUENCES, useKernelStore } from '../../kernel/kernelStore';
import type { KernelSequence } from '../../kernel/kernelStore';
import { segmentCount } from '../../kernel/segments';

const SEQUENCE_HINT: Record<KernelSequence, string> = {
  Grid: 'centered strata — deterministic, even coverage',
  Stratified: 'jittered strata (seeded) — breaks grid artifacts',
  Sobol: 'low-discrepancy — best spot-diagram convergence',
};

export function KernelPreviewPanel() {
  const config = useKernelStore(s => s.config);
  const setConfig = useKernelStore(s => s.setConfig);
  const segments = useKernelStore(s => s.kernel.segments);
  const busy = useKernelStore(s => s.kernel.busy);
  const traceMs = useKernelStore(s => s.kernel.traceMs);
  const serviceError = useKernelStore(s => s.kernel.serviceError);
  const count = segmentCount(segments);

  return (
    <Box>
      <Divider sx={{ my: 1.5 }}>
        <Typography variant="overline">live preview (kernel)</Typography>
      </Divider>

      <Box sx={{ px: 0.5 }}>
        <Typography variant="caption">rays per source: {config.maxRays}</Typography>
        <Slider
          size="small"
          min={8}
          max={512}
          step={8}
          value={config.maxRays}
          onChange={(_, v) => setConfig({ maxRays: v as number })}
        />
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          size="small"
          type="number"
          label="angular samples"
          sx={{ width: 140 }}
          value={config.angularSamples}
          inputProps={{ min: 1, max: 256 }}
          onChange={e => {
            const parsed = Math.round(Number(e.target.value));
            setConfig({ angularSamples: Number.isFinite(parsed) ? Math.max(1, parsed) : 1 });
          }}
          helperText="cones keep an 8-floor"
        />
        <TextField
          select
          size="small"
          label="sequence"
          sx={{ width: 140 }}
          value={config.sequence}
          onChange={e => setConfig({ sequence: e.target.value as KernelSequence })}
          helperText={SEQUENCE_HINT[config.sequence]}
        >
          {KERNEL_SEQUENCES.map(s => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {busy
          ? 'tracing…'
          : count > 0
            ? `${count} segments · kernel ${traceMs.toFixed(1)} ms`
            : 'no trace yet — place a source'}
      </Typography>

      {serviceError && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <Typography variant="caption">{serviceError}</Typography>
        </Alert>
      )}
    </Box>
  );
}

/**
 * Optimize dialog (WP-15): pick the DOFs, run /v1/optimize, review the
 * classified back-annotation deltas, then apply ONLY the accepted rows via
 * document setDofValue. Never auto-applies; rejected rows do nothing.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CoreServiceError,
  optimizeDesign,
  type OptimizeResponse,
  type ServiceDelta,
} from '../../api/coreClient';
import {
  partIdOfComponent,
  setDofValue,
  useSourceDesignStore,
} from '../../document';
import { listRangedDofs, serviceFiles, type RangedDof } from '../../model/dsn/serviceExport';

const CLASSIFICATION_HINTS: Record<string, string> = {
  POSE_UPDATE: 'axial move → lands in a translation DOF',
  TILT_UPDATE: 'tilt → lands in a rotation DOF',
  PART_PARAM: 'part parameter (curvature/thickness) → regenerate the part (T3)',
  PART_SUBSTITUTION: 'no DOF can absorb this — swap the part (report only)',
};

const APPLIABLE = new Set(['POSE_UPDATE', 'TILT_UPDATE']);

function fmt(v: unknown): string {
  if (typeof v === 'number') return Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toFixed(3);
  return String(v ?? '—');
}

export function OptimizeDialog({
  open,
  onClose,
  pathNames,
}: {
  open: boolean;
  onClose: () => void;
  pathNames: string[];
}) {
  const [pathName, setPathName] = useState(pathNames[0] ?? '');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<number | null>(null);

  const dofs: RangedDof[] = useMemo(() => (open ? listRangedDofs() : []), [open]);
  const effectivePath = pathNames.includes(pathName) ? pathName : (pathNames[0] ?? '');
  const chosen = selected ?? new Set(dofs.map(d => d.key));

  const toggleDof = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setApplied(null);
    try {
      const response = await optimizeDesign(serviceFiles(), effectivePath, [...chosen]);
      setResult(response);
      // Pre-check the rows the classifier marked appliable; never auto-apply.
      setAccepted(
        new Set(
          response.deltas
            .map((d, i) => [d, i] as const)
            .filter(([d]) => d.applied && APPLIABLE.has(d.classification))
            .map(([, i]) => i),
        ),
      );
    } catch (err) {
      setError(
        err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  const applyAccepted = () => {
    if (!result) return;
    let n = 0;
    for (const i of accepted) {
      const delta = result.deltas[i];
      if (!delta || !APPLIABLE.has(delta.classification)) continue;
      const dot = delta.param.lastIndexOf('.');
      if (dot <= 0) continue;
      const componentKey = delta.param.slice(0, dot);
      const dofName = delta.param.slice(dot + 1);
      const partId = partIdOfComponent(componentKey);
      const value = typeof delta.new === 'number' ? delta.new : Number(delta.new);
      if (!partId || Number.isNaN(value)) continue;
      setDofValue(partId, dofName, value);
      n += 1;
    }
    if (n > 0) {
      useSourceDesignStore.getState().setProvenance({
        optimized_by: 'optiland',
        run: new Date().toISOString().slice(0, 19),
        merit: result.merit as unknown as Record<string, unknown>,
      });
    }
    setApplied(n);
  };

  const toggleRow = (i: number, delta: ServiceDelta) => {
    if (!APPLIABLE.has(delta.classification)) return;
    const next = new Set(accepted);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setAccepted(next);
  };

  const close = () => {
    setResult(null);
    setError(null);
    setApplied(null);
    setSelected(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Optimize — {effectivePath || 'no path'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {pathNames.length > 1 && (
            <TextField
              select size="small" label="path" value={effectivePath}
              onChange={e => setPathName(e.target.value)} sx={{ width: 220 }}
            >
              {pathNames.map(n => (
                <MenuItem key={n} value={n}>{n}</MenuItem>
              ))}
            </TextField>
          )}

          <Box>
            <Typography variant="overline" color="text.secondary">
              degrees of freedom (declared ranges)
            </Typography>
            {dofs.length === 0 ? (
              <Alert severity="info">
                the design declares no ranged DOFs — nothing to optimize
              </Alert>
            ) : (
              <Stack>
                {dofs.map(dof => (
                  <FormControlLabel
                    key={dof.key}
                    control={
                      <Checkbox
                        size="small"
                        checked={chosen.has(dof.key)}
                        onChange={() => toggleDof(dof.key)}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {dof.key} ∈ [{dof.range[0]}, {dof.range[1]}] {dof.unit}
                        {dof.value !== null && `  (current ${dof.value})`}
                      </Typography>
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Box>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Chip size="small" label={`RMS spot ${(result.merit.rms_spot_before_mm * 1e3).toFixed(1)} → ${(result.merit.rms_spot_after_mm * 1e3).toFixed(1)} µm`} />
                <Chip size="small" variant="outlined" label={`${result.merit.iterations} iterations`} />
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">apply</TableCell>
                    <TableCell>component</TableCell>
                    <TableCell>dof / param</TableCell>
                    <TableCell>old → new</TableCell>
                    <TableCell>classification</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.deltas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          the optimizer found nothing to change
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {result.deltas.map((delta, i) => (
                    <TableRow key={i} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={accepted.has(i)}
                          disabled={!APPLIABLE.has(delta.classification)}
                          onChange={() => toggleRow(i, delta)}
                        />
                      </TableCell>
                      <TableCell>{delta.component}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{delta.param}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>
                        {fmt(delta.old)} → {fmt(delta.new)}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={`${CLASSIFICATION_HINTS[delta.classification] ?? ''}${delta.note ? ` — ${delta.note}` : ''}`}>
                          <Chip
                            size="small"
                            label={delta.classification}
                            color={APPLIABLE.has(delta.classification) ? 'success' : 'warning'}
                            variant="outlined"
                          />
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.findings.length > 0 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {result.findings.map((f, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                      {f.code} at {f.comp}{f.axis ? `.${f.axis}` : ''}: {f.message}
                    </Typography>
                  ))}
                </Alert>
              )}
            </Box>
          )}

          {applied !== null && (
            <Alert severity="success">
              applied {applied} DOF value(s) to the document — provenance will be
              stamped on export
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>close</Button>
        <Button
          variant="outlined"
          onClick={run}
          disabled={busy || chosen.size === 0 || !effectivePath}
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          {busy ? 'optimizing…' : 'run optimize'}
        </Button>
        <Button
          variant="contained"
          onClick={applyAccepted}
          disabled={!result || accepted.size === 0 || applied !== null}
        >
          apply {accepted.size} accepted
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * WP-86 — "calibrate from instrument": the hardware return leg.
 *
 * The optimizer leg (OptimizeDialog) turns a SIMULATION into dof values.
 * This turns the RUNNING INSTRUMENT into dof values: read each actuatable
 * axis over the WP-26 UC2-REST link (or type what the controller shows),
 * hand the measurements to `/v1/calibrate`, and review the SAME classified
 * table before anything is written. Applying stamps
 * `provenance.source: instrument`, so a design calibrated at the bench is
 * distinguishable from one an optimizer moved.
 *
 * Nothing here decides what is legal — the service does (declared ranges,
 * unknown axes); the dialog only shows it and lets the user accept rows.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { Download as ReadIcon } from '@mui/icons-material';
import {
  CoreServiceError,
  calibrateDesign,
  type CalibrateResponse,
  type ServiceDelta,
} from '../../api/coreClient';
import {
  getPart,
  libraryEntryOf,
  partIdOfComponent,
  setDofValue,
  useSourceDesignStore,
} from '../../document';
import {
  getDeviceUrl,
  readAxisPosition,
  setDeviceUrl,
  type AxisReading,
} from '../../model/actuation';
import { listRangedDofs, serviceFiles } from '../../model/dsn/serviceExport';

const APPLIABLE = new Set(['POSE_UPDATE', 'TILT_UPDATE']);

function fmt(v: unknown): string {
  if (typeof v === 'number') return Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toFixed(3);
  return String(v ?? '—');
}

/** One axis the instrument can be asked about. */
interface Axis {
  key: string;
  partId: string;
  partRef: string;
  dofName: string;
  unit: string;
  actuatable: boolean;
  /** What the DESIGN currently says (for the side-by-side). */
  designValue: number | null;
}

export function CalibrateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [deviceUrl, setDeviceUrlState] = useState(getDeviceUrl);
  const [measured, setMeasured] = useState<Record<string, string>>({});
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrateResponse | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [applied, setApplied] = useState<number | null>(null);

  /** Every declared axis of a placed part, with its firmware facts. */
  const axes: Axis[] = useMemo(() => {
    if (!open) return [];
    return listRangedDofs()
      .filter(d => d.partId)
      .map(d => {
        const part = getPart(d.partId!);
        const lib = part ? libraryEntryOf(part.libraryRef) : undefined;
        const dof = lib?.dofs.find(x => x.name === d.name);
        return {
          key: d.key,
          partId: d.partId!,
          partRef: part?.ref ?? d.componentKey,
          dofName: d.name,
          unit: d.unit,
          actuatable: Boolean(dof?.actuatable),
          designValue: d.value,
        };
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMeasured({});
    setReadErrors({});
    setResult(null);
    setApplied(null);
    setError(null);
  }, [open]);

  /** Ask the device where each actuatable axis currently is. */
  const readAll = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setApplied(null);
    const values: Record<string, string> = { ...measured };
    const errors: Record<string, string> = {};
    for (const axis of axes) {
      if (!axis.actuatable) continue;
      const part = getPart(axis.partId);
      const lib = part ? libraryEntryOf(part.libraryRef) : undefined;
      const dof = lib?.dofs.find(x => x.name === axis.dofName);
      if (!dof) continue;
      const reading: AxisReading = await readAxisPosition(dof, {
        key: axis.key,
        partId: axis.partId,
      });
      if (reading.value !== null) values[axis.key] = String(reading.value);
      else if (reading.error) errors[axis.key] = reading.error;
    }
    setMeasured(values);
    setReadErrors(errors);
    setBusy(false);
  };

  /** The typed/read numbers, as the service wants them. */
  const measurements = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, text] of Object.entries(measured)) {
      const value = Number(text);
      if (text.trim() !== '' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  }, [measured]);

  const classify = async () => {
    setBusy(true);
    setError(null);
    setApplied(null);
    try {
      const response = await calibrateDesign(serviceFiles(), measurements, {
        instrument: deviceUrl || 'manual entry',
      });
      setResult(response);
      setAccepted(
        new Set(
          response.deltas
            .map((d, i) => [d, i] as const)
            .filter(([d]) => d.applied && APPLIABLE.has(d.classification))
            .map(([, i]) => i),
        ),
      );
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
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
      const partId = partIdOfComponent(delta.param.slice(0, dot));
      const value = typeof delta.new === 'number' ? delta.new : Number(delta.new);
      if (!partId || Number.isNaN(value)) continue;
      setDofValue(partId, delta.param.slice(dot + 1), value);
      n += 1;
    }
    if (n > 0) {
      // The provenance is the point: these numbers came from the bench.
      useSourceDesignStore.getState().setProvenance({
        source: 'instrument',
        instrument: deviceUrl || 'manual entry',
        run: new Date().toISOString().slice(0, 19),
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

  const readable = axes.filter(a => a.actuatable).length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Calibrate from instrument</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            Read where the axes ACTUALLY are on the running instrument and write those
            positions back into the design. The same review-then-apply path the optimizer
            uses — but the numbers come from the bench, and the design records that
            (<code>provenance.source: instrument</code>).
          </Typography>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" label="device URL" placeholder="http://192.168.4.1"
              value={deviceUrl}
              onChange={e => setDeviceUrlState(e.target.value)}
              onBlur={() => setDeviceUrl(deviceUrl.trim())}
              sx={{ flex: 1 }}
            />
            <Tooltip title={readable > 0
              ? `GET each actuatable axis's position (${readable} axis/axes)`
              : 'no actuatable axis on any placed part — type measurements by hand instead'}>
              <span>
                <Button
                  size="small" variant="outlined" startIcon={busy ? <CircularProgress size={12} /> : <ReadIcon />}
                  disabled={busy || readable === 0}
                  onClick={() => void readAll()}
                >
                  read axes
                </Button>
              </span>
            </Tooltip>
          </Stack>

          {axes.length === 0 ? (
            <Alert severity="info">
              no declared axes on any placed part — place a T2 part (a focus stage, a galvo)
              to calibrate it
            </Alert>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>axis</TableCell>
                  <TableCell align="right">design</TableCell>
                  <TableCell align="right">measured</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {axes.map(axis => (
                  <TableRow key={axis.key} hover>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {axis.partRef}.{axis.dofName}
                      </Typography>
                      {!axis.actuatable && (
                        <Tooltip title="the template does not declare this axis actuatable (WP-42) — it cannot be read, but a hand-typed measurement still counts">
                          <Chip size="small" variant="outlined" label="not actuated"
                            sx={{ ml: 0.5, height: 16, fontSize: 9 }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption">
                        {axis.designValue === null ? '—' : axis.designValue.toFixed(3)} {axis.unit}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" variant="standard" placeholder="—"
                        value={measured[axis.key] ?? ''}
                        onChange={e =>
                          setMeasured(m => ({ ...m, [axis.key]: e.target.value }))
                        }
                        slotProps={{ htmlInput: { inputMode: 'decimal', style: { width: 84, textAlign: 'right' } } }}
                      />
                    </TableCell>
                    <TableCell>
                      {readErrors[axis.key] && (
                        <Tooltip title={readErrors[axis.key]}>
                          <Typography variant="caption" color="warning.main">could not read</Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
            </Alert>
          )}

          {result && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                classified deltas — tick what to write
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>axis</TableCell>
                    <TableCell align="right">design</TableCell>
                    <TableCell align="right">instrument</TableCell>
                    <TableCell>note</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {result.deltas.map((delta, i) => (
                    <TableRow key={`${delta.param}-${i}`} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={accepted.has(i)}
                          disabled={!APPLIABLE.has(delta.classification) || !delta.applied}
                          onChange={() => toggleRow(i, delta)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {delta.param}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{fmt(delta.old)}</TableCell>
                      <TableCell align="right">{fmt(delta.new)}</TableCell>
                      <TableCell>
                        <Typography variant="caption" color={delta.applied ? 'text.secondary' : 'warning.main'}>
                          {delta.note || (delta.applied ? delta.classification : 'not applied')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {result.deltas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="caption" color="text.secondary">
                          nothing to write — the instrument agrees with the design
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {result.findings.map((f, i) => (
                <Alert key={i} severity={f.code.startsWith('W_') ? 'info' : 'warning'} sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{f.code}</Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>{f.message}</Typography>
                </Alert>
              ))}
            </Box>
          )}

          {applied !== null && (
            <Alert severity="success">
              wrote {applied} measured dof value(s) into the design — provenance:
              instrument ({deviceUrl || 'manual entry'})
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>close</Button>
        <Button
          variant="outlined"
          onClick={() => void classify()}
          disabled={busy || Object.keys(measurements).length === 0}
          startIcon={busy ? <CircularProgress size={14} /> : undefined}
        >
          classify {Object.keys(measurements).length || ''} measurement(s)
        </Button>
        <Button
          variant="contained"
          onClick={applyAccepted}
          disabled={!result || accepted.size === 0}
        >
          write {accepted.size || ''} value(s)
        </Button>
      </DialogActions>
    </Dialog>
  );
}

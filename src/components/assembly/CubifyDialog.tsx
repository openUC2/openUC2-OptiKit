/**
 * Cubify review dialog (WP-16): the forward-annotation table from /v1/cubify —
 * per part the decomposed grid pose (cell / rot24 / residual offsets) plus the
 * DRC findings — reviewed before acceptance, never applied silently.
 */

import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useAssemblyStore } from './assemblyStore';

function fmtVec(v: [number, number, number], digits = 0): string {
  if (v.every(x => x === 0)) return '—';
  return `(${v.map(x => x.toFixed(digits)).join(', ')})`;
}

export function CubifyDialog() {
  const review = useAssemblyStore(s => s.review);
  const applyCubify = useAssemblyStore(s => s.applyCubify);
  const dismissCubify = useAssemblyStore(s => s.dismissCubify);
  const hasBaseline = useAssemblyStore(s => s.acceptedSignatures !== null);
  const [showAll, setShowAll] = useState(false);
  if (!review) return null;

  const errorCount = review.findings.filter(f => f.severity === 'error').length;
  const changedCount = review.rows.filter(r => r.changed).length;
  // Re-cubify (WP-17): default to the diff — only what moved since the last
  // accept. The first cubify has no baseline and shows everything.
  const diffMode = hasBaseline && !showAll;
  const rows = diffMode ? review.rows.filter(r => r.changed) : review.rows;

  return (
    <Dialog open onClose={dismissCubify} maxWidth="md" fullWidth>
      <DialogTitle>
        {hasBaseline ? 'Update assembly from schematic' : 'Cubify — world poses → grid poses'}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          p = S·g + δ, R = R24·ΔR — the world geometry is unchanged; this
          review accepts the decomposition and its design-rule findings.
        </Typography>
        {hasBaseline && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Chip
              size="small"
              color={changedCount > 0 ? 'warning' : 'success'}
              label={
                changedCount > 0
                  ? `${changedCount} part(s) changed since the last accept`
                  : 'no grid-pose changes since the last accept'
              }
            />
            <FormControlLabel
              control={
                <Switch size="small" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              }
              label={<Typography variant="caption">show unchanged parts</Typography>}
            />
          </Stack>
        )}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>component</TableCell>
              <TableCell>cell (g)</TableCell>
              <TableCell>offset-mm (δ)</TableCell>
              <TableCell>rot24</TableCell>
              <TableCell>offset-deg</TableCell>
              <TableCell>findings</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow
                key={row.componentKey}
                hover
                sx={row.changed && hasBaseline ? { '& td': { color: 'warning.light' } } : undefined}
              >
                <TableCell sx={{ fontFamily: 'monospace' }}>{row.componentKey}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{fmtVec(row.cell)}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{fmtVec(row.offsetMm, 2)}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{row.rot}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{row.offsetDeg || '—'}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                    {row.findings.map((code, i) => (
                      <Chip key={i} size="small" color="error" variant="outlined" label={code}
                        sx={{ height: 18, fontSize: 10 }} />
                    ))}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {errorCount > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {errorCount} design-rule finding(s) — accepting keeps them as markers
            in the assembly view.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={dismissCubify}>dismiss</Button>
        <Button variant="contained" onClick={applyCubify}>
          accept grid poses
        </Button>
      </DialogActions>
    </Dialog>
  );
}

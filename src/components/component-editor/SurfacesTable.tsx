/**
 * Surfaces table: edits the verbatim Optiland fragment row by row.
 * Radius empty = flat (∞); material empty = air; the last surface never
 * carries a thickness (air gaps to the next component live in the layout).
 */

import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { MATERIAL_NAMES } from '../../model/materials';
import type { SurfaceDraft } from '../../model/componentRecord';

function NumberCell({
  value,
  onChange,
  placeholder,
  width = 76,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <TextField
      size="small"
      variant="standard"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value.trim();
        if (raw === '') return onChange(null);
        const num = Number(raw);
        if (!Number.isNaN(num)) onChange(num);
      }}
      inputProps={{ inputMode: 'decimal', style: { width, fontSize: 13 } }}
    />
  );
}

export function SurfacesTable({
  surfaces,
  onChange,
}: {
  surfaces: SurfaceDraft[];
  onChange: (surfaces: SurfaceDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<SurfaceDraft>) => {
    const next = surfaces.map((s, k) => (k === i ? { ...s, ...patch } : s));
    onChange(next);
  };
  const setStop = (i: number, on: boolean) => {
    onChange(surfaces.map((s, k) => ({ ...s, isStop: on && k === i })));
  };
  const addRow = () => {
    const next = [...surfaces];
    if (next.length > 0 && next[next.length - 1].thicknessMm === null) {
      next[next.length - 1] = { ...next[next.length - 1], thicknessMm: 1 };
    }
    next.push({
      radiusMm: null, thicknessMm: null, material: '',
      semiApertureMm: next[next.length - 1]?.semiApertureMm ?? 12.7,
      conic: 0, isStop: false, reflective: false,
    });
    onChange(next);
  };
  const removeRow = (i: number) => {
    const next = surfaces.filter((_, k) => k !== i);
    if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], thicknessMm: null };
    onChange(next);
  };

  return (
    <Box>
      <Table size="small" sx={{ '& td, & th': { px: 0.75, whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>radius mm (∅=∞)</TableCell>
            <TableCell>thickness mm</TableCell>
            <TableCell>material (∅=air)</TableCell>
            <TableCell>semi-ap. mm</TableCell>
            <TableCell>conic</TableCell>
            <TableCell align="center">stop</TableCell>
            <TableCell align="center">refl.</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {surfaces.map((s, i) => {
            const isLast = i === surfaces.length - 1;
            return (
              <TableRow key={i}>
                <TableCell>{i}</TableCell>
                <TableCell>
                  <NumberCell value={s.radiusMm} placeholder="∞" onChange={v => update(i, { radiusMm: v })} />
                </TableCell>
                <TableCell>
                  {isLast ? (
                    <Tooltip title="the last surface carries no thickness — gaps to the next component are air gaps">
                      <span style={{ opacity: 0.4 }}>—</span>
                    </Tooltip>
                  ) : (
                    <NumberCell value={s.thicknessMm} onChange={v => update(i, { thicknessMm: v })} />
                  )}
                </TableCell>
                <TableCell>
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={MATERIAL_NAMES}
                    value={s.material}
                    onInputChange={(_, v) => update(i, { material: v ?? '' })}
                    renderInput={params => (
                      <TextField {...params} variant="standard" placeholder="air"
                        inputProps={{ ...params.inputProps, style: { width: 110, fontSize: 13 } }} />
                    )}
                    sx={{ minWidth: 130 }}
                  />
                </TableCell>
                <TableCell>
                  <NumberCell value={s.semiApertureMm} onChange={v => update(i, { semiApertureMm: v })} width={56} />
                </TableCell>
                <TableCell>
                  <NumberCell value={s.conic} onChange={v => update(i, { conic: v ?? 0 })} width={44} />
                </TableCell>
                <TableCell align="center">
                  <Checkbox size="small" checked={s.isStop} onChange={e => setStop(i, e.target.checked)} />
                </TableCell>
                <TableCell align="center">
                  <Checkbox size="small" checked={s.reflective} onChange={e => update(i, { reflective: e.target.checked })} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => removeRow(i)}>
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ mt: 0.5 }}>
        add surface
      </Button>
    </Box>
  );
}

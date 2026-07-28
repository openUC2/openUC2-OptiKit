/**
 * Surfaces table: edits the verbatim Optiland fragment row by row.
 * Radius empty = flat (∞); material empty = air; the last surface never
 * carries a thickness (air gaps to the next component live in the layout).
 *
 * WP-75: the table shows the ELEMENT grouping over the stack — which
 * surfaces form which glass element (E1, E2, …), with air gaps visible as
 * the boundaries between them — and supports the "ideal / paraxial element"
 * row kind: a thin-lens surface with a focal length instead of glass, the
 * honest model of a catalog objective with no known prescription.
 */

import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
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
import { glassElements } from '../../model/componentRecord';
import type { SurfaceDraft } from '../../model/componentRecord';

/** Distinguishable tints for the element badges (cycled). */
const ELEMENT_COLORS = ['#1f9c7c', '#7b5ea7', '#c77d2c', '#3877c2'];

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
  const appendRow = (over: Partial<SurfaceDraft> = {}) => {
    const next = [...surfaces];
    if (next.length > 0 && next[next.length - 1].thicknessMm === null) {
      next[next.length - 1] = { ...next[next.length - 1], thicknessMm: 1 };
    }
    next.push({
      radiusMm: null, thicknessMm: null, material: '',
      semiApertureMm: next[next.length - 1]?.semiApertureMm ?? 12.7,
      conic: 0, isStop: false, reflective: false,
      ...over,
    });
    onChange(next);
  };
  const removeRow = (i: number) => {
    const next = surfaces.filter((_, k) => k !== i);
    if (next.length > 0) next[next.length - 1] = { ...next[next.length - 1], thicknessMm: null };
    onChange(next);
  };

  // WP-75: element grouping (mirrors optikit-core's glass_groups).
  const elements = glassElements(surfaces);
  const elementOf = (i: number) => elements.findIndex(e => i >= e.start && i <= e.end);
  const multiElement = elements.length > 1;

  return (
    <Box>
      <Table size="small" sx={{ '& td, & th': { px: 0.75, whiteSpace: 'nowrap' } }}>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>
              <Tooltip title="glass elements of the stack (WP-75): surfaces sharing glass form one element; a surface with no material ends it — the air gap after it separates the elements">
                <span>element</span>
              </Tooltip>
            </TableCell>
            <TableCell>radius mm (∅=∞)</TableCell>
            <TableCell>thickness mm</TableCell>
            <TableCell>material (∅=air)</TableCell>
            <TableCell>
              <Tooltip title="ideal / paraxial element (WP-75): a thin-lens surface with this focal length instead of glass — the black-box model of a catalog objective">
                <span>f mm (ideal)</span>
              </Tooltip>
            </TableCell>
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
            const paraxial = s.paraxialFocalMm ?? null;
            const el = elementOf(i);
            const color = ELEMENT_COLORS[el % ELEMENT_COLORS.length];
            const elementStart = elements[el]?.start === i;
            const elementEnd = elements[el]?.end === i;
            // The air gap AFTER an element's closing surface separates it
            // from the next element — make it visible on the boundary row.
            const airGapAfter = elementEnd && !isLast;
            return (
              <TableRow
                key={i}
                sx={{
                  '& > td': { borderLeftColor: color },
                  '& > td:first-of-type': { borderLeft: multiElement ? `3px solid ${color}` : undefined },
                  ...(airGapAfter ? { '& > td': { borderBottom: '3px double', borderBottomColor: 'divider' } } : {}),
                }}
              >
                <TableCell>{i}</TableCell>
                <TableCell>
                  {elementStart && (
                    <Tooltip
                      title={paraxial !== null
                        ? 'ideal element: a paraxial thin lens, no glass'
                        : `element ${el + 1}: surfaces ${elements[el].start}–${elements[el].end}`}
                    >
                      <Chip
                        size="small"
                        label={paraxial !== null ? `E${el + 1} · ideal` : `E${el + 1}`}
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10, color, borderColor: color }}
                      />
                    </Tooltip>
                  )}
                  {airGapAfter && (
                    <Tooltip title={`air gap of ${s.thicknessMm ?? 0} mm to the next element`}>
                      <Chip size="small" label="air ↓" sx={{ height: 16, fontSize: 9, ml: 0.5, opacity: 0.6 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  {paraxial !== null ? (
                    <Tooltip title="an ideal element is geometrically plano — its power lives in the focal length">
                      <span style={{ opacity: 0.4 }}>∞</span>
                    </Tooltip>
                  ) : (
                    <NumberCell value={s.radiusMm} placeholder="∞" onChange={v => update(i, { radiusMm: v })} />
                  )}
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
                  {paraxial !== null ? (
                    <span style={{ opacity: 0.4 }}>—</span>
                  ) : (
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
                  )}
                </TableCell>
                <TableCell>
                  <NumberCell
                    value={paraxial}
                    placeholder="—"
                    width={56}
                    onChange={v => update(i, { paraxialFocalMm: v })}
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
                  <Checkbox
                    size="small"
                    checked={s.reflective}
                    disabled={paraxial !== null}
                    onChange={e => update(i, { reflective: e.target.checked })}
                  />
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
      <Button size="small" startIcon={<AddIcon />} onClick={() => appendRow()} sx={{ mt: 0.5 }}>
        add surface
      </Button>
      <Tooltip title="add an ideal (paraxial) element: one thin-lens surface with a focal length — for a catalog objective you have no prescription for">
        <Button
          size="small" startIcon={<AddIcon />} sx={{ mt: 0.5, ml: 1 }}
          onClick={() => appendRow({ paraxialFocalMm: 9, material: '' })}
        >
          add ideal element
        </Button>
      </Tooltip>
    </Box>
  );
}

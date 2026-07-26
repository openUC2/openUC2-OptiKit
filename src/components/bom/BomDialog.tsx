/**
 * The live BOM panel (WP-50), mounted from BOTH the schematic and the
 * assembly: which parts, how many, WHERE they sit on the grid, what they
 * cost. Sortable, cross-probing (a cell chip selects that instance in the
 * scene), deep-linking (part name → component editor), CSV download from
 * the same facade function the release bundle writes — never two BOMs.
 */

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  Launch as OpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { saveAs } from 'file-saver';
import {
  T_CLASS_LABEL,
  buildDocBom,
  docBomCsv,
  selectPart,
  useDocParts,
} from '../../document';
import type { DocBomLine } from '../../document';

type SortKey = 'name' | 'qty' | 'price';

function lineTotal(l: DocBomLine): number {
  return l.unitPriceEur != null ? l.unitPriceEur * l.qty : -1; // unpriced sorts last
}

export function BomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const parts = useDocParts();
  const [sortKey, setSortKey] = useState<SortKey>('qty');
  const [asc, setAsc] = useState(false);

  const bom = useMemo(() => buildDocBom(parts), [parts]);
  const lines = useMemo(() => {
    const sorted = [...bom.lines].sort((a, b) => {
      const d =
        sortKey === 'name'
          ? a.name.localeCompare(b.name)
          : sortKey === 'qty'
            ? a.qty - b.qty
            : lineTotal(a) - lineTotal(b);
      return asc ? d : -d;
    });
    return sorted;
  }, [bom, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setAsc(v => !v);
    else {
      setSortKey(key);
      setAsc(key === 'name');
    }
  };

  const probe = (partId: string) => {
    selectPart(partId);
    onClose(); // the selection ring in the scene is the point
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Bill of materials
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {bom.totalParts} part(s) · {bom.lines.length} line(s)
        </Typography>
        <Button
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => {
            const blob = new Blob([docBomCsv(bom)], { type: 'text/csv;charset=utf-8' });
            saveAs(blob, 'BOM.csv');
          }}
        >
          CSV
        </Button>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {bom.lines.length === 0 ? (
          <Typography sx={{ p: 3 }} color="text.secondary">
            Nothing placed yet — the BOM fills as you add parts.
          </Typography>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sortKey === 'qty' ? (asc ? 'asc' : 'desc') : false}>
                  <TableSortLabel
                    active={sortKey === 'qty'}
                    direction={sortKey === 'qty' && asc ? 'asc' : 'desc'}
                    onClick={() => sortBy('qty')}
                  >
                    Qty
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sortKey === 'name' ? (asc ? 'asc' : 'desc') : false}>
                  <TableSortLabel
                    active={sortKey === 'name'}
                    direction={sortKey === 'name' && asc ? 'asc' : 'desc'}
                    onClick={() => sortBy('name')}
                  >
                    Part
                  </TableSortLabel>
                </TableCell>
                <TableCell>Cells (click to select)</TableCell>
                <TableCell align="right">Unit €</TableCell>
                <TableCell
                  align="right"
                  sortDirection={sortKey === 'price' ? (asc ? 'asc' : 'desc') : false}
                >
                  <TableSortLabel
                    active={sortKey === 'price'}
                    direction={sortKey === 'price' && asc ? 'asc' : 'desc'}
                    onClick={() => sortBy('price')}
                  >
                    Total €
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map(line => (
                <TableRow key={line.libraryRef} hover>
                  <TableCell>{line.qty}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600}>
                        {line.name}
                      </Typography>
                      {line.tClass && (
                        <Chip size="small" label={T_CLASS_LABEL[line.tClass]}
                          sx={{ height: 16, fontSize: 10 }} />
                      )}
                      {line.review && (
                        <Tooltip title="the record still carries review flags">
                          <Chip size="small" color="warning" label="draft"
                            sx={{ height: 16, fontSize: 10 }} />
                        </Tooltip>
                      )}
                      {line.componentId && (
                        <Tooltip title="open in the component editor">
                          <IconButton
                            size="small"
                            onClick={() =>
                              navigate(
                                `/configurator/components?open=${encodeURIComponent(line.componentId!)}`,
                              )
                            }
                          >
                            <OpenIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {line.libraryRef}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {line.cells.map((cell, i) => (
                        <Chip
                          key={`${line.partIds[i]}`}
                          size="small"
                          variant="outlined"
                          label={`[${cell.join(',')}]`}
                          onClick={() => probe(line.partIds[i])}
                          sx={{ height: 20, fontSize: 11, fontFamily: 'monospace' }}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {line.unitPriceEur != null ? line.unitPriceEur.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {line.unitPriceEur != null ? (
                      (line.unitPriceEur * line.qty).toFixed(2)
                    ) : (
                      <Typography variant="caption" color="warning.main">
                        unpriced
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="subtitle2">Total (priced lines)</Typography>
                </TableCell>
                <TableCell />
                <TableCell align="right">
                  <Typography variant="subtitle2">
                    €{bom.pricedTotalEur.toFixed(2)}
                  </Typography>
                  {bom.unpricedLines > 0 && (
                    <Typography variant="caption" color="warning.main" display="block">
                      +{bom.unpricedLines} unpriced line(s)
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

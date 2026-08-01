/**
 * WP-87 — "import Optiland setup…": a whole optical design (Optiland's
 * serialized system JSON) becomes a ROW of unbound free primitives on the
 * schematic, in axial order at the design's real spacings — the third import
 * road beside zmx (WP-82) and glb.
 *
 * Drop the JSON → the service splits the surface stack into elements (a
 * contiguous glass group = one lens, a reflective surface = a mirror, the
 * object/image planes = source/detector) → preview the parsed elements →
 * place. Every element lands as a TEMPORARY workspace component
 * (browser-local, like a draft); "save all to library" is the explicit
 * promotion — nothing touches the shared library without it. T-class binding
 * happens only when the user cubifies (WP-61), never at import.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Tooltip,
  Typography,
} from '@mui/material';
import { FileUpload as UploadIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  CoreServiceError,
  importOptilandSetup,
  saveLibraryRecords,
  type ImportOptilandResponse,
} from '../../api/coreClient';
import { bumpLibraryIndex } from '../../model/libraryIndex';
import { optilandDropPosition, optilandPreviewRows } from '../../model/optilandImport';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import {
  addPart,
  captureUndo,
  commitUndo,
  entriesFromWorkspace,
  listLibraryEntries,
  registerLibraryModules,
} from '../../document';
import { useAppStore } from '../../stores/appStore';

export function ImportOptilandDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportOptilandResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const rows = useMemo(() => (result ? optilandPreviewRows(result) : []), [result]);

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!/\.json$/i.test(file.name)) {
        setError(`unsupported file: ${file.name} — drop an Optiland system JSON (optic.to_dict())`);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      setResult(await importOptilandSetup(file.name, bytes));
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Place the row of primitives. Each record first becomes a TEMPORARY
   * workspace component; registration runs synchronously so the parts can
   * drop in the same call (the useLibraryRegistration effect re-registers
   * canonically afterwards — it is idempotent).
   */
  const placeOnSchematic = () => {
    if (!result) return 0;
    const ws = useWorkspaceLibrary.getState();
    for (const row of rows) {
      if (row.record && row.record.id) ws.save(row.record);
    }
    const wsState = useWorkspaceLibrary.getState();
    const existing = listLibraryEntries();
    const known = new Set(existing.map(e => e.moduleId));
    const fresh = entriesFromWorkspace(wsState.records, wsState.thumbnails).filter(
      e => !known.has(e.moduleId),
    );
    registerLibraryModules([...existing, ...fresh]);

    const token = captureUndo();
    let placed = 0;
    for (const row of rows) {
      // The design's own axial order, along the document beam axis (+x),
      // continuous mm — free primitives claim no grid cell.
      if (addPart(row.id, optilandDropPosition([0, 0, 0], row.zMm))) placed++;
    }
    commitUndo(token);
    useAppStore.getState().addNotification({
      type: 'success',
      title: 'Optiland setup placed',
      message: `${placed} unbound primitive(s) in axial order — chain, simulate, then cubify piece by piece; records stay browser-local until saved to the library`,
      duration: 8000,
    });
    return placed;
  };

  const placeAndClose = () => {
    if (placeOnSchematic() > 0) {
      onClose();
      if (!window.location.pathname.endsWith('/schematic')) navigate('/configurator/schematic');
    }
  };

  /** The explicit promotion — dev-write every record into the shared library. */
  const placeAndSaveAll = async () => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const written = await saveLibraryRecords(Object.values(result.records));
      bumpLibraryIndex();
      placeOnSchematic();
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'saved to library',
        message: `${written.written.length} record file(s) written into the shared library`,
        duration: 6000,
      });
      onClose();
      if (!window.location.pathname.endsWith('/schematic')) navigate('/configurator/schematic');
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>import Optiland setup… · a system JSON becomes free primitives</DialogTitle>
      <DialogContent>
        <Box
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void onFile(file);
          }}
          sx={{
            border: '2px dashed',
            borderColor: dragOver ? 'primary.main' : 'divider',
            borderRadius: 1,
            p: 2,
            mb: 1.5,
            textAlign: 'center',
            bgcolor: dragOver ? 'action.hover' : 'transparent',
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            drop an Optiland system JSON (<code>optic.to_dict()</code>) — a source, a surface
            stack, an image — or
          </Typography>
          <Button
            size="small"
            variant="outlined"
            component="label"
            startIcon={busy ? <CircularProgress size={12} /> : <UploadIcon />}
            disabled={busy}
          >
            pick a file…
            <input
              hidden
              type="file"
              accept=".json"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = '';
              }}
            />
          </Button>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}

        {result && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={`${rows.length} element(s)`} />
              {result.wavelengths_um.length > 0 && (
                <Chip
                  size="small"
                  label={`λ ${result.wavelengths_um.map(um => (um * 1000).toFixed(0)).join(' / ')} nm`}
                />
              )}
              <Chip size="small" variant="outlined" label="unbound — no T-class until cubify" />
            </Stack>
            {result.review.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                {result.review.map((r, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                    {r}
                  </Typography>
                ))}
              </Alert>
            )}
            <Table size="small" sx={{ '& td, & th': { px: 1, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>kind</TableCell>
                  <TableCell>record</TableCell>
                  <TableCell align="right">z mm</TableCell>
                  <TableCell align="right">surfaces</TableCell>
                  <TableCell align="right">EFL ≈</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Chip size="small" label={row.kind} sx={{ height: 18, fontSize: 10 }} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.id}</TableCell>
                    <TableCell align="right">{row.zMm.toFixed(2)}</TableCell>
                    <TableCell align="right">{row.nSurfaces || '—'}</TableCell>
                    <TableCell align="right">
                      {row.eflMm !== null ? `${row.eflMm.toFixed(1)} mm` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => { reset(); onClose(); }}>cancel</Button>
        <Tooltip title="every element becomes a TEMPORARY workspace component (browser-local) and drops on the schematic in axial order — nothing is written to the shared library">
          <span>
            <Button size="small" variant="contained" disabled={!result || busy} onClick={placeAndClose}>
              place on schematic
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="the explicit promotion: also dev-write every record into ../optikit-core/library">
          <span>
            <Button size="small" disabled={!result || busy} onClick={() => void placeAndSaveAll()}>
              place + save all to library
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}

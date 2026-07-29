/**
 * WP-82 — the 2D layout viewer: the drawing the engine could always produce
 * (`optic.draw()` — main.py's STEP 25) becomes viewable in the editor.
 * `/v1/draw` compiles the chosen path and streams optiland's own layout
 * rendering back as a PNG: the UNFOLDED optical axis, so a 90° fold appears
 * flat — that is the compiled truth, not a bug (the folded world lives in
 * the 3D overlay).
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { saveAs } from 'file-saver';
import { CoreServiceError, drawLayout } from '../../api/coreClient';
import { serviceFiles } from '../../model/dsn/serviceExport';

export function LayoutDialog({
  open,
  onClose,
  pathNames,
}: {
  open: boolean;
  onClose: () => void;
  pathNames: string[];
}) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [png, setPng] = useState<{ url: string; blob: Blob } | null>(null);

  const effectivePath = path || pathNames[0] || '';

  useEffect(() => () => {
    if (png) URL.revokeObjectURL(png.url);
  }, [png]);

  const draw = async (target: string) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await drawLayout(serviceFiles(), target);
      setPng(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), blob };
      });
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Draw on open (and when the chosen path changes).
  useEffect(() => {
    if (open && effectivePath) void draw(effectivePath);
  }, [open, effectivePath]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>layout (2D) · the compiled optic, drawn by optiland</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          <TextField
            select size="small" label="path" value={effectivePath}
            onChange={e => setPath(e.target.value)}
            sx={{ width: 200 }}
          >
            {pathNames.map(name => (
              <MenuItem key={name} value={name}>{name}</MenuItem>
            ))}
          </TextField>
          {busy && <CircularProgress size={16} />}
          <Typography variant="caption" color="text.secondary">
            drawn on the UNFOLDED axis — a fold mirror appears flat here (the compiled truth)
          </Typography>
        </Stack>
        {pathNames.length === 0 && (
          <Alert severity="info">no beam paths declared — chain one first</Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}
        {png && (
          <Box sx={{ textAlign: 'center', bgcolor: '#fff', borderRadius: 1, p: 1 }}>
            <img src={png.url} alt={`2D layout of ${effectivePath}`} style={{ maxWidth: '100%' }} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>close</Button>
        <Button
          size="small" disabled={!png}
          onClick={() => png && saveAs(png.blob, `${effectivePath}-layout.png`)}
        >
          download PNG
        </Button>
      </DialogActions>
    </Dialog>
  );
}

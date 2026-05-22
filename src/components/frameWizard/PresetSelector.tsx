import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { PresetIndexEntry, FrameWizardState } from '../../types/frameWizard';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * WP9: Preset selector dialog. Lists the entries from
 * `public/presets/index.json` and applies the chosen preset via the store's
 * `loadPreset` action.
 */
export function PresetSelector({ open, onClose }: Props) {
  const { loadPreset } = useFrameWizardStore();
  const [presets, setPresets] = useState<PresetIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/configurator/presets/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: PresetIndexEntry[]) => setPresets(data))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const onPick = async (entry: PresetIndexEntry) => {
    try {
      const r = await fetch(`/configurator/presets/${entry.file}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: Partial<FrameWizardState> = await r.json();
      loadPreset(data);
      onClose();
    } catch (e) {
      setError(`Failed to load preset: ${String(e)}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Load Preset Configuration</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <Card key={p.id} variant="outlined" sx={{ width: 240 }}>
                <CardActionArea onClick={() => onPick(p)} sx={{ height: '100%' }}>
                  {p.image && (
                    <Box
                      sx={{
                        height: 120,
                        bgcolor: 'action.hover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={p.image}
                        alt={p.name}
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </Box>
                  )}
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {p.description}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
            {presets.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No presets available.
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

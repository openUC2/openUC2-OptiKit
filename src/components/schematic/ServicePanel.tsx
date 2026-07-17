/**
 * Service panel (WP-15): Check (ERC markers), authoritative Simulate with a
 * live-debounce toggle, per-path spot diagram + paraxial summary, and the
 * Optimize dialog. Lives in the schematic's right drawer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  PlayArrow as SimulateIcon,
  Rule as CheckIcon,
  TrackChanges as OptimizeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DEFAULT_CORE_URL, getCoreUrl, setCoreUrl } from '../../api/coreClient';
import { selectPart, useDocPaths, useDocRevision } from '../../document';
import { pathColor } from './colors';
import { MarkerList } from './MarkerList';
import { OptimizeDialog } from './OptimizeDialog';
import { useServiceStore, useSimFreshness } from './serviceStore';

function SpotDiagram({ x, y, color }: { x: number[]; y: number[]; color: string }) {
  const size = 120;
  const points = useMemo(() => {
    const xs = x.filter(Number.isFinite);
    const ys = y.filter(Number.isFinite);
    if (xs.length === 0) return { dots: [] as { cx: number; cy: number }[], radiusUm: 0 };
    const cx0 = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy0 = ys.reduce((a, b) => a + b, 0) / ys.length;
    const r = Math.max(
      1e-6,
      ...xs.map((v, i) => Math.hypot(v - cx0, (ys[i] ?? cy0) - cy0)),
    );
    const scale = (size / 2 - 8) / r;
    return {
      dots: xs.map((v, i) => ({
        cx: size / 2 + (v - cx0) * scale,
        cy: size / 2 - ((ys[i] ?? cy0) - cy0) * scale,
      })),
      radiusUm: r * 1e3,
    };
  }, [x, y]);

  return (
    <Box sx={{ textAlign: 'center' }}>
      <svg width={size} height={size} style={{ background: '#10151c', borderRadius: 6 }}>
        <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke="#2a3442" />
        <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke="#2a3442" />
        {points.dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={1.6} fill={color} opacity={0.8} />
        ))}
      </svg>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        max radius {points.radiusUm.toFixed(1)} µm
      </Typography>
    </Box>
  );
}

const PARAXIAL_LABELS: Record<string, string> = {
  f2: 'EFL', FNO: 'f/#', EPD: 'entrance pupil', magnification: 'mag',
};

export function ServicePanel({ onZoomToPart }: { onZoomToPart: (partId: string) => void }) {
  const store = useServiceStore();
  const freshness = useSimFreshness();
  const revision = useDocRevision();
  const docPaths = useDocPaths();
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState<string | null>(null);

  // Debounced live simulate: 500 ms after the last document change.
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!store.live || freshness === 'fresh' || store.simBusy) return;
    liveTimer.current = setTimeout(() => void store.runSimulate(), 500);
    return () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, store.live, store.simBusy, freshness]);

  const jump = (partId: string) => {
    selectPart(partId);
    onZoomToPart(partId);
  };

  const pathNames = Object.keys(store.simByPath);
  const errorCount = store.markers.filter(m => m.severity === 'error').length;

  return (
    <Box>
      <Divider sx={{ my: 1.5 }}>
        <Typography variant="overline">optikit-core service</Typography>
      </Divider>

      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <Button
          size="small" variant="outlined" startIcon={store.checkBusy ? <CircularProgress size={12} /> : <CheckIcon />}
          onClick={() => void store.runCheck()} disabled={store.checkBusy}
        >
          check
        </Button>
        <Button
          size="small" variant="outlined" startIcon={store.simBusy ? <CircularProgress size={12} /> : <SimulateIcon />}
          onClick={() => void store.runSimulate()} disabled={store.simBusy}
        >
          simulate
        </Button>
        <Tooltip title="re-simulate 500 ms after every document change">
          <Stack direction="row" alignItems="center">
            <Switch size="small" checked={store.live} onChange={e => store.setLive(e.target.checked)} />
            <Typography variant="caption">live</Typography>
          </Stack>
        </Tooltip>
        <Button size="small" variant="outlined" startIcon={<OptimizeIcon />} onClick={() => setOptimizeOpen(true)}>
          optimize…
        </Button>
      </Stack>

      {freshness !== 'none' && (
        <Chip
          size="small"
          label={freshness === 'fresh' ? 'authoritative rays: fresh' : 'authoritative rays: stale (document changed)'}
          color={freshness === 'fresh' ? 'success' : 'default'}
          variant="outlined"
          sx={{ mb: 1 }}
        />
      )}

      {store.error && (
        <Alert severity="error" onClose={store.clearError} sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{store.error.code}</Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>{store.error.message}</Typography>
        </Alert>
      )}

      {/* ── ERC markers ────────────────────────────────────────────────── */}
      {store.checkedAt !== null && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {store.markers.length === 0
              ? 'check: no findings — design is clean'
              : `check: ${errorCount} error(s), ${store.markers.length - errorCount} note(s)`}
          </Typography>
          <MarkerList markers={store.markers} onJump={jump} />
          {store.proposals.length > 0 && (
            <Alert severity="info" sx={{ mt: 0.5 }}>
              chain inference proposes {store.proposals.length} additional path(s):{' '}
              {store.proposals.map(p => p.name).join(', ')}
            </Alert>
          )}
        </Box>
      )}

      {/* ── per-path results ───────────────────────────────────────────── */}
      {pathNames.map((name, i) => {
        const result = store.simByPath[name];
        return (
          <Box key={name} sx={{ mb: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: pathColor(i) }} />
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {result.raysWorld.length} rays
              </Typography>
            </Stack>
            {result.error ? (
              <Alert severity="error" sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{result.error.code}</Typography>
                <Typography variant="caption" sx={{ display: 'block' }}>{result.error.message}</Typography>
              </Alert>
            ) : (
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
                {result.spot && <SpotDiagram x={result.spot.x} y={result.spot.y} color={pathColor(i)} />}
                {result.paraxial && (
                  <Box>
                    {Object.entries(result.paraxial)
                      .filter(([k]) => k in PARAXIAL_LABELS)
                      .map(([k, v]) => (
                        <Typography key={k} variant="caption" sx={{ display: 'block' }}>
                          {PARAXIAL_LABELS[k]}:{' '}
                          <b>
                            {/* afocal paths report NaN (null) / ±∞ (WP-32) */}
                            {v === null ? '—' : Number.isFinite(v) ? v.toFixed(3) : '∞'}
                          </b>
                          {k === 'f2' || k === 'EPD' ? ' mm' : ''}
                        </Typography>
                      ))}
                    {result.warnings.map((w, k) => (
                      <Typography key={k} variant="caption" color="warning.main" sx={{ display: 'block' }}>
                        ⚠ {w}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Stack>
            )}
          </Box>
        );
      })}

      {/* ── service URL ────────────────────────────────────────────────── */}
      <TextField
        size="small" fullWidth label="service URL" sx={{ mt: 1 }}
        value={urlDraft ?? getCoreUrl()}
        placeholder={DEFAULT_CORE_URL}
        onChange={e => setUrlDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && urlDraft !== null) {
            setCoreUrl(urlDraft);
            setUrlDraft(null);
          }
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="apply URL">
                <IconButton size="small" onClick={() => { if (urlDraft !== null) { setCoreUrl(urlDraft); setUrlDraft(null); } }}>
                  <RefreshIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />

      <OptimizeDialog
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        pathNames={docPaths.map(p => p.name)}
      />
    </Box>
  );
}

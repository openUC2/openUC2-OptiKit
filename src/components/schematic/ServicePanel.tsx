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
  useTheme,
} from '@mui/material';
import {
  Image as LayoutIcon,
  PlayArrow as SimulateIcon,
  Rule as CheckIcon,
  Straighten as CalibrateIcon,
  TrackChanges as OptimizeIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { DEFAULT_CORE_URL, getCoreUrl, setCoreUrl } from '../../api/coreClient';
import { selectPart, useDocPaths, useDocRevision } from '../../document';
import { pathColor, sourceTint } from './colors';
import { CalibrateDialog } from './CalibrateDialog';
import { LayoutDialog } from './LayoutDialog';
import { MarkerList } from './MarkerList';
import { OptimizeDialog } from './OptimizeDialog';
import { useServiceStore, useSimFreshness } from './serviceStore';

interface SpotLayer {
  x: number[];
  y: number[];
  color: string;
  /** WP-91: legend label for a multi-line overlay ("488 nm"). */
  label?: string;
}

function SpotDiagram({ layers }: { layers: SpotLayer[] }) {
  const size = 120;
  // WP-51.4: the spot plot is panel chrome, not a 3D canvas — it follows the
  // theme so it reads in light mode too (the dark 2D/3D drawing surfaces are
  // the deliberate exception, not this).
  const theme = useTheme();
  // WP-91: one shared centroid + scale over ALL layers, so the chromatic
  // shift between wavelengths stays visible instead of being normalized away.
  const view = useMemo(() => {
    const allX = layers.flatMap(l => l.x.filter(Number.isFinite));
    const allY = layers.flatMap(l => l.y.filter(Number.isFinite));
    if (allX.length === 0) {
      return { perLayer: [] as { cx: number; cy: number }[][], radiusUm: 0 };
    }
    const cx0 = allX.reduce((a, b) => a + b, 0) / allX.length;
    const cy0 = allY.reduce((a, b) => a + b, 0) / allY.length;
    const r = Math.max(
      1e-6,
      ...allX.map((v, i) => Math.hypot(v - cx0, (allY[i] ?? cy0) - cy0)),
    );
    const scale = (size / 2 - 8) / r;
    return {
      perLayer: layers.map(l =>
        l.x
          .map((v, i) => ({ v, w: l.y[i] }))
          .filter(p => Number.isFinite(p.v) && Number.isFinite(p.w))
          .map(p => ({
            cx: size / 2 + (p.v - cx0) * scale,
            cy: size / 2 - (p.w - cy0) * scale,
          })),
      ),
      radiusUm: r * 1e3,
    };
  }, [layers]);

  return (
    <Box sx={{ textAlign: 'center' }}>
      <svg
        width={size}
        height={size}
        style={{ background: theme.palette.action.hover, borderRadius: 6 }}
      >
        <line x1={size / 2} y1={0} x2={size / 2} y2={size} stroke={theme.palette.divider} />
        <line x1={0} y1={size / 2} x2={size} y2={size / 2} stroke={theme.palette.divider} />
        {view.perLayer.map((dots, li) =>
          dots.map((d, i) => (
            <circle key={`${li}-${i}`} cx={d.cx} cy={d.cy} r={1.6} fill={layers[li].color} opacity={0.8} />
          )),
        )}
      </svg>
      {layers.length > 1 && (
        <Stack direction="row" spacing={1} justifyContent="center">
          {layers.map((l, i) => (
            <Typography key={i} variant="caption" sx={{ color: l.color }}>
              ● {l.label ?? ''}
            </Typography>
          ))}
        </Stack>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        max radius {view.radiusUm.toFixed(1)} µm
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
  // WP-82: the 2D layout viewer (optiland's own drawing, via /v1/draw).
  const [layoutOpen, setLayoutOpen] = useState(false);
  // WP-86: the hardware return leg — measured axes → dof values.
  const [calibrateOpen, setCalibrateOpen] = useState(false);
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

  // WP-78: inference re-runs on document change (debounced, silent) so a
  // freshly placed part surfaces its proposal as an Adopt chip — chaining
  // proposes instead of demanding.
  const proposalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    proposalTimer.current = setTimeout(() => void store.refreshProposals(), 800);
    return () => {
      if (proposalTimer.current) clearTimeout(proposalTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

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
        {Object.keys(store.simByPath).length > 0 && (
          <Tooltip title="throw the traced rays away — greying them out was the only exit before, so a design with no valid trace kept ray geometry on screen (WP-141)">
            <Button size="small" variant="text" onClick={() => store.clearSim()}>
              clear rays
            </Button>
          </Tooltip>
        )}
</Stack>
        </Tooltip>
        <Button size="small" variant="outlined" startIcon={<OptimizeIcon />} onClick={() => setOptimizeOpen(true)}>
          optimize…
        </Button>
        <Tooltip title="the compiled optic drawn by optiland's 2D viewer (WP-82)">
          <span>
            <Button
              size="small" variant="outlined" startIcon={<LayoutIcon />}
              disabled={docPaths.length === 0}
              onClick={() => setLayoutOpen(true)}
            >
              layout (2D)
            </Button>
          </span>
        </Tooltip>
        {/* WP-86: the OTHER return leg — where the axes actually are. */}
        <Tooltip title="read the running instrument's axis positions and write them back into the design (WP-86)">
          <Button
            size="small" variant="outlined" startIcon={<CalibrateIcon />}
            onClick={() => setCalibrateOpen(true)}
          >
            calibrate…
          </Button>
        </Tooltip>
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
        </Box>
      )}

      {/* WP-78: proposals as one-click Adopt chips (they refresh on every
          document change) — manual pin-to-pin chaining stays the fallback
          for the ambiguous cases inference refuses to guess. */}
      {store.proposals.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            chain inference proposes {store.proposals.length} path(s):
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
            {store.proposals.map(p => (
              <Tooltip key={p.name} title={p.chain.join(' → ')}>
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={`Adopt ${p.name} (${p.chain.length})`}
                  onClick={() => store.adoptProposal(p.name)}
                />
              </Tooltip>
            ))}
          </Stack>
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
                {/* WP-91: a multi-line run overlays one spot per wavelength,
                    each in its own line colour. */}
                {result.multiSpot ? (
                  <SpotDiagram
                    layers={result.multiSpot.map(m => ({
                      x: m.spot.x,
                      y: m.spot.y,
                      color: sourceTint(m.um) ?? pathColor(i),
                      label: `${(m.um * 1000).toFixed(0)} nm`,
                    }))}
                  />
                ) : (
                  result.spot && (
                    <SpotDiagram layers={[{ x: result.spot.x, y: result.spot.y, color: pathColor(i) }]} />
                  )
                )}
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
                    {/* WP-74: how much light reaches the sensor. */}
                    {result.photonBudget && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                        light to sensor:{' '}
                        <b>
                          {result.photonBudget.power_mw != null
                            ? `${result.photonBudget.power_mw.toFixed(1)} mW`
                            : `${(result.photonBudget.transmitted_fraction * 100).toFixed(0)}%`}
                        </b>
                        {result.photonBudget.wavelength_um != null &&
                          ` @ ${(result.photonBudget.wavelength_um * 1000).toFixed(0)} nm`}
                      </Typography>
                    )}
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
      <LayoutDialog
        open={layoutOpen}
        onClose={() => setLayoutOpen(false)}
        pathNames={docPaths.map(p => p.name)}
      />
      <CalibrateDialog open={calibrateOpen} onClose={() => setCalibrateOpen(false)} />
    </Box>
  );
}

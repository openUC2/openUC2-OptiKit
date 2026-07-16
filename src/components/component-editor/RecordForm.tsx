/**
 * The record form: identity + vendor, per-category fields, surfaces table,
 * datum frames, and ports. Pure controlled component over a RecordDraft.
 */

import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  centerThicknessMm,
  FRAGMENTLESS_CATEGORIES,
  NONOPTICAL_CATEGORIES,
  PORT_DIRECTIONS,
  RECORD_CATEGORIES,
  defaultDraft,
  type RecordCategory,
  type RecordDraft,
} from '../../model/componentRecord';
import { SurfacesTable } from './SurfacesTable';

function Row({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
      {children}
    </Stack>
  );
}

export function RecordForm({
  draft,
  onChange,
}: {
  draft: RecordDraft;
  onChange: (draft: RecordDraft) => void;
}) {
  const set = (patch: Partial<RecordDraft>) => onChange({ ...draft, ...patch });
  const nonOptical = NONOPTICAL_CATEGORIES.includes(draft.category);
  const hasFragment = !nonOptical && !FRAGMENTLESS_CATEGORIES.includes(draft.category);
  const ct = centerThicknessMm(draft.surfaces);

  const deriveFrames = () => {
    const frames = draft.frames.filter(f => !['exit', 'mount'].includes(f.name));
    if (ct > 0) {
      frames.push({ name: 'exit', zMm: ct });
      frames.push({ name: 'mount', zMm: Math.round((ct / 2) * 1e3) / 1e3 });
    }
    set({ frames });
  };

  return (
    <Stack spacing={2.5}>
      {/* ── identity ─────────────────────────────────────────────────────── */}
      <Row>
        <TextField
          select size="small" label="category" value={draft.category}
          onChange={e => {
            const category = e.target.value as RecordCategory;
            const fresh = defaultDraft(category);
            // Keep identity fields; reset the geometry to the category default.
            set({
              category,
              surfaces: fresh.surfaces,
              ports: fresh.ports,
              frames: fresh.frames,
              mirrorAngleDeg: fresh.mirrorAngleDeg,
              sourceWavelengthsUm: fresh.sourceWavelengthsUm,
              sourceDivergenceDeg: fresh.sourceDivergenceDeg,
              detectorSensorMm: fresh.detectorSensorMm,
              detectorPixelPitchUm: fresh.detectorPixelPitchUm,
            });
          }}
          sx={{ width: 140 }}
        >
          {RECORD_CATEGORIES.map(c => (
            <MenuItem key={c} value={c}>{c}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="namespace" value={draft.namespace}
          onChange={e => set({ namespace: e.target.value })} sx={{ width: 120 }}
        >
          {['user', 'openuc2', 'thorlabs'].map(ns => (
            <MenuItem key={ns} value={ns}>{ns}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small" label="name (id slug)" value={draft.name} placeholder="ac254-050-a"
          onChange={e => set({ name: e.target.value.toLowerCase() })} sx={{ width: 180 }}
        />
        <TextField
          size="small" label="version" value={draft.version}
          onChange={e => set({ version: e.target.value })} sx={{ width: 100 }}
        />
      </Row>
      <TextField
        size="small" label="description" value={draft.description} fullWidth
        onChange={e => set({ description: e.target.value })}
      />
      <Row>
        <TextField size="small" label="vendor" value={draft.vendorName}
          onChange={e => set({ vendorName: e.target.value })} sx={{ width: 140 }} />
        <TextField size="small" label="MPN" value={draft.vendorMpn}
          onChange={e => set({ vendorMpn: e.target.value })} sx={{ width: 160 }} />
        <TextField size="small" label="vendor URL" value={draft.vendorUrl}
          onChange={e => set({ vendorUrl: e.target.value })} sx={{ flex: 1, minWidth: 180 }} />
      </Row>

      {/* ── category-specific ────────────────────────────────────────────── */}
      {draft.category === 'mirror' && (
        <Row>
          <TextField
            size="small" type="number" label="mount angle °"
            value={draft.mirrorAngleDeg ?? ''}
            onChange={e => set({ mirrorAngleDeg: e.target.value === '' ? null : Number(e.target.value) })}
            sx={{ width: 140 }}
          />
        </Row>
      )}
      {draft.category === 'source' && (
        <Row>
          <TextField
            size="small" label="wavelengths µm (comma-sep)"
            value={draft.sourceWavelengthsUm.join(', ')}
            onChange={e =>
              set({
                sourceWavelengthsUm: e.target.value
                  .split(',')
                  .map(v => Number(v.trim()))
                  .filter(v => !Number.isNaN(v) && v > 0),
              })
            }
            sx={{ width: 240 }}
          />
          <TextField
            size="small" type="number" label="divergence ° (half-angle)"
            value={draft.sourceDivergenceDeg ?? ''}
            onChange={e => set({ sourceDivergenceDeg: e.target.value === '' ? null : Number(e.target.value) })}
            sx={{ width: 180 }}
          />
        </Row>
      )}
      {draft.category === 'detector' && (
        <Row>
          <TextField
            size="small" type="number" label="sensor width mm"
            value={draft.detectorSensorMm?.[0] ?? ''}
            onChange={e => set({ detectorSensorMm: [Number(e.target.value), draft.detectorSensorMm?.[1] ?? 0] })}
            sx={{ width: 140 }}
          />
          <TextField
            size="small" type="number" label="sensor height mm"
            value={draft.detectorSensorMm?.[1] ?? ''}
            onChange={e => set({ detectorSensorMm: [draft.detectorSensorMm?.[0] ?? 0, Number(e.target.value)] })}
            sx={{ width: 140 }}
          />
          <TextField
            size="small" type="number" label="pixel pitch µm"
            value={draft.detectorPixelPitchUm ?? ''}
            onChange={e => set({ detectorPixelPitchUm: e.target.value === '' ? null : Number(e.target.value) })}
            sx={{ width: 140 }}
          />
        </Row>
      )}

      {/* ── surfaces ─────────────────────────────────────────────────────── */}
      {hasFragment && (
        <Box>
          <Divider sx={{ mb: 1 }}>
            <Typography variant="overline">optiland fragment (surfaces)</Typography>
          </Divider>
          <SurfacesTable surfaces={draft.surfaces} onChange={surfaces => set({ surfaces })} />
          {ct > 0 && (
            <Typography variant="caption" color="text.secondary">
              center thickness: {ct.toFixed(3)} mm
            </Typography>
          )}
        </Box>
      )}

      {/* ── frames + ports: hidden for non-optical records (WP-30) ───────── */}
      {!nonOptical && (
      <>
      <Box>
        <Divider sx={{ mb: 1 }}>
          <Typography variant="overline">datum frames (z along the optical axis)</Typography>
        </Divider>
        <Stack spacing={1}>
          {draft.frames.map((f, i) => (
            <Row key={i}>
              <TextField
                size="small" label="frame" value={f.name}
                disabled={f.name === 'optical'}
                onChange={e => {
                  const frames = draft.frames.map((x, k) => (k === i ? { ...x, name: e.target.value } : x));
                  set({ frames });
                }}
                sx={{ width: 140 }}
              />
              <TextField
                size="small" type="number" label="z-mm" value={f.zMm}
                onChange={e => {
                  const frames = draft.frames.map((x, k) => (k === i ? { ...x, zMm: Number(e.target.value) } : x));
                  set({ frames });
                }}
                sx={{ width: 110 }}
              />
              {f.name !== 'optical' && (
                <IconButton size="small" onClick={() => set({ frames: draft.frames.filter((_, k) => k !== i) })}>
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              )}
            </Row>
          ))}
          <Row>
            <Button size="small" startIcon={<AddIcon />}
              onClick={() => set({ frames: [...draft.frames, { name: `frame-${draft.frames.length}`, zMm: 0 }] })}>
              add frame
            </Button>
            {hasFragment && (
              <Tooltip title="exit = first vertex + center thickness (port gaps become air gaps); mount = CT/2">
                <Button size="small" onClick={deriveFrames} disabled={ct <= 0}>
                  derive exit/mount from surfaces
                </Button>
              </Tooltip>
            )}
          </Row>
        </Stack>
      </Box>

      {/* ── ports ────────────────────────────────────────────────────────── */}
      <Box>
        <Divider sx={{ mb: 1 }}>
          <Typography variant="overline">ports (beam entry/exit)</Typography>
        </Divider>
        <Stack spacing={1}>
          {draft.ports.map((p, i) => (
            <Row key={i}>
              <TextField
                size="small" label="port" value={p.name}
                onChange={e => set({ ports: draft.ports.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })}
                sx={{ width: 130 }}
              />
              <TextField
                select size="small" label="frame" value={p.frame}
                onChange={e => set({ ports: draft.ports.map((x, k) => (k === i ? { ...x, frame: e.target.value } : x)) })}
                sx={{ width: 130 }}
              >
                {draft.frames.map(f => (
                  <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                select size="small" label="direction" value={p.direction}
                onChange={e => set({ ports: draft.ports.map((x, k) => (k === i ? { ...x, direction: e.target.value } : x)) })}
                sx={{ width: 100 }}
              >
                {PORT_DIRECTIONS.map(d => (
                  <MenuItem key={d} value={d}>{d}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small" label="after-surface" value={p.afterSurface ?? ''}
                placeholder="—"
                onChange={e => {
                  const v = e.target.value.trim();
                  const afterSurface = v === '' ? null : Number(v);
                  set({ ports: draft.ports.map((x, k) => (k === i ? { ...x, afterSurface } : x)) });
                }}
                sx={{ width: 110 }}
              />
              <IconButton size="small" onClick={() => set({ ports: draft.ports.filter((_, k) => k !== i) })}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Row>
          ))}
          <Row>
            <Button size="small" startIcon={<AddIcon />}
              onClick={() => set({
                ports: [...draft.ports, { name: `port-${draft.ports.length}`, frame: 'optical', direction: '+z', afterSurface: null }],
              })}>
              add port
            </Button>
            <Chip size="small" variant="outlined"
              label="exit ports set after-surface to the last surface index" sx={{ opacity: 0.7 }} />
          </Row>
        </Stack>
      </Box>
      </>
      )}
      {nonOptical && (
        <Typography variant="caption" color="text.secondary">
          {draft.category} records are BOM-only: vendor/MPN identity, no
          surfaces, frames or ports — chain inference and optics-DRC skip them.
        </Typography>
      )}
    </Stack>
  );
}

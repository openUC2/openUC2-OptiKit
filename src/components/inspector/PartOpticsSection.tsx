/**
 * WP-89 — the part inspector's "Optics" section: clicking a placed part
 * answers "what is this lens?" without opening the Parts editor.
 *
 * Renders the record's optiland facts (EFL, clear aperture, the per-surface
 * radius · thickness · material · conic stack, emission lines) plus a ray
 * sketch, and makes PORTS legible — the KiCad pins: each port's name, facing,
 * clear aperture and role (entry/exit/reflected/transmitted), the things
 * chain inference, compilation and the spectral gate walk.
 *
 * READ-ONLY by design — the inspector explains, the Parts editor changes
 * (the WP-64 `?open=` deep link sits in the header). One code path over the
 * index (`partOpticsFacts`) serves unbound primitives and cube modules alike;
 * mounted by the schematic property panel AND the assembly panel.
 */

import { useMemo } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import type { DocPart } from '../../document';
import { libraryEntryOf } from '../../document';
import { useLibraryIndex } from '../../model/libraryIndex';
import { partOpticsFacts, portDirectionLabel, portRoleOf, type PortRole } from '../../model/partOptics';
import { recordPortsOf } from '../schematic/ports';
import { RaySketch } from '../component-editor/RaySketch';

const ROLE_COLORS: Record<PortRole, 'info' | 'warning' | 'secondary' | 'default'> = {
  entry: 'info',
  exit: 'warning',
  reflected: 'secondary',
  transmitted: 'default',
};

const ROLE_HINT: Record<PortRole, string> = {
  entry: 'the beam ENTERS here — chain inference snaps an incoming ray to this pin',
  exit: 'the beam LEAVES here — the after-surface tells the compiler which fragment surface it exits from',
  reflected: 'the fold arm — a dichroic/mirror routes the reflected band out of this pin (WP-74 reads the name)',
  transmitted: 'the pass-through arm — the transmitted band leaves here',
};

export function PartOpticsSection({ part }: { part: DocPart }) {
  const navigate = useNavigate();
  const index = useLibraryIndex();
  const entry = libraryEntryOf(part.libraryRef);
  const facts = useMemo(
    () => partOpticsFacts(part.libraryRef, entry, index.components),
    [part.libraryRef, entry, index.components],
  );
  const ports = useMemo(() => recordPortsOf(part), [part]);

  const hasOptics =
    facts.surfaces.length > 0 || facts.eflMm !== null || facts.wavelengthsUm.length > 0;
  if (!hasOptics && ports.length === 0) return null;

  return (
    <>
      <Divider />
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Optics
        </Typography>
        {facts.componentId && (
          <Tooltip title="edit in Parts… (the inspector is read-only)">
            <IconButton
              size="small"
              onClick={() =>
                navigate(`/configurator/components?open=${encodeURIComponent(facts.componentId!)}`)
              }
            >
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {hasOptics && (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          {facts.eflMm !== null && (
            <Tooltip
              title={
                facts.eflSource === 'record'
                  ? 'effective focal length from the record'
                  : 'paraxial estimate (2×2 ABCD walk over the surfaces) — the record declares no EFL'
              }
            >
              <Chip
                size="small"
                label={`EFL ${facts.eflMm.toFixed(1)} mm${facts.eflSource === 'paraxial' ? ' ≈' : ''}`}
                sx={{ height: 20, fontSize: 11 }}
              />
            </Tooltip>
          )}
          {facts.apertureMm !== null && (
            <Chip size="small" label={`Ø ${facts.apertureMm.toFixed(1)} mm`} sx={{ height: 20, fontSize: 11 }} />
          )}
          {facts.elementCount > 0 && (
            <Chip
              size="small"
              label={`${facts.elementCount} element${facts.elementCount > 1 ? 's' : ''} · ${facts.surfaces.length} surface${facts.surfaces.length > 1 ? 's' : ''}`}
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
          {facts.wavelengthsUm.length > 0 && (
            <Chip
              size="small"
              label={`λ ${facts.wavelengthsUm.map(um => (um * 1000).toFixed(0)).join(' / ')} nm`}
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
          {facts.vendor && (
            <Chip
              size="small"
              variant="outlined"
              label={[facts.vendor.name, facts.vendor.mpn].filter(Boolean).join(' · ')}
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
        </Stack>
      )}

      {facts.surfaces.length > 0 && (
        <>
          <Box sx={{ '& svg': { maxWidth: '100%' } }}>
            <RaySketch category={part.category} surfaces={facts.surfaces} mirrorAngleDeg={null} />
          </Box>
          <Table
            size="small"
            sx={{ '& td, & th': { px: 0.5, py: 0.25, fontSize: 11, whiteSpace: 'nowrap', border: 0 } }}
          >
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>R mm</TableCell>
                <TableCell>t mm</TableCell>
                <TableCell>material</TableCell>
                <TableCell>conic</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {facts.surfaces.map((s, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {i}
                    {s.isStop ? ' ◦' : ''}
                    {s.reflective ? ' ⟲' : ''}
                  </TableCell>
                  <TableCell>
                    {s.paraxialFocalMm != null
                      ? `ideal f=${s.paraxialFocalMm}`
                      : s.radiusMm === null
                        ? '∞'
                        : s.radiusMm}
                  </TableCell>
                  <TableCell>{s.thicknessMm ?? '—'}</TableCell>
                  <TableCell>{s.material || 'air'}</TableCell>
                  <TableCell>{s.conic || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* The pins. Ports stay because the engine walks them — make them
          visible instead of implicit. */}
      {ports.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary">
            Ports — the part's pins (beam connections)
          </Typography>
          <Stack spacing={0.25}>
            {ports.map(p => {
              const role = portRoleOf(p.name);
              return (
                <Stack key={p.name} direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 74 }} noWrap>
                    {p.name}
                  </Typography>
                  <Tooltip title={ROLE_HINT[role]}>
                    <Chip
                      size="small"
                      color={ROLE_COLORS[role]}
                      variant="outlined"
                      label={role}
                      sx={{ height: 17, fontSize: 10 }}
                    />
                  </Tooltip>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                    faces {portDirectionLabel(p.direction)}
                    {p.clearApertureMm != null && ` · Ø ${p.clearApertureMm} mm`}
                    {p.coupling === 'fiber' && ' · fiber'}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </>
      )}
    </>
  );
}

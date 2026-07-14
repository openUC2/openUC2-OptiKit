/**
 * ERC/DRC marker list — shared between the schematic's service panel (WP-15)
 * and the assembly view (WP-16). Clicking a marker with a resolved part
 * selects/zooms it.
 */

import { Box, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import {
  ErrorOutline as ErrorIcon,
  WarningAmber as WarningIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';

export interface Marker {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  where: string;
  message: string;
  partId: string | null;
}

const SEVERITY_ICONS = {
  error: <ErrorIcon fontSize="small" color="error" />,
  warning: <WarningIcon fontSize="small" color="warning" />,
  info: <InfoIcon fontSize="small" color="info" />,
} as const;

export function MarkerRow({ marker, onJump }: { marker: Marker; onJump: (partId: string) => void }) {
  return (
    <ListItemButton
      dense
      onClick={() => marker.partId && onJump(marker.partId)}
      sx={{ borderRadius: 1, alignItems: 'flex-start', opacity: marker.partId ? 1 : 0.85 }}
    >
      <Box sx={{ mr: 1, mt: 0.25 }}>{SEVERITY_ICONS[marker.severity]}</Box>
      <ListItemText
        primary={
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            {marker.code}
            {marker.where && `  ·  ${marker.where}`}
          </Typography>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {marker.message}
          </Typography>
        }
      />
    </ListItemButton>
  );
}

export function MarkerList({
  markers,
  onJump,
  maxHeight = 220,
}: {
  markers: Marker[];
  onJump: (partId: string) => void;
  maxHeight?: number;
}) {
  return (
    <List dense disablePadding sx={{ maxHeight, overflow: 'auto' }}>
      {markers.map(marker => (
        <MarkerRow key={marker.id} marker={marker} onJump={onJump} />
      ))}
    </List>
  );
}

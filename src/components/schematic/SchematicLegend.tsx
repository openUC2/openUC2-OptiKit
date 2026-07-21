/**
 * Affordance legend for the schematic (WP-23): explains the pins, the yaw
 * ring, the selection ring, and the camera controls. Shows itself once on
 * first run (localStorage flag) and toggles via the "?" button.
 */

import {
  Box,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export const LEGEND_SEEN_KEY = 'optikit-schematic-legend-seen';

function Row({ swatch, title, text }: { swatch: React.ReactNode; title: string; text: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box sx={{ width: 34, display: 'flex', justifyContent: 'center', pt: 0.25, flexShrink: 0 }}>
        {swatch}
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{text}</Typography>
      </Box>
    </Stack>
  );
}

const Dot = ({ color }: { color: string }) => (
  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, boxShadow: 1 }} />
);

export function SchematicLegend({ onClose }: { onClose: () => void }) {
  return (
    <Paper
      elevation={6}
      sx={{
        position: 'absolute', top: 16, left: 16, zIndex: 20, width: 340, p: 2,
        bgcolor: 'background.paper', backdropFilter: 'blur(8px)', borderRadius: 2,
        border: '1px solid', borderColor: 'divider',
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>How to read this view</Typography>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack spacing={1.25}>
        <Row
          swatch={<Stack direction="row" spacing={0.5}><Dot color="#69d2ff" /><Dot color="#ffd24d" /></Stack>}
          title="Port pins — beam entry (cyan) / exit (amber)"
          text="Where light enters and leaves a part. Click one pin, then the next, to chain a beam path; Enter finishes, Esc cancels."
        />
        <Row
          swatch={<Box sx={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #ffd24d' }} />}
          title="Yaw ring"
          text="Appears on the selected part — drag it to rotate the part about the vertical axis (snaps to 90° when snap-yaw is on)."
        />
        <Row
          swatch={<Box sx={{ width: 24, height: 10, borderRadius: '50%', border: '2px solid #FFAA00' }} />}
          title="Selection ring"
          text="The flat ring marks the selected (amber) or hovered (blue) part."
        />
        <Divider />
        <Row
          swatch={<Typography variant="caption" sx={{ fontWeight: 700 }}>LMB</Typography>}
          title="Parts: select + drag"
          text="Drag moves a part in the working plane; hold Shift while dragging to change its height."
        />
        <Row
          swatch={<Typography variant="caption" sx={{ fontWeight: 700 }}>RMB</Typography>}
          title="Camera (view locked)"
          text="Right-drag orbits, middle-drag pans, scroll zooms. Use the lock toggle below for free-orbit on the left button."
        />
        <Row
          swatch={<Typography variant="caption" sx={{ fontWeight: 700 }}>⌗</Typography>}
          title="Snap"
          text="Snapping centers the part's optical axis in a cube cell — the grid lines are the cube boundaries."
        />
      </Stack>
    </Paper>
  );
}

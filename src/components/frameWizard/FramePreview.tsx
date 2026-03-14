import { useMemo } from 'react';
import { Box, Typography, Divider, List, ListItem, ListItemIcon, ListItemText, Chip } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

// Simple schematic layout of the FRAME as an SVG
// The frame has positions: illumination arm (top), sample stage (center),
// objective (below center), camera + tube lens (bottom), electronics (side)

const GRID_SIZE = 30;
const COLS = 10;
const ROWS = 10;

interface PlacedBlock {
  moduleId: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

function moduleColor(id: string): string {
  if (id.includes('led') || id.includes('light') || id.includes('laser')) return '#FFC107';
  if (id.includes('objective') || id.includes('10x')) return '#2196F3';
  if (id.includes('camera') || id.includes('overview')) return '#9C27B0';
  if (id.includes('tube') || id.includes('lens')) return '#00BCD4';
  if (id.includes('filter') || id.includes('dichroic') || id.includes('470')) return '#4CAF50';
  if (id.includes('joystick') || id.includes('dial')) return '#FF5722';
  if (id.includes('electronics')) return '#607D8B';
  if (id.includes('wellplate') || id.includes('slide')) return '#795548';
  if (id.includes('revolver')) return '#3F51B5';
  if (id.includes('frame-body')) return '#1e4670';
  if (id.includes('af') || id.includes('autofocus')) return '#E91E63';
  return '#9E9E9E';
}

function shortenLabel(id: string): string {
  const map: Record<string, string> = {
    'frame-body': 'FRAME',
    'frame-single-led': 'LED',
    'frame-led-matrix': 'Matrix',
    'led-ring-koehlerillu': 'Ring',
    'frame-laser-af': 'Laser AF',
    'frame-image-af': 'SW AF',
    'objective-10x-1x1': 'Obj',
    'motorized-objective-revolver': 'Revolver',
    'frame-wellplate-insert-4slides': '4-Slide',
    'frame-wellplate-insert-wellplate': 'Wellplate',
    'overview-camera': 'Overview',
    'filter-dichroic': 'Dichroic',
    'led-470nm': 'Fluor LED',
    'camera-usb': 'Camera',
    'tube-lens-1x1': 'Tube Lens',
    'frame-ps4-joystick': 'PS4',
    'dial-control': 'Dial',
    'electronics-v3': 'UC2e',
  };
  return map[id] || id.replace('frame-', '').substring(0, 8);
}

export function FramePreview() {
  const { getSelectedComponents, getTotalPrice } = useFrameWizardStore();
  const components = getSelectedComponents();
  const totalPrice = getTotalPrice();

  const blocks: PlacedBlock[] = useMemo(
    () =>
      components.map((c) => ({
        moduleId: c.moduleId,
        label: shortenLabel(c.moduleId),
        x: c.gridPos[0],
        y: c.gridPos[1],
        color: moduleColor(c.moduleId),
      })),
    [components]
  );

  // Compute SVG viewBox based on used grid positions
  const minX = Math.min(0, ...blocks.map((b) => b.x));
  const minY = Math.min(0, ...blocks.map((b) => b.y));
  const maxX = Math.max(COLS - 1, ...blocks.map((b) => b.x));
  const maxY = Math.max(ROWS - 1, ...blocks.map((b) => b.y));
  const svgW = (maxX - minX + 2) * GRID_SIZE;
  const svgH = (maxY - minY + 2) * GRID_SIZE;

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
        Frame Layout
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
        {components.length} component{components.length !== 1 ? 's' : ''} placed
      </Typography>

      {/* SVG Preview */}
      <Box
        sx={{
          flex: 1,
          minHeight: 200,
          border: '1px solid #e0e0e0',
          borderRadius: 1,
          bgcolor: '#fafafa',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'auto',
          mb: 2,
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${(minX - 0.5) * GRID_SIZE} ${(minY - 0.5) * GRID_SIZE} ${svgW} ${svgH}`}
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          {/* Grid */}
          {Array.from({ length: maxX - minX + 2 }, (_, i) => (
            <line
              key={`vl-${i}`}
              x1={(minX + i) * GRID_SIZE - GRID_SIZE / 2}
              y1={(minY - 0.5) * GRID_SIZE}
              x2={(minX + i) * GRID_SIZE - GRID_SIZE / 2}
              y2={(maxY + 1.5) * GRID_SIZE}
              stroke="#e0e0e0"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: maxY - minY + 2 }, (_, i) => (
            <line
              key={`hl-${i}`}
              x1={(minX - 0.5) * GRID_SIZE}
              y1={(minY + i) * GRID_SIZE - GRID_SIZE / 2}
              x2={(maxX + 1.5) * GRID_SIZE}
              y2={(minY + i) * GRID_SIZE - GRID_SIZE / 2}
              stroke="#e0e0e0"
              strokeWidth={0.5}
            />
          ))}

          {/* Component blocks */}
          {blocks.map((b, i) => (
            <g key={`${b.moduleId}-${i}`}>
              <rect
                x={b.x * GRID_SIZE - GRID_SIZE / 2 + 1}
                y={b.y * GRID_SIZE - GRID_SIZE / 2 + 1}
                width={GRID_SIZE - 2}
                height={GRID_SIZE - 2}
                rx={3}
                fill={b.color}
                opacity={0.85}
                stroke="#fff"
                strokeWidth={1}
              />
              <text
                x={b.x * GRID_SIZE}
                y={b.y * GRID_SIZE + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize={6}
                fontWeight="bold"
                fontFamily="Arial, sans-serif"
              >
                {b.label}
              </text>
            </g>
          ))}
        </svg>
      </Box>

      <Divider sx={{ mb: 1 }} />

      {/* Component list */}
      <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
        Components
      </Typography>
      <List dense sx={{ flex: 1, overflow: 'auto', maxHeight: 200 }}>
        {components.map((c, i) => (
          <ListItem key={`${c.moduleId}-${i}`} disablePadding sx={{ py: 0.25 }}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <CheckCircle fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText
              primary={c.moduleId}
              primaryTypographyProps={{ variant: 'caption' }}
            />
          </ListItem>
        ))}
        {components.length === 0 && (
          <ListItem disablePadding>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <RadioButtonUnchecked fontSize="small" color="disabled" />
            </ListItemIcon>
            <ListItemText
              primary="No components yet"
              primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
            />
          </ListItem>
        )}
      </List>

      <Divider sx={{ my: 1 }} />

      {/* Total */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle2">Estimated Total</Typography>
        <Chip
          label={`$${totalPrice.toLocaleString()}`}
          color="primary"
          sx={{ fontWeight: 'bold' }}
        />
      </Box>
    </Box>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

const GRID_SIZE = 50;

// Map moduleId to its SVG thumbnail path (must match CSV thumbnails)
const MODULE_THUMBNAILS: Record<string, string> = {
  'frame-body': '/configurator/icons/uc2-frame.svg',
  'frame-single-led': '/configurator/icons/uc2-singleled.svg',
  'frame-led-matrix': '/configurator/icons/uc2-ledmatrix.svg',
  'led-ring-koehlerillu': '/configurator/icons/uc2-ledring.svg',
  'frame-laser-af': '/configurator/icons/uc2-laseraf.svg',
  'frame-image-af': '/configurator/icons/uc2-imageaf.svg',
  'objective-10x-1x1': '/configurator/icons/uc2-10xobjective.svg',
  'motorized-objective-revolver': '/configurator/icons/uc2-objrevolver.svg',
  'frame-wellplate-insert-4slides': '/configurator/icons/uc2-framewellplate4.svg',
  'frame-wellplate-insert-wellplate': '/configurator/icons/uc2-framewellplate.svg',
  'overview-camera': '/configurator/icons/uc2-overviewcam.svg',
  'filter-dichroic': '/configurator/icons/uc2_dichroicmirror_1x1.svg',
  'led-470nm': '/configurator/icons/uc2_ledblue_1x1.svg',
  'camera-usb': '/configurator/icons/uc2_cctvcam_1x2.svg',
  'tube-lens-1x1': '/configurator/icons/uc2_lenspositive_1x1.svg',
  'frame-ps4-joystick': '/configurator/icons/uc2-ps4joystick.svg',
  'dial-control': '/configurator/icons/uc2-dialcontrol.svg',
  'electronics-v3': '/configurator/icons/uc2-electronicsV3.svg',
};

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

// Grid dimensions for each module (default 1x1)
function moduleGridSize(id: string): { w: number; h: number } {
  if (id === 'frame-body') return { w: 3, h: 3 };
  return { w: 1, h: 1 };
}

interface PlacedBlock {
  moduleId: string;
  label: string;
  x: number;
  y: number;
  color: string;
  thumbnail: string | undefined;
  w: number;
  h: number;
}

// Build config image filename from wizard state (no autofocus in the new flow).
function getConfigImageFilename(ws: {
  lightSource: string;
  hasFluorescence: boolean;
}): string {
  const illuKey = (ws.lightSource || 'none').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const fluoKey = ws.hasFluorescence ? 'fluo' : 'nofluo';
  return `/configurator/frame_configs/frame_${illuKey}_${fluoKey}.svg`;
}

export function FramePreview() {
  const { getSelectedComponents, getTotalPrice, wizardState } = useFrameWizardStore();
  const components = getSelectedComponents();
  const totalPrice = getTotalPrice();
  const [tabIndex, setTabIndex] = useState(0);

  // Preload SVG thumbnails
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const urls = new Set(components.map((c) => MODULE_THUMBNAILS[c.moduleId]).filter(Boolean));
    urls.forEach((url) => {
      if (loadedImages[url] !== undefined) return;
      const img = new Image();
      img.onload = () => setLoadedImages((prev) => ({ ...prev, [url]: true }));
      img.onerror = () => setLoadedImages((prev) => ({ ...prev, [url]: false }));
      img.src = url;
    });
  }, [components, loadedImages]);

  const blocks: PlacedBlock[] = useMemo(
    () =>
      components.map((c) => {
        const size = moduleGridSize(c.moduleId);
        return {
          moduleId: c.moduleId,
          label: shortenLabel(c.moduleId),
          x: c.gridPos[0],
          y: c.gridPos[1],
          color: moduleColor(c.moduleId),
          thumbnail: MODULE_THUMBNAILS[c.moduleId],
          w: size.w,
          h: size.h,
        };
      }),
    [components]
  );

  // Compute SVG viewBox based on blocks with their sizes
  const allXs = blocks.flatMap((b) => [b.x, b.x + b.w - 1]);
  const allYs = blocks.flatMap((b) => [b.y, b.y + b.h - 1]);
  const minX = Math.min(0, ...allXs);
  const minY = Math.min(0, ...allYs);
  const maxX = Math.max(2, ...allXs);
  const maxY = Math.max(2, ...allYs);
  const svgW = (maxX - minX + 2) * GRID_SIZE;
  const svgH = (maxY - minY + 2) * GRID_SIZE;

  const configImage = getConfigImageFilename(wizardState);
  const [configImageValid, setConfigImageValid] = useState<boolean | null>(null);
  useEffect(() => {
    setConfigImageValid(null);
    const img = new Image();
    img.onload = () => setConfigImageValid(true);
    img.onerror = () => setConfigImageValid(false);
    img.src = configImage;
  }, [configImage]);

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
        Frame Preview
      </Typography>

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ minHeight: 32, mb: 1 }}
      >
        <Tab label="Grid Layout" sx={{ minHeight: 32, py: 0, fontSize: 12 }} />
        <Tab label="Preview Image" sx={{ minHeight: 32, py: 0, fontSize: 12 }} />
      </Tabs>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
        {components.length} component{components.length !== 1 ? 's' : ''} placed
      </Typography>

      {/* Tab 0: Grid Layout */}
      {tabIndex === 0 && (
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
            {/* Grid lines */}
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

            {/* Component blocks with SVG thumbnails */}
            {blocks.map((b, i) => {
              const bx = b.x * GRID_SIZE - GRID_SIZE / 2 + 1;
              const by = b.y * GRID_SIZE - GRID_SIZE / 2 + 1;
              const bw = b.w * GRID_SIZE - 2;
              const bh = b.h * GRID_SIZE - 2;
              const thumbUrl = b.thumbnail;
              const thumbLoaded = thumbUrl && loadedImages[thumbUrl] === true;

              return (
                <g key={`${b.moduleId}-${i}`}>
                  {/* Background rect */}
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={3}
                    fill={thumbLoaded ? '#f5f5f5' : b.color}
                    opacity={thumbLoaded ? 1 : 0.85}
                    stroke={thumbLoaded ? b.color : '#fff'}
                    strokeWidth={thumbLoaded ? 1.5 : 1}
                  />
                  {/* SVG thumbnail if loaded */}
                  {thumbLoaded && (
                    <image
                      href={thumbUrl}
                      x={bx + 2}
                      y={by + 2}
                      width={bw - 4}
                      height={bh - 4}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )}
                  {/* Label (shown always, smaller when thumbnail loaded) */}
                  <text
                    x={b.x * GRID_SIZE + ((b.w - 1) * GRID_SIZE) / 2}
                    y={by + bh - (thumbLoaded ? 2 : bh / 2 - 1)}
                    textAnchor="middle"
                    dominantBaseline={thumbLoaded ? 'auto' : 'middle'}
                    fill={thumbLoaded ? '#333' : '#fff'}
                    fontSize={thumbLoaded ? 5 : 6}
                    fontWeight="bold"
                    fontFamily="Arial, sans-serif"
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </Box>
      )}

      {/* Tab 1: Preview Image */}
      {tabIndex === 1 && (
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
          {configImageValid === true ? (
            <img
              src={configImage}
              alt="FRAME configuration preview"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Box sx={{ textAlign: 'center', p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Preview image not available for this configuration yet.
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                Complete more steps to see a rendered preview.
              </Typography>
            </Box>
          )}
        </Box>
      )}

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

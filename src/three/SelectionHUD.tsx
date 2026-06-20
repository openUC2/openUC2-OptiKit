import { Html } from '@react-three/drei';
import { Card, CardContent, Typography, Chip, Stack } from '@mui/material';
import { useAppStore } from '../stores/appStore';
import { moduleWorldPosition } from './coords';
import { GRID_MM } from '../constants/grid';
import { useSettings3D } from './use3DSettings';

/**
 * Floating metadata card rendered via drei <Html> above the selected module.
 * Only visible when a single module is selected.
 */
export function SelectionHUD() {
  const selectedId = useAppStore(s => s.selectedItemId);
  const selectedType = useAppStore(s => s.selectedItemType);
  const placedModules = useAppStore(s => s.placedModules);
  const modules = useAppStore(s => s.modules);
  const { settings } = useSettings3D();
  const isDark = settings.theme === 'dark';

  if (!selectedId || selectedType !== 'module') return null;

  const placed = placedModules.find(m => m.id === selectedId);
  if (!placed) return null;

  const def = modules.find(d => d.id === placed.moduleId);
  const pos = moduleWorldPosition(placed);
  // Offset the HUD up and to the (screen) upper-right of the cube so it never
  // covers the selected module or its gizmo. +X = right, −Z = up-screen in the
  // default top-down view.
  const hudPos: [number, number, number] = [
    pos[0] + GRID_MM.cube * 0.9,
    pos[1] + GRID_MM.cube * 1.1,
    pos[2] - GRID_MM.cube * 0.9,
  ];

  return (
    <Html
      position={hudPos}
      center
      distanceFactor={400}
      style={{ pointerEvents: 'none' }}
    >
      <Card
        sx={{
          minWidth: 180,
          maxWidth: 260,
          bgcolor: isDark ? 'rgba(30, 30, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          color: isDark ? 'white' : 'grey.900',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 170, 0, 0.5)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}
      >
        <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
            {def?.name ?? placed.moduleId}
          </Typography>

          {def?.description && (
            <Typography variant="caption" sx={{ color: isDark ? 'grey.400' : 'grey.600', display: 'block', mb: 0.5 }} noWrap>
              {def.description}
            </Typography>
          )}

          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip label={`Layer ${placed.layer}`} size="small" variant="outlined" sx={{ color: isDark ? 'grey.300' : 'grey.700', borderColor: isDark ? 'grey.600' : 'grey.400', height: 20, fontSize: '0.65rem' }} />
            <Chip label={`${placed.rotation}°`} size="small" variant="outlined" sx={{ color: isDark ? 'grey.300' : 'grey.700', borderColor: isDark ? 'grey.600' : 'grey.400', height: 20, fontSize: '0.65rem' }} />
            {(placed.topRotation ?? 0) !== 0 && (
              <Chip label={`Roll ${placed.topRotation}°`} size="small" variant="outlined" sx={{ color: isDark ? 'grey.300' : 'grey.700', borderColor: isDark ? 'grey.600' : 'grey.400', height: 20, fontSize: '0.65rem' }} />
            )}
            {(placed.tiltRotation ?? 0) !== 0 && (
              <Chip label={`Tilt ${placed.tiltRotation}°`} size="small" variant="outlined" sx={{ color: isDark ? 'grey.300' : 'grey.700', borderColor: isDark ? 'grey.600' : 'grey.400', height: 20, fontSize: '0.65rem' }} />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Html>
  );
}

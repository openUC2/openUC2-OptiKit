import { Html } from '@react-three/drei';
import { Card, CardContent, Typography, Chip, Stack } from '@mui/material';
import { useAppStore } from '../stores/appStore';
import { moduleWorldPosition } from './coords';
import { GRID_MM } from '../constants/grid';

/**
 * Floating metadata card rendered via drei <Html> above the selected module.
 * Only visible when a single module is selected.
 */
export function SelectionHUD() {
  const selectedId = useAppStore(s => s.selectedItemId);
  const selectedType = useAppStore(s => s.selectedItemType);
  const placedModules = useAppStore(s => s.placedModules);
  const modules = useAppStore(s => s.modules);

  if (!selectedId || selectedType !== 'module') return null;

  const placed = placedModules.find(m => m.id === selectedId);
  if (!placed) return null;

  const def = modules.find(d => d.id === placed.moduleId);
  const pos = moduleWorldPosition(placed);
  // Position the HUD above the cube
  const hudPos: [number, number, number] = [pos[0], pos[1] + GRID_MM.cube / 2 + 15, pos[2]];

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
          bgcolor: 'rgba(30, 30, 46, 0.92)',
          color: 'white',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 170, 0, 0.5)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
            {def?.name ?? placed.moduleId}
          </Typography>

          {def?.description && (
            <Typography variant="caption" sx={{ color: 'grey.400', display: 'block', mb: 0.5 }} noWrap>
              {def.description}
            </Typography>
          )}

          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Chip label={`Layer ${placed.layer}`} size="small" variant="outlined" sx={{ color: 'grey.300', borderColor: 'grey.600', height: 20, fontSize: '0.65rem' }} />
            <Chip label={`${placed.rotation}°`} size="small" variant="outlined" sx={{ color: 'grey.300', borderColor: 'grey.600', height: 20, fontSize: '0.65rem' }} />
            {(placed.topRotation ?? 0) !== 0 && (
              <Chip label={`Top ${placed.topRotation}°`} size="small" variant="outlined" sx={{ color: 'grey.300', borderColor: 'grey.600', height: 20, fontSize: '0.65rem' }} />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Html>
  );
}

/**
 * WP-65: compact layer-visibility chip row, shared by the schematic (bottom
 * toolbar) and the assembly (bottom overlay). One chip per layer — derived
 * from the parts present plus the working-plane layer — clicking cycles
 * visible → dimmed → hidden; a "solo" toggle for the active working-plane
 * layer; a "plates & joints" sub-toggle for the interface parts (WP-64)
 * living in the 5 mm zone between layers.
 */

import { useMemo } from 'react';
import { Chip, Stack, Tooltip } from '@mui/material';
import {
  layerAppearance,
  layerRangeOf,
  useDocParts,
  useLayerStore,
} from '../../document';

const CHIP_SX = { height: 22, '& .MuiChip-label': { px: 0.9, fontSize: 11 } };

export function LayerChips() {
  const parts = useDocParts();
  const vis = useLayerStore();

  const layers = useMemo(() => {
    const range = layerRangeOf(parts);
    const min = Math.min(range?.min ?? vis.activeLayer, vis.activeLayer);
    const max = Math.max(range?.max ?? vis.activeLayer, vis.activeLayer);
    const out: number[] = [];
    for (let l = min; l <= max; l++) out.push(l);
    return out;
  }, [parts, vis.activeLayer]);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Tooltip title={`Solo the working-plane layer (L${vis.activeLayer}) — hide every other layer`}>
        <Chip
          size="small"
          label="solo"
          clickable
          color={vis.soloLayer !== null ? 'warning' : 'default'}
          variant={vis.soloLayer !== null ? 'filled' : 'outlined'}
          onClick={() => vis.toggleSolo()}
          sx={CHIP_SX}
        />
      </Tooltip>
      {layers.map(layer => {
        const o = vis.overrides[layer];
        const mode = !o || (o.visible && !o.dimmed)
          ? 'visible'
          : o.visible
            ? 'dimmed'
            : 'hidden';
        const active = layer === vis.activeLayer;
        const effective = layerAppearance(layer, false, vis);
        return (
          <Tooltip
            key={layer}
            title={
              `L${layer}: ${mode}` +
              (active ? ' · working plane (always visible)' : '') +
              ' — click: visible → dimmed → hidden'
            }
          >
            <Chip
              size="small"
              label={`L${layer}`}
              clickable
              color={active ? 'primary' : 'default'}
              variant={mode === 'visible' ? 'filled' : 'outlined'}
              onClick={() => vis.cycleLayer(layer)}
              sx={{
                ...CHIP_SX,
                opacity: effective === 'hidden' ? 0.45 : effective === 'dimmed' ? 0.7 : 1,
                '& .MuiChip-label': {
                  ...CHIP_SX['& .MuiChip-label'],
                  textDecoration: mode === 'hidden' ? 'line-through' : 'none',
                },
              }}
            />
          </Tooltip>
        );
      })}
      <Tooltip title="Show plates & joints — the structural parts in the 5 mm zone between layers (they toggle with their layer, gated by this)">
        <Chip
          size="small"
          label="plates & joints"
          clickable
          variant={vis.showInterface ? 'filled' : 'outlined'}
          onClick={() => vis.setShowInterface(!vis.showInterface)}
          sx={{
            ...CHIP_SX,
            opacity: vis.showInterface ? 1 : 0.55,
            '& .MuiChip-label': {
              ...CHIP_SX['& .MuiChip-label'],
              textDecoration: vis.showInterface ? 'none' : 'line-through',
            },
          }}
        />
      </Tooltip>
    </Stack>
  );
}

/**
 * Property panel for the schematic view: numeric world pose (mm), yaw, DOF
 * sliders, rename/delete — plus the path list. Document-facade only.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Route as RouteIcon,
} from '@mui/icons-material';
import type { DocPart, Vec3 } from '../../document';
import {
  captureUndo,
  commitUndo,
  movePartWorld,
  removePart,
  removePath,
  renamePart,
  rotatePart,
  setDofValue,
  tiltPart,
  useDocPart,
  useDocPaths,
  useSelectedPartId,
} from '../../document';

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
}) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => setText(value.toFixed(2)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(v);
    else setText(value.toFixed(2));
  };
  return (
    <TextField
      label={label}
      size="small"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
      }}
      slotProps={{ htmlInput: { step, inputMode: 'decimal', style: { fontSize: 13 } } }}
      sx={{ width: 92 }}
    />
  );
}

/** One undo step per discrete panel edit (WP-28: tilts must be undoable). */
function withUndoStep(mutate: () => void): void {
  const token = captureUndo();
  mutate();
  commitUndo(token);
}

function PartProperties({ part }: { part: DocPart }) {
  const [ref, setRef] = useState(part.ref);
  useEffect(() => setRef(part.ref), [part.ref]);
  const pos = part.worldPose.positionMm;

  const setAxis = (axis: 0 | 1 | 2) => (v: number) => {
    const next = [...pos] as Vec3;
    next[axis] = v;
    withUndoStep(() => movePartWorld(part.id, next));
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          label="Reference"
          size="small"
          value={ref}
          onChange={e => setRef(e.target.value)}
          onBlur={() => ref !== part.ref && renamePart(part.id, ref)}
          sx={{ flex: 1 }}
        />
        <Chip size="small" label={part.category} />
        <Tooltip title="Delete part (Del)">
          <IconButton size="small" color="error" onClick={() => removePart(part.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        World position (mm) — x east · y north · z up
      </Typography>
      <Stack direction="row" spacing={1}>
        <NumberField label="X" value={pos[0]} onCommit={setAxis(0)} />
        <NumberField label="Y" value={pos[1]} onCommit={setAxis(1)} />
        <NumberField label="Z" value={pos[2]} onCommit={setAxis(2)} />
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Orientation (°) — fine tilts about the part's local axes (WP-28)
      </Typography>
      <Stack direction="row" spacing={1}>
        <NumberField
          label="Pitch x°"
          value={part.gridPose.offsetDeg.x}
          onCommit={v => withUndoStep(() => tiltPart(part.id, { x: v }))}
          step={0.5}
        />
        <NumberField
          label="Roll y°"
          value={part.gridPose.offsetDeg.y}
          onCommit={v => withUndoStep(() => tiltPart(part.id, { y: v }))}
          step={0.5}
        />
        <NumberField
          label="Yaw z°"
          value={part.worldPose.yawDeg}
          onCommit={v => withUndoStep(() => rotatePart(part.id, v))}
          step={5}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        grid cell [{part.gridPose.cell.join(', ')}]
        {part.gridPose.offsetMm.some(v => Math.abs(v) > 1e-6) &&
          ` + δ(${part.gridPose.offsetMm.map(v => v.toFixed(1)).join(', ')}) mm`}
        {(Math.abs(part.gridPose.offsetDeg.x) > 1e-6 || Math.abs(part.gridPose.offsetDeg.y) > 1e-6) &&
          ` + ΔR(${part.gridPose.offsetDeg.x.toFixed(2)}, ${part.gridPose.offsetDeg.y.toFixed(2)}, ${part.gridPose.offsetDeg.z.toFixed(2)})°`}
      </Typography>

      {part.dofs.length > 0 && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Degrees of freedom
          </Typography>
          {part.dofs.map(dof => (
            <Box key={dof.name} sx={{ px: 0.5 }}>
              <Typography variant="caption">
                {dof.name} = {dof.value.toFixed(2)} {dof.unit}
              </Typography>
              <Slider
                size="small"
                value={dof.value}
                min={dof.range?.[0] ?? -10}
                max={dof.range?.[1] ?? 10}
                step={0.05}
                onChange={(_, v) => setDofValue(part.id, dof.name, v as number)}
              />
            </Box>
          ))}
        </>
      )}

      <Divider />
      <Typography variant="caption" color="text.secondary">
        library: {part.libraryRef}
      </Typography>
    </Stack>
  );
}

export function SchematicPropertyPanel({
  chainDraft,
  activePathName,
  onFinishChain,
  onCancelChain,
}: {
  chainDraft: string[] | null;
  activePathName: string;
  onFinishChain: () => void;
  onCancelChain: () => void;
}) {
  const selectedId = useSelectedPartId();
  const part = useDocPart(selectedId);
  const paths = useDocPaths();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {part ? (
        <PartProperties part={part} />
      ) : (
        <Typography variant="body2" color="text.secondary">
          Select a part to edit its pose — or click a port pin to start chaining a beam path.
        </Typography>
      )}

      <Divider />
      <Stack direction="row" alignItems="center" spacing={1}>
        <RouteIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Beam paths
        </Typography>
      </Stack>

      {chainDraft && (
        <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption">
            Chaining “{activePathName}”: {chainDraft.length} port(s) — click further pins,
            then finish.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Button size="small" variant="contained" onClick={onFinishChain} disabled={chainDraft.length < 2}>
              Finish
            </Button>
            <Button size="small" onClick={onCancelChain}>
              Cancel (Esc)
            </Button>
          </Stack>
        </Box>
      )}

      <List dense disablePadding>
        {paths.length === 0 && !chainDraft && (
          <Typography variant="caption" color="text.secondary">
            No paths yet.
          </Typography>
        )}
        {paths.map(p => (
          <ListItem
            key={p.name}
            disableGutters
            secondaryAction={
              <IconButton size="small" edge="end" onClick={() => removePath(p.name)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemText
              primary={p.name}
              secondary={`${p.chain.length} traversal(s)`}
              slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

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
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Bolt as BoltIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Route as RouteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { GenerateHolderDialog } from '../assembly/GenerateHolderDialog';
import { PartAnatomy } from '../inspector/PartAnatomy';
import { runUnbind } from './unbindAction';
import { parseDecimal } from '../../utils/parseDecimal';
import { PartOpticsSection } from '../inspector/PartOpticsSection';
import { useServiceStore } from './serviceStore';
import type { DocPart, Vec3 } from '../../document';
import {
  firmwareCommand,
  getDeviceUrl,
  sendActuation,
  setDeviceUrl,
} from '../../model/actuation';
import { sourceTint } from './colors';
import {
  T_CLASS_LABEL,
  activeWavelengthUm,
  captureUndo,
  commitUndo,
  groupInstanceOf,
  groupNameOf,
  isAdhocGroup,
  renameGroup,
  getPart,
  isSourceOn,
  setActiveWavelengthUm,
  setSourceOn,
  libraryEntryOf,
  movePartWorld,
  removeFiber,
  removePart,
  removePath,
  renamePart,
  rotatePart,
  selectPart,
  setDofValue,
  setPartParam,
  tiltPart,
  ungroupInstance,
  updateFiber,
  useDocPart,
  useDocParts,
  useDocPaths,
  useFibersStore,
  useGroupEditStore,
  useSelectedPartId,
  useSelectedPartIds,
} from '../../document';

function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => setText(value.toFixed(2)), [value]);
  const commit = () => {
    // WP-92: locale-tolerant — "0,15" commits as 0.15 (parseFloat would have
    // silently truncated it to 0).
    const v = parseDecimal(text);
    if (v !== null) onCommit(v);
    else setText(value.toFixed(2));
  };
  return (
    <TextField
      label={label}
      size="small"
      value={text}
      disabled={disabled}
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
  const navigate = useNavigate();
  const [ref, setRef] = useState(part.ref);
  useEffect(() => setRef(part.ref), [part.ref]);
  const pos = part.worldPose.positionMm;
  // Mechanical template class of the part's library record (WP-34).
  const lib = libraryEntryOf(part.libraryRef);
  const tClass = lib?.templateClass ?? null;
  const isT1 = tClass === 'fixed';
  const stateParam = typeof part.params.state === 'string' ? part.params.state : '';
  // WP-42: firmware-actuated axes drive live sliders (galvo tilt, stage focus).
  const actuatableDofs = (lib?.dofs ?? []).filter(d => d.actuatable);
  // WP-47: source runtime state + the record's line list.
  const sourceOn = isSourceOn(part);
  const activeUm = activeWavelengthUm(part);
  const lines = lib?.wavelengthsUm ?? [];
  const tint = sourceTint(activeUm);
  // WP-91: "simulate all lines" — one trace per line, spot per wavelength.
  const simBusy = useServiceStore(s => s.simBusy);
  const runSimulateAllLines = useServiceStore(s => s.runSimulateAllLines);
  const programmable = lib?.programmable ?? null;
  const activeAreaMm =
    programmable?.pixelPitchUm != null && programmable.resolution
      ? ([
          (programmable.resolution[0] * programmable.pixelPitchUm) / 1000,
          (programmable.resolution[1] * programmable.pixelPitchUm) / 1000,
        ] as [number, number])
      : null;
  // WP-46: patch cords terminating on this part.
  const allFibers = useFibersStore(s => s.fibers);
  const partFibers = allFibers.filter(
    f => f.from.startsWith(`${part.id}.`) || f.to.startsWith(`${part.id}.`),
  );
  // WP-44: group membership + edit-mode toggle.
  const groupInstance = groupInstanceOf(part.id);
  const groupRef = typeof part.params.groupRef === 'string' ? part.params.groupRef : null;
  // WP-71: an ad-hoc group carries an editable name rather than a record id.
  const adhoc = isAdhocGroup(part);
  const [groupLabel, setGroupLabel] = useState(() => groupNameOf(part));
  useEffect(() => setGroupLabel(groupNameOf(part)), [part]);
  const unlockedMap = useGroupEditStore(s => s.unlocked);
  const toggleUnlocked = useGroupEditStore(s => s.toggleUnlocked);
  const groupUnlocked = groupInstance ? !!unlockedMap[groupInstance] : false;
  // WP-26: send a DOF value to a device as a firmware command.
  const [deviceUrl, setDeviceUrlState] = useState(getDeviceUrl());
  const [actNote, setActNote] = useState<string | null>(null);
  /** WP-101: why a typed X/Y/Z did not land where it was typed. */
  const [poseNote, setPoseNote] = useState<string | null>(null);
  // WP-76: "generate a holder…" for an unbound primitive, right where the
  // ray diagram told the user where the optic belongs (was Assembly-only).
  const [holderOpen, setHolderOpen] = useState(false);

  const sendDof = async (dofName: string, value: number) => {
    const dof = actuatableDofs.find(d => d.name === dofName);
    if (!dof) return;
    const command = firmwareCommand(dof, value);
    if (!command) {
      setActNote(`${dofName}: not firmware-bound`);
      return;
    }
    if (!getDeviceUrl()) {
      setActNote(`${command.uc2rest.task} ${dofName}=${value} (no device — command only)`);
      return;
    }
    try {
      const res = await sendActuation(command);
      setActNote(`${command.uc2rest.task} ${dofName}=${value} → ${res.status}`);
    } catch (e) {
      setActNote(`send failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const setAxis = (axis: 0 | 1 | 2) => (v: number) => {
    const next = [...pos] as Vec3;
    next[axis] = v;
    withUndoStep(() => movePartWorld(part.id, next));
    // WP-101: the T-class may well override what was typed (a T1 part holds
    // the cell centre, a T2 part keeps only its DOF component). Saying so
    // beats a field that silently springs back to a different number.
    const landed = getPart(part.id)?.worldPose.positionMm;
    if (landed && Math.abs(landed[axis] - v) > 1e-6) {
      setPoseNote(
        `${'XYZ'[axis]} = ${landed[axis].toFixed(2)} — ${
          isT1
            ? 'a T1 part holds its cube pose; move it a whole cell instead'
            : "clamped onto the template's declared DOF axis and range"
        }`,
      );
    } else {
      setPoseNote(null);
    }
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
        {/* WP-60: a bare symbol — no mechanics bound at all. */}
        {lib?.unbound && (
          <Tooltip title="no mechanics bound — an optical primitive that floats freely until you generate a holder (WP-61)">
            <Chip size="small" label="UNBOUND" color="info" variant="outlined" sx={{ fontWeight: 700 }} />
          </Tooltip>
        )}
        {tClass && (
          <Tooltip
            title={
              isT1
                ? 'T1 fixed template: the intra-cube pose comes from the record'
                : tClass === 'adaptive'
                  ? 'T2 adaptive template: moves along its declared DOF axes'
                  : 'T3 generative template: free placement, the generator wraps it'
            }
          >
            <Chip
              size="small"
              label={T_CLASS_LABEL[tClass]}
              color={isT1 ? 'default' : tClass === 'adaptive' ? 'success' : 'secondary'}
              sx={{ fontWeight: 700 }}
            />
          </Tooltip>
        )}
        <Chip size="small" label={part.category} />
        {/* WP-64: the same ?open= deep-link the assembly panel got in WP-37 —
            straight from the placed part into its component record. */}
        {lib?.componentId && (
          <Tooltip title="open in the component editor">
            <IconButton
              size="small"
              onClick={() =>
                navigate(`/configurator/components?open=${encodeURIComponent(lib.componentId!)}`)
              }
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Delete part (Del)">
          <IconButton size="small" color="error" onClick={() => removePart(part.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* WP-44: group membership — the instance moves as one rigid unit until
          unlocked for member editing. WP-71: an AD-HOC group's name is
          editable here (a library OPM's is not — it comes from the record). */}
      {groupInstance && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Tooltip title={`part of group instance ${groupInstance}${groupRef ? ` (${groupRef})` : ''}`}>
            <Chip
              size="small"
              color="secondary"
              label={`⬚ ${adhoc ? groupNameOf(part) : groupRef?.split('.').pop() ?? 'group'}`}
              sx={{ fontWeight: 700, height: 20 }}
            />
          </Tooltip>
          {adhoc && (
            <TextField
              size="small" variant="standard" label="group name"
              value={groupLabel}
              onChange={e => setGroupLabel(e.target.value)}
              onBlur={() => {
                if (groupLabel !== groupNameOf(part)) renameGroup(groupInstance, groupLabel);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') renameGroup(groupInstance, groupLabel);
              }}
              sx={{ width: 130 }}
            />
          )}
          <Button size="small" onClick={() => toggleUnlocked(groupInstance)}>
            {groupUnlocked ? 'lock group (move as unit)' : 'edit members'}
          </Button>
          <Button size="small" color="warning" onClick={() => ungroupInstance(groupInstance)}>
            ungroup
          </Button>
        </Stack>
      )}

      <Typography variant="caption" color="text.secondary">
        World position (mm) — x east · y north · z up
      </Typography>
      <Stack direction="row" spacing={1}>
        <NumberField label="X" value={pos[0]} onCommit={setAxis(0)} />
        <NumberField label="Y" value={pos[1]} onCommit={setAxis(1)} />
        <NumberField label="Z" value={pos[2]} onCommit={setAxis(2)} />
      </Stack>
      {poseNote && (
        <Typography variant="caption" color="warning.main">
          {poseNote}
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary">
        Orientation (°) — fine tilts about the part's local axes (WP-28)
        {isT1 && ' — locked by the T1 template'}
      </Typography>
      <Stack direction="row" spacing={1}>
        <NumberField
          label="Pitch x°"
          value={part.gridPose.offsetDeg.x}
          onCommit={v => withUndoStep(() => tiltPart(part.id, { x: v }))}
          step={0.5}
          disabled={isT1}
        />
        <NumberField
          label="Roll y°"
          value={part.gridPose.offsetDeg.y}
          onCommit={v => withUndoStep(() => tiltPart(part.id, { y: v }))}
          step={0.5}
          disabled={isT1}
        />
        <NumberField
          label={isT1 ? 'Yaw z° (90° steps)' : 'Yaw z°'}
          value={part.worldPose.yawDeg}
          onCommit={v => withUndoStep(() => rotatePart(part.id, v))}
          step={isT1 ? 90 : 5}
        />
      </Stack>

      {/* T1 with declared states (WP-34 amendment): a discrete configuration
          switcher (Inventor positional representations), not free pose. */}
      {isT1 && (lib?.states.length ?? 0) > 0 && (
        <TextField
          select
          size="small"
          label="Template state"
          value={stateParam || lib!.states[0]}
          onChange={e =>
            withUndoStep(() => setPartParam(part.id, 'state', e.target.value))
          }
          helperText="discrete T1 configurations from the template record"
        >
          {lib!.states.map(s => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* T2: the declared travel axes, even before a value is set. */}
      {tClass === 'adaptive' && (lib?.dofs.length ?? 0) > 0 && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          {lib!.dofs.map(d => (
            <Chip
              key={d.name}
              size="small"
              variant="outlined"
              color="success"
              label={`${d.name}: ${d.axis || '?'}${d.range ? ` ∈ [${d.range[0]}, ${d.range[1]}] ${d.unit}` : ''}`}
            />
          ))}
        </Stack>
      )}

      {/* WP-42: actuated axes — a live slider per firmware-bound DOF (a galvo's
          per-mirror tilt, a stage's focus), within the declared range. */}
      {actuatableDofs.length > 0 && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Actuated axes
          </Typography>
          {actuatableDofs.map(d => {
            const value = part.dofs.find(v => v.name === d.name)?.value ?? 0;
            return (
              <Box key={d.name} sx={{ px: 0.5 }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Tooltip title={d.canObject != null
                    ? `firmware-bound (CAN object ${typeof d.canObject === 'number'
                        ? '0x' + d.canObject.toString(16) : d.canObject})`
                    : 'declared actuatable but no firmware binding'}>
                    <Chip size="small" color={d.canObject != null ? 'warning' : 'default'}
                      label={`⚡ ${d.name}`} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  </Tooltip>
                  <Typography variant="caption" sx={{ flex: 1 }}>
                    {value.toFixed(2)} {d.unit}
                    {d.surface != null && ` · surface ${d.surface}`}
                    {d.pivotFrame && ` · about ${d.pivotFrame}`}
                  </Typography>
                  <Tooltip title={d.canObject != null
                    ? 'send this value to the device (WP-26)'
                    : 'no firmware binding — nothing to send'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={d.canObject == null}
                        onClick={() => sendDof(d.name, value)}
                      >
                        <BoltIcon fontSize="small" color="warning" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <Slider
                  size="small"
                  value={value}
                  min={d.range?.[0] ?? -15}
                  max={d.range?.[1] ?? 15}
                  step={d.kind === 'rotation' ? 0.1 : 0.05}
                  onChange={(_, v) => withUndoStep(() => setDofValue(part.id, d.name, v as number))}
                />
              </Box>
            );
          })}
          <TextField
            label="Device URL"
            size="small"
            placeholder="http://192.168.4.1"
            value={deviceUrl}
            onChange={e => setDeviceUrlState(e.target.value)}
            onBlur={() => setDeviceUrl(deviceUrl.trim())}
            helperText="UC2-REST controller — empty shows the command only"
            FormHelperTextProps={{ sx: { fontSize: 10, mx: 0 } }}
          />
          {actNote && (
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {actNote}
            </Typography>
          )}
        </>
      )}

      {/* WP-47: a source's runtime state — is it emitting, and on which line?
          Off sources are skipped by auto-chaining, and the active line tints
          the glyph and its rays. */}
      {part.category === 'source' && (
        <>
          <Divider />
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              Source
            </Typography>
            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Switch
                  size="small"
                  checked={sourceOn}
                  onChange={e => withUndoStep(() => setSourceOn(part.id, e.target.checked))}
                />
              }
              label={<Typography variant="caption">{sourceOn ? 'on' : 'off'}</Typography>}
            />
          </Stack>
          {lines.length > 0 ? (
            <>
              {/* WP-91: a multi-line source SHOWS all its lines — each chip a
                  line in its own colour, the ACTIVE one filled. Click to pick;
                  click the active line again to unset. */}
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                {lines.map(um => {
                  const active = activeUm === um;
                  const lineTint = sourceTint(um) ?? undefined;
                  return (
                    <Chip
                      key={um}
                      size="small"
                      label={`${(um * 1000).toFixed(0)} nm`}
                      variant={active ? 'filled' : 'outlined'}
                      onClick={() =>
                        withUndoStep(() => setActiveWavelengthUm(part.id, active ? null : um))
                      }
                      sx={{
                        height: 20,
                        fontSize: 11,
                        borderColor: lineTint,
                        ...(active
                          ? { bgcolor: lineTint, color: '#0b0e13', fontWeight: 700 }
                          : { color: lineTint }),
                      }}
                    />
                  );
                })}
              </Stack>
              {lines.length > 1 && (
                <Tooltip title="trace the beam path once per line and overlay the spot per wavelength — the fluorescence case (excitation + emission through the same optics)">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={simBusy}
                      onClick={() => void runSimulateAllLines(lines)}
                    >
                      simulate all {lines.length} lines
                    </Button>
                  </span>
                </Tooltip>
              )}
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              the record declares no lines — add `source.wavelengths_um` to tint the beam
            </Typography>
          )}
          {tint && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: tint, border: '1px solid', borderColor: 'divider' }} />
              <Typography variant="caption" color="text.secondary">
                {sourceOn ? 'beam tint' : 'off — rays are hidden'}
              </Typography>
            </Stack>
          )}
        </>
      )}

      {/* WP-47: pixel-addressable surface facts (the pattern is not simulated). */}
      {programmable && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Programmable surface
          </Typography>
          <Typography variant="caption">
            {programmable.mode} · {programmable.resolution?.join(' × ') ?? '?'} px
            {programmable.pixelPitchUm != null && ` · ${programmable.pixelPitchUm} µm pitch`}
            {activeAreaMm && ` · ${activeAreaMm[0].toFixed(1)} × ${activeAreaMm[1].toFixed(1)} mm active`}
          </Typography>
        </>
      )}

      {/* WP-46: patch cords landing on this part — a fiber has no geometric
          constraint, so its properties (not its endpoints' poses) are the
          only thing the optics depend on. */}
      {partFibers.length > 0 && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            Fibers
          </Typography>
          {partFibers.map(f => (
            <Box
              key={f.id}
              sx={{ px: 1, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            >
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Chip
                  size="small"
                  label={f.type}
                  color={f.type === 'SM' ? 'info' : 'warning'}
                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                />
                <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all' }}>
                  {f.from === `${part.id}.${f.from.split('.').pop()}` ? '→ ' : '← '}
                  {f.from.startsWith(`${part.id}.`) ? f.to : f.from}
                </Typography>
                <Tooltip title="remove this fiber">
                  <IconButton size="small" onClick={() => removeFiber(f.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                <NumberField
                  label="core µm"
                  value={f.coreUm ?? 0}
                  step={5}
                  onCommit={v => updateFiber(f.id, { coreUm: v > 0 ? v : null })}
                />
                <NumberField
                  label="NA"
                  value={f.na ?? 0}
                  step={0.01}
                  onCommit={v => updateFiber(f.id, { na: v > 0 ? v : null })}
                />
                <NumberField
                  label="length m"
                  value={f.lengthM}
                  step={0.1}
                  onCommit={v => updateFiber(f.id, { lengthM: Math.max(0.001, v) })}
                />
              </Stack>
              <TextField
                select
                size="small"
                label="type"
                value={f.type}
                onChange={e => updateFiber(f.id, { type: e.target.value as 'SM' | 'MM' })}
                sx={{ mt: 0.75, width: 120 }}
              >
                <MenuItem value="MM">MM (NA cone)</MenuItem>
                <MenuItem value="SM">SM (diffraction)</MenuItem>
              </TextField>
            </Box>
          ))}
        </>
      )}

      {/* WP-89: the record's optics + the port list, read-only. */}
      <PartOpticsSection part={part} />

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
      {/* WP-76: the two inverse verbs, in the schematic where the user is
          standing. Unbound primitive → "generate a holder…" (the same WP-61
          dialog the assembly mounts); cube module → "take out of cube". */}
      {lib?.unbound ? (
        <Tooltip title="print a cube holder carved around this optic at its placed pose (WP-61)">
          <Button size="small" variant="contained" onClick={() => setHolderOpen(true)}>
            generate a holder…
          </Button>
        </Tooltip>
      ) : lib?.componentId ? (
        <Tooltip title="drop the cube and keep the optical component at the same pose — it becomes a free UNBOUND primitive (one undo)">
          <Button size="small" variant="outlined" onClick={() => runUnbind(part.id)}>
            take out of cube
          </Button>
        </Tooltip>
      ) : null}
      {lib?.unbound && (
        <GenerateHolderDialog
          part={part}
          open={holderOpen}
          onClose={() => setHolderOpen(false)}
        />
      )}
      {/* WP-104: the anatomy — optic ⊂ housing ⊂ cube — replacing the
          collapsed "◐ id · ▣ class" one-liner, which named the trio without
          ever showing how the three fit together. */}
      <Divider textAlign="left" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">anatomy</Typography>
      </Divider>
      <PartAnatomy
        compact
        category={part.category}
        mount={lib?.mount ?? 'cube'}
        templateClass={lib?.templateClass ?? null}
        componentId={lib?.componentId ?? null}
        templateId={lib?.templateId ?? null}
        moduleId={lib?.mount === 'cube' ? part.libraryRef : null}
        onOpenComponent={
          lib?.componentId
            ? () => navigate(`/configurator/components?open=${encodeURIComponent(lib.componentId!)}`)
            : undefined
        }
      />
      <Typography variant="caption" color="text.secondary" noWrap>
        library: {part.libraryRef}
      </Typography>
    </Stack>
  );
}

/**
 * WP-71: what a multi-selection can say for itself — how many parts, in which
 * categories, the cells they span, and whether they are already one group.
 * The verbs live on the keyboard (Ctrl+G / Ctrl+Shift+G) and in the context
 * menu; this is the readout that makes them make sense.
 */
function MultiSelectionSummary({ parts }: { parts: DocPart[] }) {
  const byCategory = new Map<string, number>();
  for (const p of parts) byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  const cells = parts.map(p => p.gridPose.cell);
  const span = [0, 1, 2].map(
    i => Math.max(...cells.map(c => c[i])) - Math.min(...cells.map(c => c[i])) + 1,
  );
  const instances = new Set(
    parts.map(p => p.params.groupId).filter((g): g is string => typeof g === 'string'),
  );
  const grouped = instances.size === 1 && parts.every(p => typeof p.params.groupId === 'string');

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          {parts.length} parts selected
        </Typography>
        {grouped && (
          <Chip size="small" color="secondary" label={`⬚ ${groupNameOf(parts[0])}`}
            sx={{ fontWeight: 700, height: 20 }} />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {[...byCategory.entries()].map(([cat, n]) => `${n}× ${cat}`).join(' · ')}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        spans {span.join(' × ')} cell(s)
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {grouped
          ? 'already one group — ⇧⌘G ungroups it, or right-click → “save as group record…”'
          : instances.size > 0
            ? 'some of these already belong to a group — ⌘G re-groups them all into a new one'
            : '⌘G groups them (they then move as one rigid unit); right-click for the rest'}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        {parts.map(p => (
          <Chip
            key={p.id} size="small" variant="outlined" label={p.ref}
            onClick={() => selectPart(p.id)}
            sx={{ height: 20 }}
          />
        ))}
      </Stack>
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
  const selectedIds = useSelectedPartIds();
  const parts = useDocParts();
  const paths = useDocPaths();
  // WP-71: with a SET selected, the panel summarizes it — a single part's pose
  // fields would be misleading when Ctrl+G is about to act on five.
  const multi = selectedIds.length > 1 ? parts.filter(p => selectedIds.includes(p.id)) : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {multi.length > 1 ? (
        <MultiSelectionSummary parts={multi} />
      ) : part ? (
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
          {/* WP-78: the draft names its own escape hatch — manual chaining is
              the ambiguous-case fallback, not the default experience. */}
          <Typography variant="caption">
            Chaining “{activePathName}”: {chainDraft.length} port(s) — click further pins,
            then finish. Esc to cancel · or let inference propose it (the Adopt chips
            in the service panel).
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

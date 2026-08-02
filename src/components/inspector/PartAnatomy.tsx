/**
 * WP-104 — the anatomy view: optic → housing → cube, in one picture.
 *
 * The user's words: "when I open a part in the editor, I would see the optical
 * primitive (what it does physically), the way it's inside a housing (e.g.
 * laser case) inside a cube". Nothing in the app drew that. The closest
 * artefacts were a three-line text card in the assembly inspector, a collapsed
 * one-liner in the schematic inspector, and a toggleable ghost cube in the
 * bind workbench — three partial views of one object.
 *
 * The layers are the record trio, which is the whole point: `optical_component`
 * (the physics), `mechanical_template` (the thing that holds it), `cube_module`
 * (the binding that makes it placeable). A MISSING layer is drawn greyed with
 * the reason — those are the authoring to-do list, and clicking one starts it.
 */

import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import type { DocCategory, PartMount, TemplateClass } from '../../document';
import { GLYPH_COLORS } from '../schematic/colors';

const W = 148;
const H = 160;
/** The cube face, in the same 50 : 55 proportion as the real UC2 grid. */
const CUBE = { x: 16, y: 12, w: 100, h: 110 };
const HOUSE = { x: 34, y: 32, w: 64, h: 70 };

/** A category's optic, as a small centred SVG shape. */
function OpticShape({ category, color }: { category: DocCategory; color: string }) {
  const cx = CUBE.x + CUBE.w / 2;
  const cy = CUBE.y + CUBE.h / 2;
  switch (category) {
    case 'mirror':
    case 'beamsplitter':
    case 'dichroic':
      // A 45° plate — the fold every UC2 mirror cube does.
      return (
        <rect
          x={cx - 3} y={cy - 24} width={6} height={48} rx={1}
          fill={color} opacity={0.85}
          transform={`rotate(-45 ${cx} ${cy})`}
        />
      );
    case 'lens':
      return (
        <path
          d={`M ${cx} ${cy - 24} Q ${cx + 13} ${cy} ${cx} ${cy + 24}
              Q ${cx - 13} ${cy} ${cx} ${cy - 24} Z`}
          fill={color} opacity={0.85}
        />
      );
    case 'source':
      return (
        <g fill={color} opacity={0.9}>
          <rect x={cx - 16} y={cy - 9} width={22} height={18} rx={2} />
          <path d={`M ${cx + 6} ${cy - 9} L ${cx + 22} ${cy} L ${cx + 6} ${cy + 9} Z`} />
        </g>
      );
    case 'detector':
      return <rect x={cx - 12} y={cy - 16} width={24} height={32} rx={2} fill={color} opacity={0.9} />;
    default:
      return <rect x={cx - 4} y={cy - 22} width={8} height={44} rx={1} fill={color} opacity={0.85} />;
  }
}

function LayerRow({
  swatch,
  title,
  id,
  present,
  hint,
  onOpen,
}: {
  swatch: string;
  title: string;
  id: string | null;
  present: boolean;
  hint: string;
  onOpen?: () => void;
}) {
  return (
    <Tooltip title={hint} placement="left">
      <Stack
        direction="row" spacing={1} alignItems="baseline"
        onClick={present && onOpen ? onOpen : undefined}
        sx={{
          opacity: present ? 1 : 0.55,
          cursor: present && onOpen ? 'pointer' : 'default',
          '&:hover': present && onOpen ? { textDecoration: 'underline' } : undefined,
        }}
      >
        <Box sx={{
          width: 8, height: 8, borderRadius: 0.5, flexShrink: 0, mt: 0.6,
          bgcolor: present ? swatch : 'transparent',
          border: present ? 'none' : '1px dashed', borderColor: 'text.disabled',
        }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', lineHeight: 1.3 }}>
            {title}
          </Typography>
          <Typography
            variant="caption" color="text.secondary" noWrap
            sx={{ display: 'block', fontFamily: present ? 'monospace' : undefined, fontSize: 10.5 }}
          >
            {present ? id : hint}
          </Typography>
        </Box>
      </Stack>
    </Tooltip>
  );
}

export function PartAnatomy({
  category,
  mount,
  templateClass,
  componentId,
  templateId,
  moduleId,
  onOpenComponent,
  compact = false,
}: {
  category: DocCategory;
  mount: PartMount;
  templateClass: TemplateClass | null;
  /** The optical_component record — the physics. */
  componentId: string | null;
  /** The mechanical_template record — the housing or the cube shell. */
  templateId: string | null;
  /** The cube_module record binding the two (null when there is no cube). */
  moduleId: string | null;
  onOpenComponent?: () => void;
  compact?: boolean;
}) {
  const inCube = mount === 'cube';
  const hasHousing = mount !== 'bare' && Boolean(templateId);
  const color = GLYPH_COLORS[category] ?? '#8899aa';
  // A generated (T3) cube does not exist yet — it is a promise, drawn dashed.
  const cubeDashed = inCube && templateClass === 'generative';

  return (
    <Stack direction={compact ? 'row' : 'column'} spacing={1.25} alignItems={compact ? 'center' : 'stretch'}>
      <Box
        component="svg" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="part anatomy: optic inside its housing inside a cube"
        sx={{ width: compact ? 108 : '100%', maxWidth: 190, flexShrink: 0 }}
      >
        {/* layer 3 — the cube */}
        <rect
          x={CUBE.x} y={CUBE.y} width={CUBE.w} height={CUBE.h} rx={4}
          fill={inCube ? 'currentColor' : 'none'}
          fillOpacity={inCube ? 0.05 : 0}
          stroke="currentColor"
          strokeOpacity={inCube ? (cubeDashed ? 0.35 : 0.7) : 0.18}
          strokeDasharray={inCube ? (cubeDashed ? '5 4' : undefined) : '3 4'}
          strokeWidth={1.5}
        />
        {/* layer 2 — the housing / insert */}
        <rect
          x={HOUSE.x} y={HOUSE.y} width={HOUSE.w} height={HOUSE.h} rx={3}
          fill={hasHousing ? 'currentColor' : 'none'}
          fillOpacity={hasHousing ? 0.08 : 0}
          stroke="currentColor"
          strokeOpacity={hasHousing ? 0.5 : 0.16}
          strokeDasharray={hasHousing ? undefined : '3 4'}
          strokeWidth={1.2}
        />
        {/* layer 1 — the optic itself, always real: it is why the part exists */}
        <OpticShape category={category} color={color} />
        {/* the beam, so the drawing reads as optics and not as boxes */}
        <line
          x1={0} y1={CUBE.y + CUBE.h / 2} x2={W} y2={CUBE.y + CUBE.h / 2}
          stroke={color} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 3"
        />
        <text
          x={W / 2} y={H - 4} textAnchor="middle"
          fill="currentColor" fillOpacity={0.5} fontSize={9}
        >
          {inCube ? '50 × 50 × 55 mm cell' : 'no cube — free placement'}
        </text>
      </Box>

      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
        <LayerRow
          swatch={color}
          title="optic · what it does"
          id={componentId}
          present={Boolean(componentId)}
          hint={componentId
            ? 'the optical_component record — surfaces, ports, focal length'
            : 'no component record yet — author the optics tab'}
          onOpen={onOpenComponent}
        />
        <LayerRow
          swatch="#8aa4c8"
          title={inCube ? 'housing · the insert' : 'housing · holds the optic'}
          id={templateId}
          present={hasHousing}
          hint={hasHousing
            ? 'the mechanical_template record — the printed/ordered part that holds the optic'
            : 'no housing yet — generate a holder (T3), or attach existing CAD on the mechanics tab'}
        />
        <LayerRow
          swatch="#7fbf7f"
          title="cube · reaches the grid"
          id={moduleId}
          present={inCube}
          hint={inCube
            ? 'the cube_module record — binds the optic to its housing so it can be placed'
            : mount === 'housed'
              ? 'housed but not in a cube — generate a cube around the housing to place it on the grid'
              : 'not in a cube — it places freely, but cannot be built until it has a holder'}
        />
        {inCube && templateClass && (
          <Chip
            size="small" variant="outlined"
            label={
              templateClass === 'fixed' ? 'T1 · fixed in its cube'
                : templateClass === 'adaptive' ? 'T2 · the insert moves on its DOFs'
                  : 'T3 · the cube is generated on demand'
            }
            sx={{ height: 18, fontSize: 10, alignSelf: 'flex-start' }}
          />
        )}
      </Stack>
    </Stack>
  );
}

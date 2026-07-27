/**
 * WP-66: "Modules" panel — the schematic's per-part list. One row per placed
 * part (ref, module, grid cell, layer, T-class) with row ↔ canvas
 * cross-probing (WP-17 discipline) and an in-place module swap menu (same
 * category first, "all modules" expander). A toggle flips the SAME component
 * to the WP-50 aggregated rollup — both projections read the one document,
 * and the rollup reuses `buildDocBom` so the numbers can never fork from the
 * release-bundle BOM.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { SwapHoriz as SwapIcon } from '@mui/icons-material';
// Notifications only — the design model itself flows through src/document
// (the same exception PartLibrary uses).
import { useAppStore } from '../../stores/appStore';
import type { DocPart, LibraryPaletteEntry, TemplateClass } from '../../document';
import {
  T_CLASS_LABEL,
  buildDocBom,
  layerOf,
  libraryEntryOf,
  listLibraryEntries,
  selectPart,
  swapPartModule,
  useDocParts,
  useGroupEditStore,
  useSelectedPartId,
} from '../../document';

function shortName(id: string): string {
  return id.split('.').pop()?.replace(/[_-]/g, ' ') ?? id;
}

function tClassColor(tClass: TemplateClass): 'default' | 'success' | 'secondary' {
  return tClass === 'fixed' ? 'default' : tClass === 'adaptive' ? 'success' : 'secondary';
}

/** WP-44 group tag of a part (params carry groupId/groupRef), else null. */
function groupTagOf(part: DocPart): { instanceId: string; label: string } | null {
  const instanceId = part.params.groupId;
  if (typeof instanceId !== 'string' || !instanceId) return null;
  const groupRef = part.params.groupRef;
  const label = typeof groupRef === 'string' && groupRef ? shortName(groupRef) : 'group';
  return { instanceId, label };
}

interface SwapMenuState {
  partId: string;
  anchor: HTMLElement;
  /** "all modules" expander open? (same-category candidates show first). */
  showAll: boolean;
}

export function ModulesPanel({ onZoomToPart }: { onZoomToPart: (partId: string) => void }) {
  const parts = useDocParts();
  const selectedId = useSelectedPartId();
  const unlockedMap = useGroupEditStore(s => s.unlocked);
  const [aggregate, setAggregate] = useState(false);
  const [menu, setMenu] = useState<SwapMenuState | null>(null);

  // Cross-probe canvas → list: keep the selected row in view.
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const bom = useMemo(() => buildDocBom(parts), [parts]);

  const menuPart = menu ? parts.find(p => p.id === menu.partId) : undefined;
  const candidates = useMemo<LibraryPaletteEntry[]>(
    () =>
      menuPart
        ? listLibraryEntries().filter(e => e.moduleId !== menuPart.libraryRef)
        : [],
    [menuPart],
  );
  const sameCategory = candidates.filter(e => e.category === menuPart?.category);
  const others = candidates.filter(e => e.category !== menuPart?.category);
  const othersByCategory = useMemo(() => {
    const byCat = new Map<string, LibraryPaletteEntry[]>();
    for (const entry of others) {
      const list = byCat.get(entry.category) ?? [];
      list.push(entry);
      byCat.set(entry.category, list);
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [others]);

  const handleSwap = (partId: string, moduleId: string) => {
    setMenu(null);
    const result = swapPartModule(partId, moduleId);
    if (result && result.droppedPaths.length > 0) {
      useAppStore.getState().addNotification({
        type: 'warning',
        title: 'path dropped by module swap',
        message:
          `${result.droppedPaths.join(', ')}: the new record declares no ` +
          'matching port, so the chain was removed',
        duration: 8000,
      });
    }
  };

  const swapItem = (entry: LibraryPaletteEntry) => (
    <MenuItem
      key={entry.moduleId}
      dense
      onClick={() => menuPart && handleSwap(menuPart.id, entry.moduleId)}
    >
      <ListItemText
        primary={entry.name}
        secondary={entry.moduleId}
        slotProps={{
          primary: { variant: 'body2' },
          secondary: { variant: 'caption', noWrap: true },
        }}
      />
    </MenuItem>
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="overline">modules</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={aggregate ? 'aggregate' : 'parts'}
          onChange={(_, v) => v && setAggregate(v === 'aggregate')}
        >
          <Tooltip title="one row per placed part">
            <ToggleButton value="parts" sx={{ px: 1, py: 0.25, textTransform: 'none' }}>
              parts
            </ToggleButton>
          </Tooltip>
          <Tooltip title="WP-50 rollup: qty × module × price — same generator as the release-bundle BOM">
            <ToggleButton value="aggregate" sx={{ px: 1, py: 0.25, textTransform: 'none' }}>
              aggregate
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Stack>

      {parts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No parts placed yet — drop modules from the palette.
        </Typography>
      ) : aggregate ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ px: 0.5 }}>qty</TableCell>
              <TableCell sx={{ px: 0.5 }}>module</TableCell>
              <TableCell sx={{ px: 0.5 }} align="right">unit €</TableCell>
              <TableCell sx={{ px: 0.5 }} align="right">total €</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bom.lines.map(line => (
              <TableRow key={line.libraryRef} hover>
                <TableCell sx={{ px: 0.5 }}>{line.qty}×</TableCell>
                <TableCell sx={{ px: 0.5 }}>
                  {line.name}
                  {line.review && (
                    <Chip size="small" label="draft" variant="outlined" sx={{ ml: 0.5, height: 16 }} />
                  )}
                </TableCell>
                <TableCell sx={{ px: 0.5 }} align="right">
                  {line.unitPriceEur != null ? line.unitPriceEur.toFixed(2) : '—'}
                </TableCell>
                <TableCell sx={{ px: 0.5 }} align="right">
                  {line.unitPriceEur != null
                    ? (line.unitPriceEur * line.qty).toFixed(2)
                    : 'unpriced'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ px: 0.5, fontWeight: 600 }} colSpan={3}>
                total · {bom.totalParts} part(s)
                {bom.unpricedLines > 0 ? ` · ${bom.unpricedLines} unpriced line(s)` : ''}
              </TableCell>
              <TableCell sx={{ px: 0.5, fontWeight: 600 }} align="right">
                {bom.pricedTotalEur.toFixed(2)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <List dense disablePadding>
          {parts.map(part => {
            const lib = libraryEntryOf(part.libraryRef);
            const tClass = lib?.templateClass ?? null;
            const cell = part.gridPose.cell;
            const group = groupTagOf(part);
            const locked = group ? !unlockedMap[group.instanceId] : false;
            return (
              <ListItem
                key={part.id}
                disablePadding
                ref={el => {
                  if (el) rowRefs.current.set(part.id, el);
                  else rowRefs.current.delete(part.id);
                }}
                secondaryAction={
                  <Tooltip
                    title={locked ? 'unlock the group to swap members' : 'swap module in place'}
                  >
                    <span>
                      <IconButton
                        size="small"
                        edge="end"
                        disabled={locked}
                        aria-label={`swap module of ${part.ref}`}
                        onClick={e =>
                          setMenu({ partId: part.id, anchor: e.currentTarget, showAll: false })
                        }
                      >
                        <SwapIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                }
              >
                <ListItemButton
                  dense
                  selected={part.id === selectedId}
                  onClick={() => {
                    // Cross-probe list → canvas (WP-17): select AND frame.
                    selectPart(part.id);
                    onZoomToPart(part.id);
                  }}
                  sx={{ pr: 6 }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {part.ref}
                        </Typography>
                        {tClass && (
                          <Chip
                            size="small"
                            label={T_CLASS_LABEL[tClass]}
                            color={tClassColor(tClass)}
                            sx={{ height: 18, fontWeight: 700 }}
                          />
                        )}
                        {group && (
                          <Tooltip title={`group member: ${group.label}`}>
                            <Chip
                              size="small"
                              label={group.label}
                              variant="outlined"
                              sx={{ height: 18 }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    }
                    secondary={
                      `${lib?.name ?? shortName(part.libraryRef)} · ` +
                      `[${cell[0]}, ${cell[1]}, ${cell[2]}] · L${layerOf(part)}`
                    }
                    slotProps={{ secondary: { variant: 'caption', noWrap: true } }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}

      {/* Swap menu: same category first, then the "all modules" expander. */}
      <Menu
        open={menu !== null && menuPart !== undefined}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { maxHeight: 420, width: 300 } } }}
      >
        {menuPart && [
          <ListSubheader key="same-cat" sx={{ lineHeight: '28px' }}>
            {menuPart.category}
          </ListSubheader>,
          ...(sameCategory.length > 0
            ? sameCategory.map(swapItem)
            : [
                <MenuItem key="same-cat-empty" dense disabled>
                  no other {menuPart.category} modules
                </MenuItem>,
              ]),
          ...(!menu?.showAll && others.length > 0
            ? [
                <MenuItem
                  key="show-all"
                  dense
                  onClick={() => setMenu(m => (m ? { ...m, showAll: true } : m))}
                >
                  <Typography variant="body2" color="primary">
                    all modules ({others.length})…
                  </Typography>
                </MenuItem>,
              ]
            : []),
          ...(menu?.showAll
            ? othersByCategory.flatMap(([category, entries]) => [
                <ListSubheader key={`cat-${category}`} sx={{ lineHeight: '28px' }}>
                  {category}
                </ListSubheader>,
                ...entries.map(swapItem),
              ])
            : []),
        ]}
      </Menu>
    </Box>
  );
}

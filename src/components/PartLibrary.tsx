import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Typography,
  Chip,
  InputAdornment,
  Paper,
  Button,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  DragIndicator as DragIcon,
  GitHub as GitHubIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import {
  T_CLASS_LABEL,
  addGroup,
  categoryOf,
  entriesFromComponents,
  entriesFromIndex,
  entriesFromWorkspace,
  groupEntriesFromIndex,
  isLibraryModule,
  libraryEntryOf,
  registerLibraryGroups,
  registerLibraryModules,
  templateClassOf,
} from '../document';
import { useLibraryIndex } from '../model/libraryIndex';
import { mergeRepoIndexes, useMountedRepos } from '../model/communityRepos';
import { AddCommunityRepoDialog } from './library/AddCommunityRepoDialog';
import { useWorkspaceLibrary } from '../model/workspaceLibrary';
import { getCoreUrl } from '../api/coreClient';
import { GlyphThumb } from './schematic/GlyphThumb';
import type { ModuleDefinition } from '../types';

/**
 * WP-48: an authored symbol outranks the derived glyph — but only once it
 * actually loads. An unreachable asset (offline registry) falls back to the
 * derived glyph instead of a broken-image tile.
 */
const SymbolOrGlyphThumb: React.FC<{
  symbolUrl: string | null;
  category: DocCategory;
  name: string;
}> = ({ symbolUrl, category, name }) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [symbolUrl]);
  if (!symbolUrl || failed) return <GlyphThumb category={category} size={58} />;
  return (
    <img
      src={symbolUrl}
      alt={name}
      onError={() => setFailed(true)}
      style={{ width: 58, height: 58, objectFit: 'contain' }}
    />
  );
};

export const PartLibrary: React.FC<{ opticalGlyphs?: boolean }> = ({
  opticalGlyphs = false,
}) => {
  const { modules, loadModules, placeModule, placedModules, layers, activeLayerId } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  // WP-58: the "Add library from GitHub" dialog.
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);

  // WP-34: registry + workspace parts join the palette as the "Library"
  // group. Re-registers whenever the index refreshes (bumpLibraryIndex after
  // a dev write / workspace save) or a loadModules() call wiped the list.
  const libraryIndex = useLibraryIndex();
  const workspaceRecords = useWorkspaceLibrary(s => s.records);
  const workspaceThumbs = useWorkspaceLibrary(s => s.thumbnails);
  // WP-58: libraries mounted from community GitHub repos. Precedence is
  // builtin < mounted < local drafts, so a fork can ADD parts but never
  // silently override a curated openuc2.* id (clashes are surfaced below).
  const mountedRepos = useMountedRepos();
  const merged = useMemo(
    () => mergeRepoIndexes(libraryIndex.modules, libraryIndex.groups, mountedRepos),
    [libraryIndex.modules, libraryIndex.groups, mountedRepos],
  );

  useEffect(() => {
    const registry = entriesFromIndex(merged.modules, getCoreUrl());
    const registryIds = new Set(registry.map(e => e.moduleId));
    const workspace = entriesFromWorkspace(workspaceRecords, workspaceThumbs)
      .filter(e => !registryIds.has(e.moduleId));
    const workspaceIds = new Set(workspace.map(e => e.moduleId));
    // WP-60: published symbols NO module binds place directly — grouped
    // "<category> · unbound". Local drafts with the same id keep precedence.
    const unbound = entriesFromComponents(
      libraryIndex.components,
      merged.modules,
      getCoreUrl(),
    ).filter(e => !registryIds.has(e.moduleId) && !workspaceIds.has(e.moduleId));
    registerLibraryModules([...registry, ...workspace, ...unbound]);
    // WP-44: groups (the OPM arrangements) register alongside the modules.
    registerLibraryGroups(groupEntriesFromIndex(merged.groups));
  }, [merged, libraryIndex.components, workspaceRecords, workspaceThumbs, modules]);

  const paletteGroups = groupEntriesFromIndex(merged.groups);

  // WP-44: place a group as one rigid unit at the origin cell; the user
  // drags the whole arrangement into place afterwards.
  const placeGroup = (groupId: string) => {
    const result = addGroup(groupId, [0, 0, 0]);
    const notify = useAppStore.getState().addNotification;
    if (!result) {
      notify({ type: 'error', title: 'group not found', message: groupId, duration: 5000 });
      return;
    }
    const bayNote = result.snappedToBay
      ? ` — docked into the ${result.snappedToBay.bay} bay`
      : '';
    notify({
      type: result.bayOverflow ? 'warning' : 'success',
      title: result.bayOverflow ? 'group exceeds the bay' : 'group placed',
      message: result.bayOverflow
        ? `${groupId} is larger than the bay it docked into — check the fit`
        : `${result.partIds.length} part(s) placed as one unit${bayNote} — drag any member to move the group`,
      duration: 6000,
    });
  };

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  // WP-76: entries registered for unbind-target lookup only stay out of the
  // shelf — the optic is already offered through its cube module.
  const visibleModules = modules.filter(m => !libraryEntryOf(m.id)?.paletteHidden);

  const filteredModules = visibleModules.filter(module => {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'all' || module.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const groups = ['all', ...new Set(visibleModules.map(m => m.group))];

  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  const currentLayerIndex = activeLayer?.index ?? 0;

  // Double-click / tap to place module at the next free grid position
  const handleQuickPlace = (moduleId: string) => {
    // Find the center of the visible grid area – just pick the next free spot
    const occupied = new Set(
      placedModules.map(m => `${m.position.x},${m.position.y}`)
    );
    // Try center-first spiral: 5,5 → 4,5 → 5,4 → 6,5 → …
    for (let r = 0; r < 10; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = 5 + dx;
          const y = 5 + dy;
          if (x >= 0 && x < 10 && y >= 0 && y < 10 && !occupied.has(`${x},${y}`)) {
            placeModule(moduleId, { x, y }, currentLayerIndex);
            if ('vibrate' in navigator) navigator.vibrate(30);
            return;
          }
        }
      }
    }
    // Fallback: place at 0,0
    placeModule(moduleId, { x: 0, y: 0 }, currentLayerIndex);
  };

  const handleDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData('moduleId', moduleId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const renderModuleTile = (module: ModuleDefinition) => {
    const imgSrc = module.thumbnail;
    const isLibrary = isLibraryModule(module.id);
    // T-class badge (WP-34): registry modules always have one; CSV parts get
    // a best-effort class where a library record with the same id exists.
    const tClass = templateClassOf(module.id);
    return (
      <Card
        key={module.id}
        sx={{
          cursor: 'grab',
          position: 'relative',
          height: { xs: 90, sm: 100, md: 110 },
          transition: 'all 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'manipulation',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 3,
          },
          '&:active': {
            cursor: 'grabbing',
            transform: 'scale(0.98)',
          },
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, module.id)}
        onDoubleClick={() => handleQuickPlace(module.id)}
      >
        <CardContent sx={{ p: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              minHeight: 60,
              borderRadius: 1,
              bgcolor: 'grey.50',
              mb: 1,
            }}
          >
            {opticalGlyphs ? (
              // Schematic palette (WP-23): the optical symbol, not the cube —
              // except library parts with a real thumbnail (WP-34).
              // WP-48: an authored symbol outranks the derived glyph (but not
              // a real photographic thumbnail).
              isLibrary && module.thumbnail ? (
                <img
                  src={module.thumbnail}
                  alt={module.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4 }}
                />
              ) : (
                <SymbolOrGlyphThumb
                  symbolUrl={libraryEntryOf(module.id)?.symbolUrl ?? null}
                  category={categoryOf(module.id, module)}
                  name={module.name}
                />
              )
            ) : imgSrc ? (
              <img
                src={imgSrc}
                alt={module.name}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  borderRadius: 4 
                }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  bgcolor: module.color || 'grey.300',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                }}
              >
                {module.footprint.width} × {module.footprint.height}
              </Box>
            )}
            <DragIcon 
              sx={{ 
                position: 'absolute', 
                top: 2, 
                right: 2, 
                fontSize: 16, 
                color: 'grey.400' 
              }} 
            />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 500, 
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0
              }}
            >
              {module.name}
            </Typography>
            
            {libraryEntryOf(module.id)?.unbound && (
              <Tooltip title="an optical primitive with no mechanics yet — place it, then generate a holder (WP-61)">
                <Chip
                  label="UNBOUND"
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.55rem', flexShrink: 0, fontWeight: 700 }}
                />
              </Tooltip>
            )}
            {tClass && (
              <Tooltip
                title={
                  tClass === 'fixed'
                    ? 'T1 — fixed template: the pose comes from the record'
                    : tClass === 'adaptive'
                      ? 'T2 — adaptive template: moves along its declared DOF axes'
                      : 'T3 — generative template: placed freely, the generator wraps it'
                }
              >
                <Chip
                  label={T_CLASS_LABEL[tClass]}
                  size="small"
                  color={tClass === 'fixed' ? 'default' : tClass === 'adaptive' ? 'success' : 'secondary'}
                  sx={{ height: 18, fontSize: '0.6rem', flexShrink: 0, fontWeight: 700 }}
                />
              </Tooltip>
            )}
            <Chip
              label={`${module.footprint.width}×${module.footprint.height}`}
              size="small"
              variant="outlined"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                flexShrink: 0,
              }}
            />
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box data-tour="part-library" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 500, flex: 1 }}>
            Part Library
          </Typography>
        </Box>

        <TextField
          fullWidth
          size="small"
          placeholder="Search parts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        
        <FormControl fullWidth size="small">
          <InputLabel>Group</InputLabel>
          <Select
            value={selectedGroup}
            label="Group"
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            {groups.map(group => (
              <MenuItem key={group} value={group}>
                {group === 'all' ? 'All Groups' : group.charAt(0).toUpperCase() + group.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <Divider sx={{ my: 2 }} />

        {opticalGlyphs && (
          <Button
            variant="outlined"
            onClick={() => { window.location.assign('/configurator/bind'); }}
            fullWidth
            sx={{ mb: 1 }}
          >
            Load STP / GLB… (part binding)
          </Button>
        )}
        {/* WP-58: mount a community fork's parts into this palette. */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<GitHubIcon />}
          onClick={() => setRepoDialogOpen(true)}
          fullWidth
        >
          Add library from GitHub
          {mountedRepos.length > 0 && ` (${mountedRepos.length})`}
        </Button>
        {/* A community repo trying to claim a curated id is surfaced, never
            silently applied — the curated record keeps winning. */}
        {merged.shadowed.length > 0 && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
            {merged.shadowed.length} community part(s) ignored — those ids already exist:{' '}
            {merged.shadowed.slice(0, 3).map(s => `${s.id} (${s.slug})`).join(', ')}
            {merged.shadowed.length > 3 && ' …'}
          </Typography>
        )}
        {mountedRepos.filter(r => r.error).map(r => (
          <Typography key={r.url} variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
            {r.error}
          </Typography>
        ))}
      </Paper>
      <AddCommunityRepoDialog open={repoDialogOpen} onClose={() => setRepoDialogOpen(false)} />
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* WP-44: groups — placeable arrangements (the OPM) */}
        {paletteGroups.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              Groups (optical modules)
            </Typography>
            {paletteGroups.map(group => (
              <Paper
                key={group.groupId}
                variant="outlined"
                sx={{ p: 1, mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {group.name}
                    </Typography>
                    <Chip size="small" label="GROUP" color="secondary"
                      sx={{ height: 16, fontSize: 9, fontWeight: 700 }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary" noWrap display="block">
                    {group.envelopeGrid.join('×')} · {group.members.length} members
                    {group.structure.jointCells.length > 0 &&
                      ` · ${group.structure.jointCells.length} joints`}
                  </Typography>
                </Box>
                <Button size="small" variant="contained"
                  onClick={() => placeGroup(group.groupId)}>
                  place
                </Button>
              </Paper>
            ))}
          </Box>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(100px, 1fr))', sm: 'repeat(auto-fill, minmax(120px, 1fr))', md: 'repeat(auto-fill, minmax(130px, 1fr))' },
            gap: 1.5,
          }}
        >
          {filteredModules.map(renderModuleTile)}
        </Box>
        
        {filteredModules.length === 0 && (
          <Paper 
            sx={{ 
              p: 3, 
              textAlign: 'center', 
              mt: 2,
              bgcolor: 'grey.50' 
            }}
          >
            <Typography variant="body2" color="textSecondary">
              No parts found matching "{searchTerm}"
            </Typography>
          </Paper>
        )}
      </Box>
      
      {/* Footer */}
      <Paper elevation={1} sx={{ p: 1.5, borderRadius: 0 }}>
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            color: 'text.secondary' 
          }}
        >
          <DragIcon fontSize="small" />
          Drag or double-tap parts to place them
        </Typography>
      </Paper>
    </Box>
  );
};
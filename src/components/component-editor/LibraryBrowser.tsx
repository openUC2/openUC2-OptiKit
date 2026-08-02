/**
 * Library browser: published registry components + browser-local drafts, with
 * category filter chips and a configurable index URL.
 *
 * WP-38: BOTH tabs open records in the editor. The index only carries summary
 * metadata, so clicking a published card fetches the full `component.yml`
 * through the registry's asset endpoint and opens it as an editable copy —
 * "save to workspace" forks it locally, the dev write updates the library.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { GLYPH_COLORS } from '../schematic/colors';
import type { DocCategory } from '../../document';
import { fetchIndexComponent, useLibraryIndex, type IndexComponent } from '../../model/libraryIndex';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { RECORD_CATEGORIES } from '../../model/componentRecord';

/** Where a record was opened from — drives the editing-a-copy banner (WP-38). */
export type RecordOrigin = 'index' | 'workspace';

function CategoryDot({ category }: { category: string }) {
  const color = GLYPH_COLORS[category as DocCategory] ?? '#8899aa';
  return (
    <Box component="span" sx={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      bgcolor: color, mr: 1, flexShrink: 0,
    }} />
  );
}

function ComponentCard({
  id, version, category, description, vendorName, mpn, eflMm, review, thumbnail, onClick, onDelete,
  selected = false,
}: {
  id: string; version: string; category: string; description: string;
  vendorName: string; mpn: string; eflMm: number | null; review: boolean;
  /** WP-100: the row a deep link opened. */
  selected?: boolean;
  /** Data-URL snapshot of the bound geometry (WP-31), when one exists. */
  thumbnail?: string | null;
  onClick?: () => void; onDelete?: () => void;
}) {
  return (
    <ListItemButton selected={selected} onClick={onClick} sx={{ alignItems: 'flex-start', borderRadius: 1 }}>
      {thumbnail && (
        <Box
          component="img" src={thumbnail} alt=""
          sx={{ width: 44, height: 44, borderRadius: 1, mr: 1, mt: 0.5, objectFit: 'cover',
                border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
        />
      )}
      <ListItemText
        primary={
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            <CategoryDot category={category} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{id}</Typography>
            <Typography variant="caption" color="text.secondary">@{version}</Typography>
          </Stack>
        }
        secondary={
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }} component="span">
            {vendorName && (
              <Chip size="small" label={mpn ? `${vendorName} · ${mpn}` : vendorName} component="span"
                sx={{ height: 18, fontSize: 11 }} />
            )}
            {eflMm !== null && (
              <Chip size="small" variant="outlined" label={`EFL ${eflMm.toFixed(1)} mm`} component="span"
                sx={{ height: 18, fontSize: 11 }} />
            )}
            {review && (
              <Chip size="small" color="warning" label="review" component="span" sx={{ height: 18, fontSize: 11 }} />
            )}
            {description && (
              <Typography variant="caption" color="text.secondary" component="span" sx={{ width: '100%' }}>
                {description}
              </Typography>
            )}
          </Stack>
        }
        secondaryTypographyProps={{ component: 'div' }}
      />
      {onDelete && (
        <IconButton size="small" onClick={e => { e.stopPropagation(); onDelete(); }}>
          <DeleteIcon fontSize="inherit" />
        </IconButton>
      )}
    </ListItemButton>
  );
}

export function LibraryBrowser({
  onOpenRecord,
  showTab = null,
  highlightId = null,
}: {
  onOpenRecord: (record: ComponentRecord, origin: RecordOrigin) => void;
  /** WP-100: follow a deep link to the tab that actually holds the record. */
  showTab?: 'index' | 'workspace' | null;
  /** WP-100: the row the deep link opened, marked as selected. */
  highlightId?: string | null;
}) {
  const [tab, setTab] = useState<'index' | 'workspace'>('index');
  useEffect(() => {
    if (showTab) setTab(showTab);
  }, [showTab]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const index = useLibraryIndex();
  const workspace = useWorkspaceLibrary();
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  /** WP-38: the index card carries metadata only — fetch the full record
   * through the registry's asset endpoint, then open it as an editable copy. */
  const openIndexRecord = async (id: string) => {
    setOpenError(null);
    try {
      // WP-100: one shared fetch — this used to be a second, character-
      // identical copy of the deep link's, with divergent error handling.
      onOpenRecord(await fetchIndexComponent(id, index.url), 'index');
    } catch (err) {
      setOpenError(`could not fetch ${id}: ${String(err)}`);
    }
  };

  const indexComponents = useMemo(
    () => index.components.filter(c => !categoryFilter || c.category === categoryFilter),
    [index.components, categoryFilter],
  );
  const workspaceRecords = useMemo(
    () =>
      Object.values(workspace.records).filter(
        r => !categoryFilter || (r as { category?: string }).category === categoryFilter,
      ),
    [workspace.records, categoryFilter],
  );

  const categories = RECORD_CATEGORIES.filter(c =>
    tab === 'index'
      ? index.components.some(x => x.category === c)
      : workspaceRecords.length === 0 || Object.values(workspace.records).some(
          r => (r as { category?: string }).category === c),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 38 }}>
        <Tab
          value="index"
          label={`library · published (${index.components.length})`}
          sx={{ minHeight: 38, fontSize: 12 }}
        />
        <Tab
          value="workspace"
          label={`drafts · this browser (${Object.keys(workspace.records).length})`}
          sx={{ minHeight: 38, fontSize: 12 }}
        />
      </Tabs>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 0.5 }}>
        {tab === 'index'
          ? 'records published in the shared optikit-core library (the registry) — click to edit a copy'
          : 'your local drafts, stored in this browser — “Save to workspace library” puts records here'}
      </Typography>

      <Stack direction="row" spacing={0.5} sx={{ p: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
        {categories.map(c => (
          <Chip
            key={c} size="small" label={c}
            color={categoryFilter === c ? 'primary' : 'default'}
            onClick={() => setCategoryFilter(f => (f === c ? null : c))}
            sx={{ height: 20, fontSize: 11 }}
          />
        ))}
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
        {tab === 'index' && (
          <>
            {index.error && (
              <Alert severity="warning" sx={{ m: 1 }}>
                index not reachable: {index.error}
              </Alert>
            )}
            {openError && (
              <Alert severity="error" sx={{ m: 1 }} onClose={() => setOpenError(null)}>
                {openError}
              </Alert>
            )}
            <List dense disablePadding>
              {indexComponents.map((c: IndexComponent) => (
                <ComponentCard
                  key={c.id}
                  id={c.id} version={c.version} category={c.category}
                  description={c.description}
                  vendorName={c.vendor?.name ?? ''} mpn={c.vendor?.mpn ?? ''}
                  eflMm={c.efl_mm} review={c.review}
                  selected={c.id === highlightId}
                  onClick={() => void openIndexRecord(c.id)}
                />
              ))}
            </List>
            {!index.loading && !index.error && indexComponents.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
                no components in the index{categoryFilter ? ` for '${categoryFilter}'` : ''}
              </Typography>
            )}
          </>
        )}
        {tab === 'workspace' && (
          <List dense disablePadding>
            {workspaceRecords.map(record => {
              const rec = record as ComponentRecord & { category?: string; description?: string };
              return (
                <ComponentCard
                  key={rec.id}
                  id={rec.id} version={rec.version}
                  category={rec.category ?? 'other'}
                  description={rec.description ?? ''}
                  vendorName={rec.vendor?.name ?? ''} mpn={rec.vendor?.mpn ?? ''}
                  eflMm={rec.effective_focal_length_mm ?? null}
                  review={Boolean(rec.review?.length)}
                  thumbnail={workspace.thumbnails[rec.id] ?? null}
                  selected={rec.id === highlightId}
                  onClick={() => onOpenRecord(record, 'workspace')}
                  onDelete={() => workspace.remove(rec.id)}
                />
              );
            })}
            {workspaceRecords.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
                nothing saved yet — “Save to workspace library” keeps records here (user.*)
              </Typography>
            )}
          </List>
        )}
      </Box>

      <Box sx={{ p: 1, borderTop: theme => `1px solid ${theme.palette.divider}` }}>
        <TextField
          size="small" fullWidth label="library index URL"
          value={urlDraft ?? index.url}
          onChange={e => setUrlDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && urlDraft !== null) {
              index.setUrl(urlDraft);
              setUrlDraft(null);
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="reload index">
                  <IconButton size="small" onClick={() => { index.setUrl(urlDraft ?? index.url); setUrlDraft(null); }}>
                    <RefreshIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Box>
  );
}

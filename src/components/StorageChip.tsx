/**
 * WP-105 — "is my work saved?", answered in the toolbar.
 *
 * The design autosaves on a blind 5-second interval, so before this the only
 * way to know was to reload and find out. The chip shows when the document was
 * last written; clicking it opens the panel that enumerates EVERY store the
 * app keeps, because the honest answer to "where is my work" is "in nine
 * different places with different lifetimes" and the UI should say so rather
 * than imply one.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { CloudDone as SavedIcon } from '@mui/icons-material';
import {
  documentSavedAt,
  subscribeDocumentSaved,
  DOCUMENT_KEY,
} from '../document/persistence';
import { listParts, useDocParts } from '../document';
import { usePathsStore } from '../document/pathsStore';
import { useFibersStore } from '../document/fibersStore';
import { useWorkspaceLibrary } from '../model/workspaceLibrary';
import { useBundleLibrary } from '../model/dsn/bundleImport';
import { useMountedRepos } from '../model/communityRepos';
import { useLibraryIndex } from '../model/libraryIndex';
import { useAppStore } from '../stores/appStore';

function clock(ms: number | null): string {
  if (ms === null) return 'not yet';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface Row {
  what: string;
  where: string;
  count: string;
  /** How long it survives — the column that actually answers the question. */
  life: 'reload' | 'browser' | 'shared' | 'session';
}

const LIFE_LABEL: Record<Row['life'], string> = {
  session: 'lost on reload',
  reload: 'survives reload',
  browser: 'this browser only',
  shared: 'on disk · shared',
};

const LIFE_COLOR: Record<Row['life'], 'default' | 'success' | 'info' | 'warning'> = {
  session: 'warning',
  reload: 'success',
  browser: 'info',
  shared: 'default',
};

export function StorageChip() {
  const savedAt = useSyncExternalStore(subscribeDocumentSaved, documentSavedAt);
  const [open, setOpen] = useState(false);
  // Re-render once a second while the panel is open, so "3 s ago" stays true.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  const parts = useDocParts();
  const paths = usePathsStore(s => s.paths);
  const fibers = useFibersStore(s => s.fibers);
  const drafts = useWorkspaceLibrary(s => s.records);
  const bundle = useBundleLibrary(s => s.entries);
  const repos = useMountedRepos();
  const index = useLibraryIndex();
  const remotePath = useAppStore(s => s.remoteSourcePath);

  const rows: Row[] = [
    {
      what: 'the design (parts, poses, orientations)',
      where: DOCUMENT_KEY,
      count: `${parts.length} part(s)`,
      life: 'reload',
    },
    {
      what: 'beam paths',
      where: 'optikit-doc-paths',
      count: `${Object.keys(paths).length}`,
      life: 'reload',
    },
    { what: 'fibers', where: 'optikit-doc-fibers', count: `${fibers.length}`, life: 'reload' },
    {
      what: 'part records you authored',
      where: 'optikit-workspace-components',
      count: `${Object.keys(drafts).length} draft(s)`,
      life: 'browser',
    },
    {
      what: 'parts an imported .dsn brought',
      where: 'in memory (session)',
      count: `${bundle.length} module(s)`,
      life: 'session',
    },
    {
      what: 'community libraries you mounted',
      where: 'optikit-community-repos',
      count: `${repos.length}`,
      life: 'browser',
    },
    {
      what: 'the published registry',
      where: index.error
        ? 'unreachable — showing the bundled offline snapshot'
        : index.url,
      count: `${index.modules.length} module(s)`,
      life: 'shared',
    },
    {
      what: 'the setup this design came from',
      where: remotePath || 'none — “Publish to Setup Browser” creates one',
      count: remotePath ? '1' : '—',
      life: 'session',
    },
  ];

  const ago = savedAt === null ? null : Math.round((Date.now() - savedAt) / 1000);

  return (
    <>
      <Tooltip
        title={
          savedAt === null
            ? 'the design has not been saved yet — it autosaves every 5 seconds'
            : `design saved at ${clock(savedAt)} · click for everything else the app stores`
        }
      >
        <Chip
          size="small"
          icon={<SavedIcon sx={{ fontSize: 14 }} />}
          label={savedAt === null ? 'not saved' : `saved ${clock(savedAt)}`}
          onClick={() => setOpen(true)}
          sx={{
            height: 22,
            color: 'inherit',
            borderColor: 'rgba(255,255,255,0.35)',
            '& .MuiChip-icon': { color: 'inherit' },
          }}
          variant="outlined"
        />
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Where your work lives</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The design autosaves every 5 seconds and on close —{' '}
            {savedAt === null
              ? 'it has not been written yet.'
              : `last written at ${clock(savedAt)}${ago !== null && ago < 300 ? ` (${ago} s ago)` : ''}.`}{' '}
            Everything else keeps its own lifetime; this is all of them.
          </Typography>
          <Stack spacing={1}>
            {rows.map(row => (
              <Box
                key={row.what}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr auto auto' },
                  gap: 1,
                  alignItems: 'center',
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{row.what}</Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                  >
                    {row.where}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {row.count}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  color={LIFE_COLOR[row.life]}
                  label={LIFE_LABEL[row.life]}
                  sx={{ height: 18, fontSize: 10 }}
                />
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            “lost on reload” is the one to watch: a part that came in with a
            <b> .dsn</b> zip lives only for this session unless you export the design
            again (the zip travels with it) or publish its records to the library.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              // Force a write now, so "saved" is true the moment they look.
              useAppStore.getState().saveStateToStorage();
            }}
            disabled={listParts().length === 0}
          >
            save now
          </Button>
          <Button onClick={() => setOpen(false)}>close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

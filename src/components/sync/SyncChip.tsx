/**
 * The KiCad-style sync chip (WP-17): shows whether the schematic and assembly
 * sides of the document agree, and offers the two explicit sync actions —
 * never automatic, both reviewed.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Apps as CubifyIcon,
  CompareArrows as SyncIcon,
  Publish as BackAnnotateIcon,
} from '@mui/icons-material';
import { getSnapshot, useDocRevision, useSourceDesignStore } from '../../document';
import { backAnnotateSource } from '../../model/dsn/serviceExport';
import { useAssemblyStore } from '../assembly/assemblyStore';
import { syncStatusOf, useSyncStore, type SyncStatus } from './syncStore';

const CHIP_PRESENTATION: Record<
  SyncStatus,
  { label: string; color: 'default' | 'success' | 'warning' | 'error'; hint: string }
> = {
  unbuilt: {
    label: 'assembly: not built',
    color: 'default',
    hint: 'No cubify accepted yet — run "Update assembly from schematic".',
  },
  'in-sync': {
    label: 'in sync',
    color: 'success',
    hint: 'Schematic and assembly agree since the last sync action.',
  },
  'schematic-ahead': {
    label: 'schematic ahead',
    color: 'warning',
    hint: 'Poses or beam paths changed — update the assembly (re-cubify).',
  },
  'assembly-ahead': {
    label: 'assembly ahead',
    color: 'warning',
    hint: 'DOF values changed — back-annotate them into the schematic source.',
  },
  diverged: {
    label: 'diverged',
    color: 'error',
    hint: 'Both sides changed — update the assembly, then back-annotate.',
  },
};

export function SyncChip() {
  const navigate = useNavigate();
  const revision = useDocRevision();
  const stamps = useSyncStore(s => s.stamps);
  const markSynced = useSyncStore(s => s.markSynced);
  const runCubify = useAssemblyStore(s => s.runCubify);
  const hasSource = useSourceDesignStore(s => s.yamlText !== null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [backAnnotateOpen, setBackAnnotateOpen] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  const status = useMemo(() => {
    void revision; // recompute on every document change
    return syncStatusOf(stamps);
  }, [revision, stamps]);
  const view = CHIP_PRESENTATION[status];

  const updateAssembly = () => {
    setMenuAnchor(null);
    navigate('/configurator/assembly');
    void runCubify(); // review dialog opens on the assembly page
  };

  const applyBackAnnotate = () => {
    const written = backAnnotateSource(getSnapshot());
    setApplied(written);
    if (written !== null) markSynced('back-annotate');
  };

  return (
    <>
      <Tooltip title={`${view.hint}${stamps ? ` (last sync: ${stamps.action} @ ${stamps.at})` : ''}`}>
        <Chip
          size="small"
          icon={<SyncIcon />}
          label={view.label}
          color={view.color}
          variant={status === 'in-sync' ? 'filled' : 'outlined'}
          onClick={e => setMenuAnchor(e.currentTarget)}
          sx={{ mx: 1, cursor: 'pointer' }}
        />
      </Tooltip>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={updateAssembly}>
          <ListItemIcon><CubifyIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Update assembly from schematic…"
            secondary="re-cubify; the review lists only changed parts"
          />
        </MenuItem>
        <MenuItem
          disabled={!hasSource}
          onClick={() => {
            setMenuAnchor(null);
            setApplied(null);
            setBackAnnotateOpen(true);
          }}
        >
          <ListItemIcon><BackAnnotateIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Back-annotate to schematic…"
            secondary={hasSource
              ? 'write live DOF values into the source design'
              : 'needs an imported .dsn source'}
          />
        </MenuItem>
      </Menu>

      <Dialog open={backAnnotateOpen} onClose={() => setBackAnnotateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Back-annotate to schematic</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            Writes the document's current DOF values into the retained source
            design's <code>instantiation.dof_values</code> and stamps
            provenance. Poses and paths are not touched. YAML comments in the
            source do not survive this rewrite.
          </Typography>
          {applied !== null && (
            <Alert severity="success" sx={{ mt: 1.5 }}>
              wrote {applied} dof value(s) — source and document agree again
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackAnnotateOpen(false)}>close</Button>
          <Button variant="contained" onClick={applyBackAnnotate} disabled={applied !== null}>
            apply
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * WP-71 step 4 — "save as group record…": an ad-hoc cluster graduates into a
 * reusable OPM.
 *
 * The cluster's member cells are made relative to its own origin and the
 * envelope comes from their bbox (`groupRecordYaml`), so the record describes
 * a SHAPE rather than a location. Two exits, the same pair every other
 * authoring flow offers: the records zip for a library PR, or the dev-write
 * into ../optikit-core/library. Nothing is written until one is chosen.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { saveAs } from 'file-saver';
import { CoreServiceError, saveLibraryRecords } from '../../api/coreClient';
import { groupNameOf, groupRecordYaml, partsOfGroupInstance } from '../../document';
import { bumpLibraryIndex } from '../../model/libraryIndex';
import { zipDsn } from '../../model/dsn/io';
import { useAppStore } from '../../stores/appStore';

export function GroupRecordDialog({
  instanceId,
  open,
  onClose,
}: {
  /** The ad-hoc instance to graduate (null = nothing to save). */
  instanceId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [namespace, setNamespace] = useState('user');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(
    () => (open && instanceId ? partsOfGroupInstance(instanceId) : []),
    [open, instanceId],
  );

  // Seed the name from the ad-hoc label the user already typed at Ctrl+G.
  useEffect(() => {
    if (!open || members.length === 0) return;
    setName(groupNameOf(members[0]));
    setError(null);
  }, [open, members]);

  const draft = useMemo(
    () =>
      open && instanceId
        ? groupRecordYaml(instanceId, { namespace, name, description })
        : null,
    [open, instanceId, namespace, name, description],
  );

  const files = useMemo(
    () => (draft ? { [`groups/${draft.id}/group.yml`]: draft.yaml } : null),
    [draft],
  );

  const download = async () => {
    if (!draft || !files) return;
    const blob = await zipDsn(files, `${draft.id}-record`);
    saveAs(blob, `${draft.id}-record.zip`);
  };

  const devWrite = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const written = await saveLibraryRecords([draft.yaml]);
      bumpLibraryIndex();
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'group record written',
        message: `${draft.id} (${written.written.length} file) — it is a placeable group in the palette now`,
        duration: 6000,
      });
      onClose();
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>save as group record · {members.length} member(s)</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Turns this ad-hoc cluster into a reusable <code>cube_group</code> (an OPM): member
          cells relative to the arrangement's own origin, envelope from their bounding box.
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
          <TextField
            size="small" label="namespace" value={namespace}
            onChange={e => setNamespace(e.target.value)}
            sx={{ width: 120 }}
          />
          <TextField
            size="small" label="name" value={name}
            onChange={e => setName(e.target.value)}
            helperText="lower_snake — the id's last segment"
            sx={{ flex: 1 }}
          />
        </Stack>
        <TextField
          size="small" fullWidth label="description" value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={`${name || 'group'} — ${members.length} module arrangement`}
          sx={{ mb: 1.5 }}
        />

        {draft && draft.unresolved.length > 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            <Typography variant="caption">
              {draft.unresolved.join(', ')} {draft.unresolved.length > 1 ? 'have' : 'has'} no
              cube module to reference — a group is an arrangement OF MODULES, so put those
              parts in a cube first (“put in a cube…”) or leave them out of the group.
            </Typography>
          </Alert>
        )}

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}

        {draft && (
          <>
            <Typography variant="overline" color="text.secondary">
              {`groups/${draft.id}/group.yml`}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1, maxHeight: 280, overflow: 'auto' }}>
              <Typography component="pre" variant="caption"
                sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', m: 0 }}>
                {draft.yaml}
              </Typography>
            </Paper>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>cancel</Button>
        <Button size="small" disabled={!draft} onClick={() => void download()}>
          download record zip
        </Button>
        <Button
          size="small" variant="contained" disabled={!draft || busy}
          onClick={() => void devWrite()}
        >
          write into library
        </Button>
      </DialogActions>
    </Dialog>
  );
}

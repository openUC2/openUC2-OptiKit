/**
 * WP-84 — the Inventor round-trip's RETURN leg: attach the STEP + GLB an ME
 * produced in Inventor back onto the EXISTING template record.
 *
 * Deliberately no merge logic and no fresh ids: the optical model does not
 * change, so this is "here are the mechanics for the part you already
 * assigned". The existing template.yml is fetched from the registry, its
 * `step:`/`glb:` asset fields are pointed at the uploaded files, and both
 * are written back into the SAME `templates/<id>/` directory through the
 * ordinary dev-write exit (`/v1/library/save`) + index bump.
 *
 * Accepts loose .step/.stp/.glb files or one .zip holding them (the shape
 * `batch_iam_to_stp_glb.py` produces on the Inventor machine).
 */

import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { FileUpload as UploadIcon } from '@mui/icons-material';
import { parse, stringify } from 'yaml';
import { CoreServiceError, saveLibraryRecords } from '../../api/coreClient';
import { assetsBaseUrl, bumpLibraryIndex, useLibraryIndex } from '../../model/libraryIndex';
import { unzipDsn } from '../../model/dsn/io';
import { useAppStore } from '../../stores/appStore';

interface Picked {
  step: { name: string; bytes: Uint8Array } | null;
  glb: { name: string; bytes: Uint8Array } | null;
}

/** .zip → the contained STEP/GLB; loose files pass through. */
async function collect(files: File[]): Promise<Picked> {
  const picked: Picked = { step: null, glb: null };
  const take = (name: string, bytes: Uint8Array) => {
    const base = name.split('/').pop() ?? name;
    if (/\.(step|stp)$/i.test(base)) picked.step = { name: base, bytes };
    else if (/\.glb$/i.test(base)) picked.glb = { name: base, bytes };
  };
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      for (const [path, content] of Object.entries(await unzipDsn(bytes.buffer))) {
        if (content instanceof Uint8Array) take(path, content);
      }
    } else {
      take(file.name, bytes);
    }
  }
  return picked;
}

export function AttachInventorDialog({
  templateId,
  open,
  onClose,
}: {
  /** The EXISTING mechanical_template the files attach onto. */
  templateId: string;
  open: boolean;
  onClose: () => void;
}) {
  const index = useLibraryIndex();
  const [picked, setPicked] = useState<Picked>({ step: null, glb: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    try {
      const next = await collect([...list]);
      setPicked(prev => ({ step: next.step ?? prev.step, glb: next.glb ?? prev.glb }));
      if (!next.step && !next.glb) {
        setError('no .step/.stp or .glb found in the selection');
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const attach = async () => {
    setBusy(true);
    setError(null);
    try {
      // The EXISTING record is the target — fetch, point its asset fields at
      // the new files, write back under the same id. Nothing else changes.
      const base = assetsBaseUrl(index.url);
      const url = `${base}/v1/library/assets/templates/${templateId}/template.yml`;
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`template ${templateId} not fetchable (${response.status}) — is the core service running?`);
      }
      const template = parse(await response.text()) as Record<string, unknown>;
      if (template.id !== templateId) {
        throw new Error(`fetched record id ${String(template.id)} ≠ ${templateId} — refusing to attach`);
      }
      const assets: Record<string, Uint8Array> = {};
      if (picked.step) {
        template.step = picked.step.name;
        assets[`templates/${templateId}/${picked.step.name}`] = picked.step.bytes;
      }
      if (picked.glb) {
        template.glb = picked.glb.name;
        assets[`templates/${templateId}/${picked.glb.name}`] = picked.glb.bytes;
      }
      const yaml = stringify(template, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
      const written = await saveLibraryRecords([yaml], assets);
      bumpLibraryIndex();
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'Inventor files attached',
        message: `${templateId}: ${written.written.length} file(s) written — same record, new mechanics`,
        duration: 6000,
      });
      setPicked({ step: null, glb: null });
      onClose();
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>attach Inventor files · {templateId}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          The return leg of “export for Inventor”: the STEP + GLB you produced land back on
          the <b>same</b> record — no new id, the optical model untouched.
        </Typography>
        <Button component="label" size="small" variant="outlined" startIcon={<UploadIcon />}>
          pick STEP / GLB / zip…
          <input
            hidden type="file" multiple accept=".step,.stp,.glb,.zip"
            onChange={e => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </Button>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            size="small"
            label={picked.step ? `STEP: ${picked.step.name}` : 'STEP: —'}
            color={picked.step ? 'success' : 'default'}
            variant="outlined"
          />
          <Chip
            size="small"
            label={picked.glb ? `GLB: ${picked.glb.name}` : 'GLB: —'}
            color={picked.glb ? 'success' : 'default'}
            variant="outlined"
          />
        </Stack>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>cancel</Button>
        <Button
          size="small" variant="contained"
          disabled={busy || (!picked.step && !picked.glb)}
          startIcon={busy ? <CircularProgress size={12} /> : undefined}
          onClick={() => void attach()}
        >
          attach onto {templateId.split('.').pop()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * WP-82 — the import drop-zone: `.zmx` and marker-stamped GLB imports become
 * a UI flow instead of a terminal ritual.
 *
 * Drop (or pick) a file → the service runs the SAME importer the CLI uses
 * but returns the PROPOSED records for review — parsed surfaces, datum
 * frames, honest review flags, the YAML itself — and nothing is written
 * until the user accepts through the ordinary two exits (dev-write into
 * ../optikit-core/library, or the records zip for a PR). A dropped GLB's
 * bytes ship alongside as the template's mesh asset (`glb_asset_path`).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  FileUpload as UploadIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import {
  CoreServiceError,
  importGlb,
  importZmx,
  saveLibraryRecords,
  type ImportGlbResponse,
  type ImportZmxResponse,
} from '../../api/coreClient';
import { bumpLibraryIndex } from '../../model/libraryIndex';
import { zipDsn } from '../../model/dsn/io';
import { useAppStore } from '../../stores/appStore';

type Proposal =
  | { kind: 'zmx'; filename: string; result: ImportZmxResponse }
  | { kind: 'glb'; filename: string; bytes: Uint8Array; result: ImportGlbResponse };

function summarize(proposal: Proposal): { id: string; facts: string[] } {
  if (proposal.kind === 'zmx') {
    const component = proposal.result.component as {
      id?: string;
      optics?: { fragment?: { surfaces?: unknown[] }; ports?: Record<string, unknown> };
    };
    return {
      id: String(component.id ?? '?'),
      facts: [
        `${component.optics?.fragment?.surfaces?.length ?? 0} surface(s)`,
        `${Object.keys(component.optics?.ports ?? {}).length} port(s)`,
        proposal.result.efl_mm != null ? `EFL ${proposal.result.efl_mm.toFixed(2)} mm` : 'no EFL',
        proposal.result.mpn ? `MPN ${proposal.result.mpn}` : '',
      ].filter(Boolean),
    };
  }
  const component = proposal.result.component as {
    id?: string;
    optics?: { frames?: Record<string, unknown>; ports?: Record<string, unknown> };
  };
  const template = proposal.result.template as { id?: string; class?: string };
  return {
    id: String(proposal.result.module.id ?? '?'),
    facts: [
      `component ${String(component.id ?? '?')}`,
      `template ${String(template.id ?? '?')} (${String(template.class ?? '?')})`,
      `${Object.keys(component.optics?.frames ?? {}).length} datum frame(s)`,
      `${Object.keys(component.optics?.ports ?? {}).length} port(s)`,
      `envelope ${proposal.result.envelope_mm.map(v => v.toFixed(0)).join('×')} mm`,
    ],
  };
}

export function ImportVendorDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mpn, setMpn] = useState('');

  const reset = () => {
    setProposal(null);
    setError(null);
  };

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (/\.zmx$/i.test(file.name)) {
        const result = await importZmx(file.name, bytes, { mpn: mpn.trim() || undefined });
        setProposal({ kind: 'zmx', filename: file.name, result });
      } else if (/\.glb$/i.test(file.name)) {
        const result = await importGlb(file.name, bytes);
        setProposal({ kind: 'glb', filename: file.name, bytes, result });
      } else {
        setError(`unsupported file: ${file.name} — drop a .zmx or a marker-stamped .glb`);
      }
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  }, [mpn]);

  /** records + binary assets for either accept exit. */
  const files = useMemo((): Record<string, string | Uint8Array> | null => {
    if (!proposal) return null;
    const out: Record<string, string | Uint8Array> = { ...proposal.result.records };
    if (proposal.kind === 'glb') {
      out[proposal.result.glb_asset_path] = proposal.bytes;
    }
    return out;
  }, [proposal]);

  const acceptDevWrite = async () => {
    if (!files) return;
    setBusy(true);
    setError(null);
    try {
      const records: string[] = [];
      const assets: Record<string, Uint8Array> = {};
      for (const [path, content] of Object.entries(files)) {
        if (typeof content === 'string' && path.endsWith('.yml')) records.push(content);
        else if (typeof content === 'string') assets[path] = new TextEncoder().encode(content);
        else assets[path] = content;
      }
      const written = await saveLibraryRecords(records, assets);
      bumpLibraryIndex();
      useAppStore.getState().addNotification({
        type: 'success',
        title: 'imported into the library',
        message: `${written.written.length} file(s) written — the part is in the palette (review-marked)`,
        duration: 6000,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const acceptDownload = async () => {
    if (!files || !proposal) return;
    const stem = summarize(proposal).id.replace(/[^a-z0-9_.-]/gi, '_');
    const blob = await zipDsn(files, `${stem}-records`);
    saveAs(blob, `${stem}-records.zip`);
  };

  const summary = proposal ? summarize(proposal) : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>import a vendor file · .zmx / marker-stamped .glb</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          The same importers the CLI runs (<code>import zmx</code> · <code>import glb</code>),
          but with a REVIEW step: nothing is written until you accept.
        </Typography>

        {/* the drop-zone */}
        <Box
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void onFile(file);
          }}
          sx={{
            p: 2.5, mb: 1.5, textAlign: 'center',
            border: '2px dashed', borderRadius: 1,
            borderColor: dragOver ? 'primary.main' : 'divider',
            bgcolor: dragOver ? 'action.hover' : 'transparent',
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            drop a <b>.zmx</b> prescription or a marker-stamped <b>.glb</b> here
          </Typography>
          <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center">
            <Button component="label" size="small" variant="outlined"
              startIcon={busy ? <CircularProgress size={12} /> : <UploadIcon />}
              disabled={busy}>
              pick a file…
              <input
                hidden type="file" accept=".zmx,.glb"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = '';
                }}
              />
            </Button>
            <TextField
              size="small" label="MPN (zmx, optional)" value={mpn}
              onChange={e => setMpn(e.target.value)}
              sx={{ width: 180 }}
            />
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}

        {proposal && summary && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" color="primary" label={summary.id} sx={{ fontFamily: 'monospace' }} />
              {summary.facts.map(fact => (
                <Chip key={fact} size="small" variant="outlined" label={fact} />
              ))}
            </Stack>
            {proposal.result.review.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                  {proposal.result.review.length} item(s) the importer wants a human to confirm:
                </Typography>
                {proposal.result.review.map((item, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block' }}>• {item}</Typography>
                ))}
              </Alert>
            )}
            {Object.entries(proposal.result.records)
              .filter(([path]) => path.endsWith('.yml'))
              .map(([path, yaml]) => (
                <Accordion key={path} disableGutters sx={{ bgcolor: 'transparent' }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ p: 0 }}>
                    <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto' }}>
                      <Typography component="pre" variant="caption"
                        sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', m: 0 }}>
                        {yaml}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              ))}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => { reset(); onClose(); }}>cancel</Button>
        <Button size="small" disabled={!proposal || busy} onClick={() => void acceptDownload()}>
          accept · download records zip
        </Button>
        <Button size="small" variant="contained" disabled={!proposal || busy}
          onClick={() => void acceptDevWrite()}>
          accept · write into library
        </Button>
      </DialogActions>
    </Dialog>
  );
}

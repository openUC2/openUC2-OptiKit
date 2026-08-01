/**
 * WP-77 — "generate a holder…" from the COMPONENT EDITOR: the T3 verb where
 * the draft lives, not only where a part is placed. The same `/v1/generate`
 * call and preview/accept shape as the assembly's WP-61 dialog, but the cut
 * body is the DRAFT's own prescription, passed inline as
 * `params.part_prescription` — no placement exists yet, so the cavity is
 * carved at the record's own frame (front vertex at the cube centre).
 *
 * Accept writes the full trio — the draft's component record PLUS the
 * generative template (WITH its generator block and the run's canonical
 * params → regenerating is a cache hit) and the cube module — through the
 * existing two exits (records zip / dev-write + index bump). The draft
 * becomes a real T3 cube module in the palette.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { saveAs } from 'file-saver';
import { PreviewCanvas } from '../common/PreviewCanvas';
import { DecimalField } from '../common/DecimalField';
import {
  CoreServiceError,
  base64ToBytes,
  generateTemplate,
  saveLibraryRecords,
  type GenerateResponse,
} from '../../api/coreClient';
import { zipDsn } from '../../model/dsn/io';
import { holderFiles, holderRecords } from '../../model/holderRecord';
import { bumpLibraryIndex } from '../../model/libraryIndex';
import { recordToYaml, type RecordDraft } from '../../model/componentRecord';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { useAppStore } from '../../stores/appStore';

function HalfPreview({ url, offset }: { url: string; offset: [number, number, number] }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} position={offset} />;
}

interface MetaShape {
  params?: Record<string, unknown>;
  bbox_mm?: { size?: number[] };
  fits_envelope?: boolean;
  derived_from?: string;
}

export function GenerateDraftHolderDialog({
  draft,
  record,
  open,
  onClose,
  partStepPath,
}: {
  draft: RecordDraft;
  /** The validated draft record (the dialog is unreachable while null). */
  record: ComponentRecord;
  open: boolean;
  onClose: () => void;
  /** WP-67 "package as cube module…": carve the cavity from this housing
   * STEP (a library-root-relative path) instead of the draft prescription.
   * The housing must be written into the library first. */
  partStepPath?: string;
}) {
  const [clearanceMm, setClearanceMm] = useState(0.15);
  const [splitPlane, setSplitPlane] = useState<'xz' | 'yz'>('xz');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const halfUrls = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.artifacts)
      .filter(([name]) => name.endsWith('.glb') && name !== 'model.glb')
      .map(([name, b64]) => ({
        name,
        url: URL.createObjectURL(
          new Blob([base64ToBytes(b64) as BlobPart], { type: 'model/gltf-binary' }),
        ),
      }));
  }, [result]);
  useEffect(
    () => () =>
      halfUrls.forEach(h => {
        URL.revokeObjectURL(h.url);
        // WP-92: drop drei's cached GLTF scene keyed on the dead blob URL.
        useGLTF.clear(h.url);
      }),
    [halfUrls],
  );

  // WP-92: closing the dialog tears the preview (and its WebGL context) down.
  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  const meta = (result?.meta ?? {}) as MetaShape;
  const bbox = meta.bbox_mm?.size;

  const generate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // The draft's own surface stack, inline (JSON turns ∞ radii into null,
      // which the service reads as plano — the record spelling). The service
      // then never needs the record in its library: only the id travels, for
      // the synthesized template's slug. WP-67: a housing part cuts around
      // its housing STEP instead — exactly one of the two travels.
      const fragment = (record.optics as {
        fragment?: { surfaces?: Record<string, unknown>[] };
      } | undefined)?.fragment;
      setResult(
        await generateTemplate({
          componentId: record.id,
          params: {
            clearance_mm: clearanceMm,
            split_plane: splitPlane,
            ...(partStepPath
              ? { part_step: partStepPath }
              : { part_prescription: { surfaces: fragment?.surfaces ?? [] } }),
          },
        }),
      );
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Component + template + module of the accepted run (canonical params). */
  const materialized = () => {
    if (!result) return null;
    const records = holderRecords({
      componentId: record.id,
      componentVersion: record.version,
      ports: draft.ports.map(p => ({ name: p.name, direction: p.direction })),
      generator: result.generator,
      params: meta.params ?? {},
      derivedFromPrescription: !partStepPath,
      assets: {
        step: 'model.step' in result.artifacts,
        glb: 'model.glb' in result.artifacts,
      },
    });
    const files = holderFiles(records, {
      step: result.artifacts['model.step'] ? base64ToBytes(result.artifacts['model.step']) : null,
      glb: result.artifacts['model.glb'] ? base64ToBytes(result.artifacts['model.glb']) : null,
    });
    // The DRAFT is the component half — the module cannot resolve without it.
    files[`components/${record.id}/component.yml`] = recordToYaml(record);
    return { records, files };
  };

  const finish = (note: string) => {
    useAppStore.getState().addNotification({
      type: 'success',
      title: 'the draft is now a cube module',
      message: note,
      duration: 6000,
    });
    onClose();
  };

  const acceptDevWrite = async () => {
    const m = materialized();
    if (!m) return;
    setBusy(true);
    setError(null);
    try {
      const records: string[] = [];
      const assets: Record<string, Uint8Array> = {};
      for (const [path, content] of Object.entries(m.files)) {
        if (typeof content === 'string') records.push(content);
        else assets[path] = content;
      }
      const written = await saveLibraryRecords(records, assets);
      bumpLibraryIndex();
      finish(
        `${m.records.moduleId} written (${written.written.length} file(s)) — place it from the palette`,
      );
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const acceptDownload = async () => {
    const m = materialized();
    if (!m) return;
    const blob = await zipDsn(m.files, `${m.records.moduleId}-records`);
    saveAs(blob, `${m.records.moduleId}-records.zip`);
    finish(`${m.records.moduleId} records downloaded as a zip`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>generate a holder · {record.id}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {partStepPath
            ? `Prints a two-half 1×1 cube insert whose cavity is boolean-carved around the
               housing STEP (${partStepPath.split('/').pop()}) — the WP-67 "package as cube
               module" road. Accept writes template + module.`
            : `Prints a two-half 1×1 cube insert whose cavity is boolean-carved from this
               draft's own prescription (${draft.surfaces.length} surface(s)) at the record
               frame — no placement needed. Accept writes component + template + module.`}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mb: 1.5 }}>
          <DecimalField
            size="small" label="clearance (mm)" value={clearanceMm}
            onValue={v => v !== null && setClearanceMm(v)}
            sx={{ width: 140 }}
          />
          <TextField
            size="small" select label="split plane" value={splitPlane}
            onChange={e => setSplitPlane(e.target.value as 'xz' | 'yz')}
            sx={{ width: 140 }}
          >
            <MenuItem value="xz">xz (halves meet in y)</MenuItem>
            <MenuItem value="yz">yz (halves meet in x)</MenuItem>
          </TextField>
          <Button
            variant="contained" size="small" onClick={() => void generate()}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={12} /> : undefined}
          >
            generate
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
          </Alert>
        )}

        {result && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={`key ${result.key}`} sx={{ fontFamily: 'monospace' }} />
              <Chip
                size="small"
                label={result.regenerated ? 'regenerated' : 'cache hit'}
                color={result.regenerated ? 'default' : 'success'}
              />
              {bbox && (
                <Chip size="small" label={`bbox ${bbox.map(v => v.toFixed(1)).join(' × ')} mm`} />
              )}
              <Chip
                size="small"
                label={meta.fits_envelope ? 'fits the 50 mm envelope' : 'EXCEEDS the envelope'}
                color={meta.fits_envelope ? 'success' : 'error'}
              />
              {!partStepPath && (
                <Chip
                  size="small" color="warning" variant="outlined"
                  label="cavity derived from the prescription — verify before printing"
                />
              )}
            </Stack>
            <div style={{ height: 220, borderRadius: 4, overflow: 'hidden' }}>
              <PreviewCanvas camera={{ position: [70, 55, 70], fov: 40 }}>
                <ambientLight intensity={0.8} />
                <directionalLight position={[80, 120, 60]} intensity={1.1} />
                <OrbitControls enableDamping />
                {halfUrls.map((h, i) => (
                  <HalfPreview
                    key={h.url}
                    url={h.url}
                    offset={
                      splitPlane === 'xz'
                        ? [0, 0, i === 0 ? 6 : -6]
                        : [i === 0 ? 6 : -6, 0, 0]
                    }
                  />
                ))}
              </PreviewCanvas>
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>cancel</Button>
        <Button size="small" disabled={!result || busy} onClick={() => void acceptDownload()}>
          accept · download records
        </Button>
        <Button
          size="small" variant="contained" disabled={!result || busy}
          onClick={() => void acceptDevWrite()}
        >
          accept · write into library
        </Button>
      </DialogActions>
    </Dialog>
  );
}

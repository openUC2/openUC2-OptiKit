/**
 * WP-61 — "generate a holder…": the missing verb. A freely placed UNBOUND
 * optical primitive becomes a real T3 cube module:
 *
 *   1. POST /v1/generate with the component id + clearance/split-plane and
 *      the live design files — the service folds the PLACED intra-cube δ/ΔR
 *      into the generator params, so the cavity is carved where the optic
 *      actually sits, not at the cube centre.
 *   2. Preview the two printable halves (GLB), the bbox and the envelope
 *      verdict before committing to anything.
 *   3. Accept MATERIALIZES the binding: a generative mechanical_template
 *      (generator + the run's canonical params → regenerating is a cache
 *      hit) and a cube_module, through the existing two exits (download the
 *      records zip / dev-write into ../optikit-core/library + index bump),
 *      then re-points the placed part at the new module — ONE undo step.
 *      Undo restores the unbound placement; the artifacts stay on disk.
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
import { serviceFiles, buildServiceDesign } from '../../model/dsn/serviceExport';
import { zipDsn } from '../../model/dsn/io';
import { holderFiles, holderRecords } from '../../model/holderRecord';
import { bumpLibraryIndex, useLibraryIndex } from '../../model/libraryIndex';
import {
  captureUndo,
  commitUndo,
  libraryEntryOf,
  repointPartLibraryRef,
  type DocPart,
} from '../../document';
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

export function GenerateHolderDialog({
  part,
  open,
  onClose,
}: {
  part: DocPart;
  open: boolean;
  onClose: () => void;
}) {
  const index = useLibraryIndex();
  const [clearanceMm, setClearanceMm] = useState(0.15);
  const [splitPlane, setSplitPlane] = useState<'xz' | 'yz'>('xz');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  // Blob URLs for the per-half GLB previews; revoked on change/unmount.
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
        // WP-92: drop drei's cached GLTF scene too — the cache is keyed on
        // the (now dead) blob URL, so without this every generate leaks two
        // parsed scenes for the rest of the session.
        useGLTF.clear(h.url);
      }),
    [halfUrls],
  );

  // WP-92: closing the dialog tears the preview down completely — the result
  // (and with it the preview <Canvas> + its WebGL context) must not survive
  // into the next open.
  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
    }
  }, [open]);

  const meta = (result?.meta ?? {}) as MetaShape;
  const bbox = meta.bbox_mm?.size;
  const fromPrescription = meta.derived_from === 'prescription';

  const generate = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { keyByPartId } = buildServiceDesign();
      setResult(
        await generateTemplate({
          componentId: part.libraryRef,
          params: { clearance_mm: clearanceMm, split_plane: splitPlane },
          files: serviceFiles(),
          component: keyByPartId[part.id],
        }),
      );
    } catch (err) {
      setError(err instanceof CoreServiceError ? `${err.code}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** The records + assets of the accepted run (canonical params from meta). */
  const materialized = () => {
    if (!result) return null;
    const indexComponent = index.components.find(c => c.id === part.libraryRef);
    const ports =
      libraryEntryOf(part.libraryRef)?.ports ??
      (indexComponent?.ports ?? []).map(p => ({ name: p.name, direction: p.direction }));
    const records = holderRecords({
      componentId: part.libraryRef,
      componentVersion: indexComponent?.version ?? null,
      ports,
      generator: result.generator,
      params: meta.params ?? {},
      derivedFromPrescription: fromPrescription,
      assets: {
        step: 'model.step' in result.artifacts,
        glb: 'model.glb' in result.artifacts,
      },
    });
    const files = holderFiles(records, {
      step: result.artifacts['model.step'] ? base64ToBytes(result.artifacts['model.step']) : null,
      glb: result.artifacts['model.glb'] ? base64ToBytes(result.artifacts['model.glb']) : null,
    });
    return { records, files };
  };

  /** Re-point the part at the new module as ONE undo step, then close. */
  const bindAndClose = (moduleId: string, note: string) => {
    const token = captureUndo();
    repointPartLibraryRef(part.id, moduleId);
    commitUndo(token);
    useAppStore.getState().addNotification({
      type: 'success',
      title: 'part is now a cube',
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
      bindAndClose(
        m.records.moduleId,
        `${m.records.moduleId} written (${written.written.length} file(s)) — cubify claims its cell now`,
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
    bindAndClose(m.records.moduleId, `${m.records.moduleId} bound — records downloaded as a zip`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        generate a holder · {part.libraryRef}
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Prints a two-half 1×1 cube insert whose cavity is boolean-carved around this optic
          at its PLACED pose (offset {part.gridPose.offsetMm.map(v => v.toFixed(2)).join(', ')} mm
          in its cell).
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
              {fromPrescription && (
                <Chip
                  size="small" color="warning" variant="outlined"
                  label="cavity derived from the prescription — verify before printing"
                />
              )}
            </Stack>
            {/* The two printable halves, pulled slightly apart. */}
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

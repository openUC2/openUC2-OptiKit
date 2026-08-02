/**
 * WP-110 — the wizard SHELL the three roads share.
 *
 *   - a stepper with named steps and a per-step help paragraph (the
 *     explanation is the point, so it gets room — never a tooltip);
 *   - a persistent right-hand panel showing WHAT YOU WILL GET, using
 *     PartAnatomy (WP-104) with the layers filling in as steps complete —
 *     the anatomy drawing doubles as the progress indicator;
 *   - "open the full editor" on every step — the escape hatch that keeps the
 *     wizard from having to grow every advanced field;
 *   - ONE terminal step with the three destinations spelled out (WP-105's
 *     naming): save to this browser · publish to ../optikit-core/library ·
 *     download the YAML for a pull request.
 *
 * Persistence (WP-110.3): the draft, road, step and bind snapshot go to the
 * wizard store (localStorage `optikit-parts-wizard`); the mesh bytes go to
 * IndexedDB under WIZARD_MESH_KEY. A reload resumes where the user was.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close as CancelIcon,
  Download as DownloadIcon,
  OpenInFull as EditorIcon,
  Publish as PublishIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { docCategoryOfRecord } from '../../../document';
import { CoreServiceError } from '../../../api/coreClient';
import { deleteBindMesh, saveBindMesh } from '../../../model/bindMeshStore';
import { recordToYaml, type RecordDraft } from '../../../model/componentRecord';
import type { ComponentRecord } from '../../../model/dsn/generated/library-component';
import { useLibraryIndex } from '../../../model/libraryIndex';
import { publishRecordFiles } from '../../../model/publishLibrary';
import { useWorkspaceLibrary } from '../../../model/workspaceLibrary';
import { zipDsn } from '../../../model/dsn/io';
import { PartAnatomy } from '../../inspector/PartAnatomy';
import { useBindStore } from '../../bind/bindStore';
import { ROADS } from './roads';
import type { WizardCtx } from './wizardTypes';
import { buildWizardOutput } from './wizardOutput';
import { usePartWizard, WIZARD_MESH_KEY } from './wizardStore';

export function PartWizard({
  draft,
  setDraft,
  record,
  errors,
  onExitToEditor,
  onFinished,
}: {
  draft: RecordDraft;
  setDraft: (draft: RecordDraft) => void;
  record: ComponentRecord | null;
  errors: string[];
  /** Drop the in-progress draft into the existing tabs (the escape hatch). */
  onExitToEditor: () => void;
  /** The wizard session ended (saved or cancelled). */
  onFinished: () => void;
}) {
  const wizard = usePartWizard();
  const bind = useBindStore();
  const index = useLibraryIndex();
  const road = wizard.road ? ROADS[wizard.road] : null;
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ctx: WizardCtx = { draft, setDraft, record, errors };

  // ── persistence (WP-110.3) ────────────────────────────────────────────────
  // The draft mirrors into the persisted store on every change…
  useEffect(() => {
    if (wizard.road) wizard.setDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, wizard.road]);
  // …the bind workbench state (transform, datums, mount flags) on every
  // store change, debounced so gizmo drags do not hammer localStorage…
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useBindStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => usePartWizard.getState().snapshotBind(), 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);
  // …and the mesh BYTES into IndexedDB whenever a mesh is (re)loaded.
  useEffect(() => {
    if (!bind.glbBytes || !bind.meshFile) return;
    void saveBindMesh(WIZARD_MESH_KEY, {
      meshFile: bind.meshFile,
      glb: bind.glbBytes,
      step: bind.stepBytes,
    }).catch(() => undefined);
  }, [bind.glbBytes, bind.stepBytes, bind.meshFile]);

  const output = useMemo(
    () => (road ? buildWizardOutput(road.id, draft, record, bind) : null),
    [road, draft, record, bind],
  );

  if (!road || !output) return null;

  const stepCount = road.steps.length + 1; // + the shared terminal step
  const step = Math.min(wizard.step, stepCount - 1);
  const atTerminal = step === road.steps.length;
  const current = atTerminal ? null : road.steps[step];
  const blocked = current?.blocked?.(ctx, bind) ?? null;
  const anatomy = road.anatomy(ctx, output);

  const finish = (note: string) => {
    setFlash(note);
    void deleteBindMesh(WIZARD_MESH_KEY).catch(() => undefined);
    setTimeout(() => {
      wizard.clear();
      onFinished();
    }, 1200);
  };

  const saveToBrowser = () => {
    if (!record) return;
    useWorkspaceLibrary.getState().save(record);
    finish(`${record.id} saved to this browser's drafts`);
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const written = await publishRecordFiles(output.files, index.url);
      finish(`${written.written.length} file(s) written into ../optikit-core/library`);
    } catch (e) {
      setError(e instanceof CoreServiceError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (output.componentOnly && record) {
      const blob = new Blob([recordToYaml(record)], { type: 'text/yaml;charset=utf-8' });
      saveAs(blob, 'component.yml');
    } else {
      const blob = await zipDsn(output.files, `${draft.namespace}-${draft.name}-records`);
      saveAs(blob, `${draft.namespace}-${draft.name}-records.zip`);
    }
    finish('records downloaded — open a pull request against ../optikit-core/library');
  };

  return (
    <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
      {/* ── the road ─────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {road.title}
          </Typography>
          <Tooltip title="drop this in-progress draft into the optics/mechanics tabs — everything transfers, nothing is lost">
            <Button size="small" startIcon={<EditorIcon />} onClick={onExitToEditor}>
              open the full editor
            </Button>
          </Tooltip>
          <Tooltip title="discard this wizard session (the draft is forgotten)">
            <Button size="small" color="inherit" startIcon={<CancelIcon />}
              onClick={() => { wizard.clear(); onFinished(); }}>
              cancel
            </Button>
          </Tooltip>
        </Stack>

        <Stepper nonLinear activeStep={step} sx={{ mb: 2, flexWrap: 'wrap' }}>
          {road.steps.map((s, i) => (
            <Step key={s.key} completed={i < step}>
              {/* Backward jumps are always allowed; forward only step-by-step
                  through "next" so the blocked sentences are seen. */}
              <StepButton onClick={() => i <= step && wizard.setStep(i)}>
                {s.label}
              </StepButton>
            </Step>
          ))}
          <Step key="finish" completed={false}>
            <StepButton onClick={() => undefined}>save &amp; publish</StepButton>
          </Step>
        </Stepper>

        {current && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
              {current.help}
            </Typography>
            <current.Body ctx={ctx} />
          </>
        )}

        {atTerminal && (
          <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
            <Typography variant="body2" color="text.secondary">
              {road.resultNote(ctx, output)}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="overline" color="text.secondary">
                this writes
              </Typography>
              {output.ids.map(id => (
                <Typography key={id} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                  • {id}
                </Typography>
              ))}
              {output.ids.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  nothing yet — the record is incomplete
                </Typography>
              )}
            </Paper>
            {output.errors.map((e, i) => (
              <Alert key={i} severity="error">
                <Typography variant="caption">{e}</Typography>
              </Alert>
            ))}
            {output.warnings.map((w, i) => (
              <Alert key={i} severity="warning">
                <Typography variant="caption">{w}</Typography>
              </Alert>
            ))}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{error}</Typography>
              </Alert>
            )}
            {flash && <Alert severity="success">{flash}</Alert>}
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Tooltip title="keeps the component record in this browser's drafts tab — private, reversible, no service needed">
                <span>
                  <Button
                    variant="outlined" startIcon={<SaveIcon />}
                    disabled={!record || busy}
                    onClick={saveToBrowser}
                  >
                    save to this browser
                  </Button>
                </span>
              </Tooltip>
              {!index.error && (
                <Tooltip title="writes every record above (and the mesh assets) into the shared library on disk — the palette picks it up immediately">
                  <span>
                    <Button
                      variant="contained" color="secondary" startIcon={<PublishIcon />}
                      disabled={output.ids.length === 0 || output.errors.length > 0 || busy}
                      onClick={() => void publish()}
                    >
                      publish to ../optikit-core/library
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Tooltip title="a zip in the library's own layout — attach it to a pull request">
                <span>
                  <Button
                    variant="outlined" startIcon={<DownloadIcon />}
                    disabled={output.ids.length === 0 || output.errors.length > 0 || busy}
                    onClick={() => void download()}
                  >
                    download the YAML for a pull request
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
        )}

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button disabled={step === 0} onClick={() => wizard.setStep(step - 1)}>
            back
          </Button>
          {!atTerminal && (
            <Tooltip title={blocked ?? ''}>
              <span>
                <Button
                  variant="contained"
                  disabled={blocked !== null}
                  onClick={() => wizard.setStep(step + 1)}
                >
                  next
                </Button>
              </span>
            </Tooltip>
          )}
          {/* The refusal is a sentence, not a greyed button alone. */}
          {blocked && (
            <Typography variant="caption" color="warning.main" sx={{ maxWidth: 520 }}>
              {blocked}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* ── what you will get (WP-104's anatomy as the progress bar) ─────── */}
      <Paper variant="outlined" sx={{ width: 260, flexShrink: 0, p: 1.5, position: 'sticky', top: 0 }}>
        <Typography variant="overline" color="text.secondary">
          what you will get
        </Typography>
        <PartAnatomy
          category={docCategoryOfRecord(draft.category)}
          mount={anatomy.mount}
          templateClass={anatomy.templateClass}
          componentId={record ? record.id : null}
          templateId={anatomy.templateId}
          moduleId={anatomy.moduleId}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          The three layers are the record trio — the optic (component), what holds it
          (template), and the cube binding that reaches the grid (module). Greyed layers fill
          in as you complete the steps.
        </Typography>
      </Paper>
    </Box>
  );
}

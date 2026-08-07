/**
 * Component editor page — WP-14, unified in WP-33.
 *
 * ONE authoring flow for a part's two halves, as tabs over a shared record
 * identity (the RecordDraft):
 *   - "optics" — the SYMBOL: verbatim Optiland fragment + datum frames +
 *     ports + vendor provenance (the original WP-14 form);
 *   - "mechanics" — the FOOTPRINT: the former /configurator/bind workbench
 *     (upload STP → place vs ghost cube → datums → template class), emitting
 *     template + module records that reference THIS draft's component.
 * /configurator/bind deep-links here with the mechanics tab active.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  FileUpload as ImportIcon,
  NoteAdd as NewIcon,
  Publish as PublishIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import {
  defaultDraft,
  derivedPortWarnings,
  changedRecordKeys,
  draftFromRecord,
  draftToRecord,
  foldDegOfDraft,
  mergeIntoRecord,
  recordId,
  recordToYaml,
  validateDraft,
  type RecordDraft,
} from '../../model/componentRecord';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import { boundRecordsFor } from '../bind/boundRecords';
import { docCategoryOfRecord } from '../../document';
import type { PartMount, TemplateClass } from '../../document';
import { PartAnatomy } from '../inspector/PartAnatomy';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { loadBindMesh, saveBindMesh } from '../../model/bindMeshStore';
import { parse as parseYaml } from 'yaml';
import {
  assetsBaseUrl,
  bumpLibraryIndex,
  fetchIndexComponent,
  useLibraryIndex,
} from '../../model/libraryIndex';
import { saveLibraryRecords, verifyProposedT1 } from '../../api/coreClient';
import { resolveLocalRecord, resolveRegistryRecord } from '../../model/openRecord';
import { displayNameOf } from '../../model/librarySearch';
import { bundleFiles, useBundleLibrary } from '../../model/dsn/bundleImport';
import { LibraryBrowser, type RecordOrigin } from './LibraryBrowser';
import { RecordForm } from './RecordForm';
import { GlyphPreview } from './GlyphPreview';
import { RaySketch } from './RaySketch';
import { MechanicsPanel, type MeshStatus } from '../bind/MechanicsPanel';
import { useBindStore } from '../bind/bindStore';
import { ImportVendorDialog } from './ImportVendorDialog';
import { ImportOptilandDialog } from '../library/ImportOptilandDialog';
import { NewPartDialog } from './wizard/NewPartDialog';
import { PartWizard } from './wizard/PartWizard';
import { ROADS } from './wizard/roads';
import { usePartWizard, WIZARD_MESH_KEY, type RoadId } from './wizard/wizardStore';

export function ComponentEditorPage({
  initialTab = 'optics',
}: {
  /** 'mechanics' = the /configurator/bind deep link (WP-33). */
  initialTab?: 'optics' | 'mechanics';
}) {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [tab, setTab] = useState<'optics' | 'mechanics' | 'anatomy'>(initialTab);
  const [draft, setDraft] = useState<RecordDraft>(() => {
    // WP-110.3: a persisted wizard session resumes with ITS draft — read at
    // init, because the wizard's own mirror-to-store effect runs before any
    // page effect could and would clobber the persisted draft with this
    // default. A `?open=` deep link wins over the session.
    const w = usePartWizard.getState();
    if (w.road && w.draft && !new URLSearchParams(window.location.search).get('open')) {
      return w.draft;
    }
    return defaultDraft('lens');
  });
  const saveRecord = useWorkspaceLibrary(s => s.save);
  const saveBinding = useWorkspaceLibrary(s => s.saveBinding);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  // WP-38: where the open record came from (drives the editing-a-copy banner)
  // and whether its mesh could be resolved into the mechanics tab.
  const [openedFrom, setOpenedFrom] = useState<
    { origin: RecordOrigin; id: string; version: string } | null
  >(null);
  const [meshStatus, setMeshStatus] = useState<MeshStatus>(null);
  /** WP-118: a VERIFIED published binding opens locked (the user's answer:
   * freeze only certified trios; editing stays one explicit click away). */
  const [bindingLocked, setBindingLocked] = useState(false);
  /** WP-100: why a `?open=` link did not produce the record it named. */
  const [openError, setOpenError] = useState<string | null>(null);
  /** WP-100: which sidebar tab holds the record the deep link opened. */
  const [deepLinkTab, setDeepLinkTab] = useState<'index' | 'workspace' | null>(null);
  /** WP-102: the record AS OPENED — the base a write merges into. */
  const [openedRecord, setOpenedRecord] = useState<ComponentRecord | null>(null);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const index = useLibraryIndex();
  const bindGlb = useBindStore(s => s.glbBytes);
  const bindStep = useBindStore(s => s.stepBytes);
  const bindMeshFile = useBindStore(s => s.meshFile);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  // WP-40: authored port directions cross-checked against the surfaces.
  const directionWarnings = useMemo(() => derivedPortWarnings(draft), [draft]);
  const authored = useMemo(
    () => (errors.length === 0 ? draftToRecord(draft) : null),
    [draft, errors],
  );
  // WP-102: what a WRITE would actually produce. `draftToRecord` authors a
  // record from scratch, so writing it verbatim over the file it was opened
  // from deletes every key this form has no field for (tags, docs, review,
  // mechanics, and anything a newer schema added). Fold it back into the
  // record we opened instead — an edit, not a replacement.
  const record = useMemo(
    () => (authored ? mergeIntoRecord(openedRecord, authored) : null),
    [authored, openedRecord],
  );
  const yaml = useMemo(() => (record ? recordToYaml(record) : ''), [record]);
  /** WP-102: the id was retyped — a write would FORK, not update. */
  const idDrift = Boolean(openedFrom && record && record.id !== openedFrom.id);
  /** WP-102: top-level keys a write into the library would change. */
  const changedKeys = useMemo(
    () => (openedRecord && record ? changedRecordKeys(openedRecord, record) : []),
    [openedRecord, record],
  );

  /**
   * WP-104: which of the three layers this draft actually has. The editor
   * knows its own optics; the housing and the cube come from what the library
   * already binds to this component id (a published module, a WP-67 housing)
   * or from the draft's own `mechanics:` reference.
   */
  const anatomy = useMemo(() => {
    const cid = errors.length === 0 ? recordId(draft) : null;
    const module = cid
      ? index.modules.find(m => (m.component?.ref ?? '').split('@')[0] === cid)
      : undefined;
    const housing = cid ? index.housings.find(h => h.component.id === cid) : undefined;
    const templateId =
      module?.template?.id ?? housing?.id ?? (draft.mechanicsTemplate || null);
    const mount: PartMount = module ? 'cube' : templateId ? 'housed' : 'bare';
    return {
      mount,
      templateId,
      moduleId: module?.id ?? null,
      templateClass: (module?.template?.class ?? housing?.class ?? null) as TemplateClass | null,
    };
  }, [draft, errors, index.modules, index.housings]);

  const download = () => {
    if (!record) return;
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    saveAs(blob, 'component.yml');
  };

  const saveToWorkspace = () => {
    if (!record) return;
    saveRecord(record);
    // WP-127: a draft the user has bound keeps its mechanics. Without this
    // the workspace stored the component alone and the part came back from
    // the palette as a bare primitive — "the part remains unbound".
    const bound = boundRecordsFor(draft, useBindStore.getState(), {
      id: record.id,
      version: record.version,
    });
    saveBinding(
      record.id,
      bound && bound.errors.length === 0 && bound.module
        ? { template: bound.template, module: bound.module }
        : null,
    );
    setSavedFlash(record.id);
    setTimeout(() => setSavedFlash(null), 2500);
  };

  /** WP-102: publish to the shared library — behind an explicit confirm that
   * names what changes, because this overwrites a file other people share. */
  const writeToLibrary = async () => {
    if (!record) return;
    setWriteBusy(true);
    try {
      await saveLibraryRecords([recordToYaml(record)]);
      bumpLibraryIndex();
      setOpenedRecord(record);
      setSavedFlash(`${record.id} → ../optikit-core/library`);
      setTimeout(() => setSavedFlash(null), 3500);
      setConfirmWrite(false);
    } catch (e) {
      setOpenError(
        `write failed: ${e instanceof Error ? e.message : String(e)} — is the core service ` +
          `running from a checkout (POST /v1/library/save)?`,
      );
      setConfirmWrite(false);
    } finally {
      setWriteBusy(false);
    }
  };

  /** WP-38: the mechanics tab follows the record. Priority: a locally bound
   * mesh (IndexedDB, survives reloads) → the registry's published template
   * assets (via the module that references this component) → honest "none". */
  const resolveMesh = async (recordId: string) => {
    setMeshStatus('loading');
    const bind = useBindStore.getState();
    try {
      const local = await loadBindMesh(recordId).catch(() => null);
      if (local) {
        bind.loadMesh(local.meshFile, local.glb, local.step);
        setMeshStatus('loaded');
        return;
      }
      // WP-100: a bundle-imported part is in neither IndexedDB nor the index,
      // but the zip retained its template mesh — use it, or the mechanics tab
      // says "no STP bound" about a part that shipped its own CAD.
      const bundled = useBundleLibrary
        .getState()
        .entries.find(e => e.componentId === recordId);
      if (bundled) {
        const files = bundleFiles();
        const meshPath = Object.keys(files).find(
          p => p.startsWith('library/templates/') && p.endsWith('.glb'),
        );
        const bytes = meshPath ? files[meshPath] : undefined;
        if (bytes instanceof Uint8Array) {
          bind.loadMesh(meshPath!.split('/').pop() ?? 'model.glb', bytes, null);
          setMeshStatus('loaded');
          return;
        }
      }
      const module = index.modules.find(m =>
        m.component?.ref?.startsWith(`${recordId}@`),
      );
      const glbPath = module?.assets?.glb;
      if (glbPath) {
        const base = assetsBaseUrl(index.url);
        const abs = (p: string) => (p.startsWith('http') ? p : `${base}${p}`);
        const glbUrl = abs(glbPath);
        // WP-107: a record that HAS a published mesh but cannot deliver it is
        // a different story from one that has none — report which, and where
        // we looked, instead of "no STP bound to this record yet".
        try {
          const glbRes = await fetch(glbUrl, { cache: 'no-cache' });
          if (!glbRes.ok) throw new Error(`${glbRes.status} ${glbRes.statusText}`);
          const glb = new Uint8Array(await glbRes.arrayBuffer());
          let step: Uint8Array | null = null;
          const stepPath = module?.assets?.step;
          if (stepPath) {
            const stepRes = await fetch(abs(stepPath), { cache: 'no-cache' });
            if (stepRes.ok) step = new Uint8Array(await stepRes.arrayBuffer());
          }
          bind.loadMesh(glbPath.split('/').pop() ?? 'model.glb', glb, step);
          setMeshStatus('loaded');
        } catch (err) {
          bind.clear();
          setMeshStatus({
            kind: 'error',
            reason: err instanceof Error ? err.message : String(err),
            url: glbUrl,
          });
        }
        return;
      }
      bind.clear();
      setMeshStatus('none');
    } catch {
      bind.clear();
      setMeshStatus('none');
    }
  };

  const openRecord = (rec: ComponentRecord, origin: RecordOrigin) => {
    setDraft(draftFromRecord(rec));
    setOpenedFrom({ origin, id: rec.id, version: rec.version });
    // WP-102: hold the record verbatim — a later write merges into THIS, not
    // into whatever the form can reconstruct.
    setOpenedRecord(rec);
    void resolveMesh(rec.id);
    void rehydrateBinding(rec.id);
  };

  /**
   * WP-118: reopening a bound part RESTORES the binding instead of showing
   * an empty workbench — the template's insert-pose comes back into the
   * pose tools, and a trio that passes verify-t1 opens read-only.
   */
  const rehydrateBinding = async (recordId: string) => {
    setBindingLocked(false);
    const moduleEntry = index.modules.find(
      m => (m.component?.ref ?? '').split('@')[0] === recordId,
    );
    const housing = index.housings.find(h => h.component.id === recordId);
    const tplId = moduleEntry?.template?.id ?? housing?.id ?? null;
    if (!tplId) return;
    try {
      const base = assetsBaseUrl(index.url);
      const res = await fetch(`${base}/v1/library/assets/templates/${tplId}/template.yml`, {
        cache: 'no-cache',
      });
      if (!res.ok) return;
      const tpl = parseYaml(await res.text()) as {
        provenance?: string;
        class?: string;
        'insert-pose'?: {
          rotation?: { grid?: { z?: string; x?: string }; 'offset-deg'?: Record<string, number> };
          translation?: { 'offset-mm'?: Record<string, number> };
        };
      };
      const ip = tpl['insert-pose'];
      if (ip) {
        const od = ip.rotation?.['offset-deg'] ?? {};
        const om = ip.translation?.['offset-mm'] ?? {};
        useBindStore.setState({
          insertPose: {
            rot24: {
              z: (ip.rotation?.grid?.z ?? '+z') as '+z',
              x: (ip.rotation?.grid?.x ?? '+x') as '+x',
            },
            offsetDeg: [od.x ?? 0, od.y ?? 0, od.z ?? 0],
            offsetMm: [om.x ?? 0, om.y ?? 0, om.z ?? 0],
          },
        });
      }
      if (tpl.provenance === 'whole-module') {
        useBindStore.setState({ wholeModule: true, housingOnly: false });
      }
      // WP-137: the FILE→cube correction comes back with the pose — without
      // this a re-opened binding rendered the raw file and the correction
      // silently dropped off the next save.
      const meshPose = (tpl as Record<string, unknown>)['mesh-pose'] as
        | { rotation?: { grid?: { z?: string; x?: string } } }
        | undefined;
      const grid = meshPose?.rotation?.grid;
      if (grid?.z || grid?.x) {
        useBindStore.setState({
          meshPoseGrid: [grid.z ?? '+z', grid.x ?? '+x'],
        });
      }
      // Freeze only what verify-t1 CERTIFIES (the round-16 answer) — a
      // failing or unverifiable pair stays editable.
      if (moduleEntry?.id) {
        const v = await verifyProposedT1([], moduleEntry.id);
        setBindingLocked(v.ok);
      }
    } catch {
      setBindingLocked(false);
    }
  };

  /** WP-118: the explicit unlock — bumps the draft's patch version so the
   * edit is a new revision, not a silent overwrite. */
  const unlockBinding = () => {
    setBindingLocked(false);
    const parts = draft.version.split('.').map(Number);
    if (parts.length === 3 && parts.every(n => Number.isFinite(n))) {
      setDraft({ ...draft, version: `${parts[0]}.${parts[1]}.${parts[2] + 1}` });
    }
  };

  // WP-37: deep link — the assembly links an insert to `?open=<componentId>`.
  const [deepLinked, setDeepLinked] = useState(false);
  // WP-82: the vendor-import drop-zone (.zmx / marker-stamped .glb).
  const [importOpen, setImportOpen] = useState(false);
  // WP-87: the Optiland-setup wizard (also reachable from the File menu).
  const [optilandOpen, setOptilandOpen] = useState(false);
  // WP-110: the door ("what do you have?") and the wizard behind it.
  const [doorOpen, setDoorOpen] = useState(false);
  const wizardRoad = usePartWizard(s => s.road);

  /** WP-110: start a road — a fresh draft seeded for it, the bind store set
   * to the road's mount mode, the persisted session begun. */
  const startRoad = (road: RoadId) => {
    const def = ROADS[road];
    const seed = def.seed();
    def.applyBindDefaults();
    usePartWizard.getState().start(road, seed);
    setBindingLocked(false);
    setDraft(seed);
    setOpenedFrom(null);
    setOpenedRecord(null);
    setOpenError(null);
    setMeshStatus(null);
    setDoorOpen(false);
  };

  /** WP-110: the bare-form reset (the old "new" button; the expert escape). */
  const blankForm = () => {
    setBindingLocked(false);
    setDraft(defaultDraft(draft.category));
    setOpenedFrom(null);
    setOpenedRecord(null);
    setOpenError(null);
    setMeshStatus(null);
    useBindStore.getState().clear();
  };

  // WP-110.3: a reload resumes the persisted wizard session — draft, step,
  // bind state, and the mesh bytes from IndexedDB. A `?open=` deep link wins
  // (the user asked for a specific record, not for their wizard).
  const [wizardResumed, setWizardResumed] = useState(false);
  useEffect(() => {
    if (wizardResumed) return;
    setWizardResumed(true);
    const w = usePartWizard.getState();
    if (!w.road) return;
    if (new URLSearchParams(window.location.search).get('open')) return;
    // (the draft itself was restored at state init — see useState above)
    void (async () => {
      const mesh = await loadBindMesh(WIZARD_MESH_KEY).catch(() => null);
      // loadMesh resets datums/transform, so restore the snapshot AFTER it.
      if (mesh) useBindStore.getState().loadMesh(mesh.meshFile, mesh.glb, mesh.step);
      w.restoreBind();
    })();
  }, [wizardResumed]);
  useEffect(() => {
    if (deepLinked) return;
    const id = new URLSearchParams(window.location.search).get('open');
    if (!id) return;

    // WP-100: local first (workspace drafts, then a bundle's retained YAML),
    // registry second. A local hit must claim `deepLinked` immediately — the
    // effect re-fires whenever `index.loading` flips, and every workspace
    // save bumps the index, which would let the registry branch clobber the
    // record we just opened.
    const local = resolveLocalRecord(id, {
      workspaceRecords: useWorkspaceLibrary.getState().records,
      bundleFiles: bundleFiles(),
    });
    if (local) {
      setDeepLinked(true);
      setDeepLinkTab(local.tab);
      openRecord(local.record, local.origin);
      return;
    }
    // Only the registry branch needs the index — defer until it has loaded.
    if (index.loading) return;
    setDeepLinked(true);
    void (async () => {
      const resolved = await resolveRegistryRecord(id, {
        indexComponents: index.components,
        fetchRecord: rid => fetchIndexComponent(rid, index.url),
      });
      if (resolved.record) {
        setDeepLinkTab(resolved.tab);
        openRecord(resolved.record, resolved.origin);
      }
      setOpenError(resolved.warning);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index.loading, index.url, deepLinked]);

  // Persist the bound mesh per record id so drafts survive a reload (WP-38).
  // WP-105: keyed on the DRAFT's id, not on the validated record — a mesh
  // loaded while the optics tab was still incomplete used to be dropped on
  // the floor, which is exactly when someone is most likely to load one.
  useEffect(() => {
    const meshKey = recordId(draft);
    // An id still missing its name slug ("user.lens.") is not a key.
    if (meshKey.endsWith('.') || !bindGlb || !bindMeshFile || meshStatus === 'loading') return;
    void saveBindMesh(meshKey, {
      meshFile: bindMeshFile,
      glb: bindGlb,
      step: bindStep,
    }).catch(() => undefined);
  }, [draft, bindGlb, bindStep, bindMeshFile, meshStatus]);

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 340;

  // Rendered inside the AppShell (WP-24): the shell provides theme + toolbar.
  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Drawer
            variant="persistent" anchor="left" open
            sx={{
              width: sidebarWidth, flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: sidebarWidth, boxSizing: 'border-box', position: 'relative',
                height: '100%', top: 'auto', borderRight: `1px solid ${muiTheme.palette.divider}`,
              },
            }}
          >
            <LibraryBrowser
              onOpenRecord={openRecord}
              showTab={deepLinkTab}
              highlightId={openedFrom?.id ?? null}
              onNewPart={() => setDoorOpen(true)}
            />
          </Drawer>

          {/* center: one identity, two halves (WP-33) — or the WP-110 wizard */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
            {/* WP-110: the door + the importers are reachable from both views. */}
            <NewPartDialog
              open={doorOpen}
              onClose={() => setDoorOpen(false)}
              onPickRoad={startRoad}
              onVendorImport={() => setImportOpen(true)}
              onOptilandImport={() => setOptilandOpen(true)}
              onBlankForm={blankForm}
            />
            {wizardRoad && (
              <PartWizard
                draft={draft}
                setDraft={setDraft}
                record={record}
                errors={errors}
                onExitToEditor={() => {
                  // The draft is shared state — clearing the session simply
                  // hands the same draft to the tabs.
                  usePartWizard.getState().clear();
                  setTab('optics');
                }}
                onFinished={() => setTab('optics')}
              />
            )}
            {!wizardRoad && (
            <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                {/* WP-106: the part's name, with its exact id underneath —
                    the header used to be the raw dotted id alone, which is
                    how "user.lens.@0.1.0" read as a corrupted record rather
                    than as an unnamed new one. */}
                {draft.name ? displayNameOf(recordId(draft)) : 'Parts editor'}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1.5, fontFamily: 'monospace' }}>
                  {draft.name ? `${recordId(draft)} · v${draft.version}` : 'new record — name it on the optics tab'}
                </Typography>
              </Typography>
              {/* WP-110: the door — "what do you have?" — replaces the bare
                  "new" button; the blank form stays reachable inside it. */}
              <Button
                size="small" variant="outlined" startIcon={<NewIcon />}
                onClick={() => setDoorOpen(true)}
              >
                new part…
              </Button>
              {/* WP-82: the CLI importers with a review step. */}
              <Button
                size="small" startIcon={<ImportIcon />}
                onClick={() => setImportOpen(true)}
              >
                import…
              </Button>
              {/* WP-87: a whole Optiland system → free primitives. */}
              <Button
                size="small" startIcon={<ImportIcon />}
                onClick={() => setOptilandOpen(true)}
              >
                import Optiland setup…
              </Button>
            </Stack>
            <ImportVendorDialog open={importOpen} onClose={() => setImportOpen(false)} />
            <ImportOptilandDialog open={optilandOpen} onClose={() => setOptilandOpen(false)} />

            {/* WP-102: publishing overwrites a file the whole library shares.
                Say exactly what changes before doing it. */}
            <Dialog open={confirmWrite} onClose={() => setConfirmWrite(false)} maxWidth="sm" fullWidth>
              <DialogTitle>Write into ../optikit-core/library</DialogTitle>
              <DialogContent>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  This writes <b>{record?.id}</b>@{record?.version} into the shared library on
                  disk. The core service picks it up on the next index fetch — no rebuild, no
                  restart.
                </Typography>
                {idDrift && (
                  <Alert severity="warning" sx={{ mb: 1.5 }}>
                    The id changed since this record was opened: this will CREATE{' '}
                    <b>{record?.id}</b> and leave <b>{openedFrom?.id}</b> untouched. Bump the
                    version instead if you meant to update the original.
                  </Alert>
                )}
                {openedRecord ? (
                  changedKeys.length > 0 ? (
                    <>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        fields that will change:
                      </Typography>
                      {changedKeys.map(k => (
                        <Typography key={k} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                          • {k}
                        </Typography>
                      ))}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Everything else on the record — tags, docs, review notes, the mechanics
                        binding, any key this form has no field for — is preserved. Note that
                        YAML comments are not: the file is rewritten.
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Nothing has changed — writing is a no-op.
                    </Typography>
                  )
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    This id is not in the library yet, so a NEW record file is created.
                  </Typography>
                )}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setConfirmWrite(false)}>cancel</Button>
                <Button
                  variant="contained" color="secondary" disabled={writeBusy}
                  onClick={() => void writeToLibrary()}
                >
                  {writeBusy ? 'writing…' : 'write'}
                </Button>
              </DialogActions>
            </Dialog>

            {/* WP-100: a deep link that could not produce its record says so
                — above the tabs, so it is visible on both halves. Never let a
                blank NEW draft masquerade as the part the user clicked. */}
            {openError && (
              <Alert severity="warning" sx={{ mb: 1.5 }} onClose={() => setOpenError(null)}>
                {openError}
              </Alert>
            )}

            {/* WP-38: published records open as editable copies. */}
            {openedFrom?.origin === 'index' && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                editing a copy of <b>{openedFrom.id}@{openedFrom.version}</b> — “Save to
                workspace library” forks it into your drafts; “Write into
                ../optikit-core/library” updates the published record
              </Alert>
            )}

            {/* WP-67: the two halves of a PART — symbol and housing. */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
              <Tab value="optics" label="optics (symbol)" sx={{ minHeight: 36 }} />
              <Tab value="mechanics" label="mechanics (housing)" sx={{ minHeight: 36 }} />
              {/* WP-104: the whole part, not either half of it. */}
              <Tab value="anatomy" label="anatomy (the whole part)" sx={{ minHeight: 36 }} />
            </Tabs>

            {tab === 'anatomy' && (
              <Stack spacing={2} sx={{ maxWidth: 620, mb: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  A part is three records: the <b>optic</b> (what it does to light), the{' '}
                  <b>housing</b> that holds it, and the <b>cube module</b> that binds the two so
                  it can be placed on the grid. A greyed layer does not exist yet — that is the
                  work still to do on this part.
                </Typography>
                <PartAnatomy
                  category={docCategoryOfRecord(draft.category)}
                  mount={anatomy.mount}
                  templateClass={anatomy.templateClass}
                  componentId={errors.length === 0 ? recordId(draft) : null}
                  templateId={anatomy.templateId}
                  moduleId={anatomy.moduleId}
                />
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  <Button size="small" variant="outlined" onClick={() => setTab('optics')}>
                    edit the optic
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => setTab('mechanics')}>
                    {anatomy.mount === 'bare'
                      ? 'give it a housing…'
                      : 'edit the housing'}
                  </Button>
                </Stack>
                {anatomy.mount !== 'cube' && (
                  <Alert severity="info">
                    {anatomy.mount === 'housed'
                      ? 'This part has its own housing but no cube yet — the mechanics tab can package it as a cube module so it reaches the 50 mm grid.'
                      : 'This part has no mechanics at all. It can be placed and simulated as a bare optic, but it cannot be built until a holder is generated (mechanics tab → generate a holder).'}
                  </Alert>
                )}
              </Stack>
            )}

            {tab === 'optics' && (
              <>
                <RecordForm draft={draft} onChange={setDraft} />

                {errors.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      record incomplete:
                    </Typography>
                    {errors.map((e, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block' }}>• {e}</Typography>
                    ))}
                  </Alert>
                )}
                {directionWarnings.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      direction ↔ surface mismatch (WP-40):
                    </Typography>
                    {directionWarnings.map((w, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block' }}>• {w}</Typography>
                    ))}
                  </Alert>
                )}
                {savedFlash && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    saved {savedFlash}
                  </Alert>
                )}

                <Stack direction="row" spacing={1.5} sx={{ mt: 2.5, mb: 4 }} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="contained" startIcon={<DownloadIcon />} disabled={!record}
                    onClick={download}
                  >
                    Download record YAML
                  </Button>
                  <Button
                    variant="outlined" startIcon={<SaveIcon />} disabled={!record}
                    onClick={saveToWorkspace}
                  >
                    Save to workspace library
                  </Button>
                  {/* WP-102: the action the banner has always named, now that
                      a write is a merge. Hidden when the service is
                      unreachable — an offline/static build cannot publish. */}
                  {!index.error && (
                    <Button
                      variant="outlined" color="secondary" startIcon={<PublishIcon />}
                      disabled={!record}
                      onClick={() => setConfirmWrite(true)}
                    >
                      Write into ../optikit-core/library
                    </Button>
                  )}
                </Stack>
              </>
            )}
            {tab === 'mechanics' && (
              <MechanicsPanel
                draft={draft}
                record={record}
                meshStatus={meshStatus}
                onDraftChange={setDraft}
                locked={
                  bindingLocked
                    ? {
                        reason:
                          'this pair passed verify-t1 — the optical model and the mechanics ' +
                          'agree, so the binding opens read-only. Editing bumps the version.',
                        onUnlock: unlockBinding,
                      }
                    : null
                }
              />
            )}
            </>
            )}
          </Box>

          {/* right: preview — the wizard brings its own progress panel, so
              this column yields its width to the road (WP-110).
              WP-114: UNMOUNTED, not merely `display: none`. A hidden R3F
              canvas keeps a live WebGL context; browsers cap those (~8–16)
              and evict the oldest when the cap is hit, which is how the
              quad-view workbench ended up with dead, blank canvases
              ("THREE.WebGLRenderer: Context Lost"). A panel nobody can see
              must not hold a context. */}
          {!isMobile && !wizardRoad && (
          <Box
            sx={{
              width: 360, flexShrink: 0, overflow: 'auto', p: 2,
              borderLeft: `1px solid ${muiTheme.palette.divider}`,
            }}
          >
            <Typography variant="overline" color="text.secondary">schematic glyph</Typography>
            <GlyphPreview
              category={draft.category === 'electronics' || draft.category === 'mechanics' ? 'other' : draft.category}
              label={draft.name || draft.category}
              foldDeg={foldDegOfDraft(draft)}
            />

            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              ray sketch
            </Typography>
            <RaySketch
              category={draft.category}
              surfaces={draft.surfaces}
              mirrorAngleDeg={draft.mirrorAngleDeg}
            />

            <Accordion disableGutters sx={{ mt: 2, bgcolor: 'transparent' }} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="overline" color="text.secondary">record YAML</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 380, overflow: 'auto' }}>
                  <Typography
                    component="pre"
                    variant="caption"
                    sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', m: 0 }}
                  >
                    {yaml || '— fix the validation issues to see the record —'}
                  </Typography>
                </Paper>
              </AccordionDetails>
            </Accordion>
          </Box>
          )}
    </Box>
  );
}

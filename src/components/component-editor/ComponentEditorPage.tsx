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
  NoteAdd as NewIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import {
  defaultDraft,
  derivedPortWarnings,
  draftFromRecord,
  recordFromYaml,
  draftToRecord,
  recordId,
  recordToYaml,
  validateDraft,
  type RecordDraft,
} from '../../model/componentRecord';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { loadBindMesh, saveBindMesh } from '../../model/bindMeshStore';
import { assetsBaseUrl, useLibraryIndex } from '../../model/libraryIndex';
import { LibraryBrowser, type RecordOrigin } from './LibraryBrowser';
import { RecordForm } from './RecordForm';
import { GlyphPreview } from './GlyphPreview';
import { RaySketch } from './RaySketch';
import { MechanicsPanel, type MeshStatus } from '../bind/MechanicsPanel';
import { useBindStore } from '../bind/bindStore';

export function ComponentEditorPage({
  initialTab = 'optics',
}: {
  /** 'mechanics' = the /configurator/bind deep link (WP-33). */
  initialTab?: 'optics' | 'mechanics';
}) {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [tab, setTab] = useState<'optics' | 'mechanics'>(initialTab);
  const [draft, setDraft] = useState<RecordDraft>(() => defaultDraft('lens'));
  const saveRecord = useWorkspaceLibrary(s => s.save);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  // WP-38: where the open record came from (drives the editing-a-copy banner)
  // and whether its mesh could be resolved into the mechanics tab.
  const [openedFrom, setOpenedFrom] = useState<
    { origin: RecordOrigin; id: string; version: string } | null
  >(null);
  const [meshStatus, setMeshStatus] = useState<MeshStatus>(null);
  const index = useLibraryIndex();
  const bindGlb = useBindStore(s => s.glbBytes);
  const bindStep = useBindStore(s => s.stepBytes);
  const bindMeshFile = useBindStore(s => s.meshFile);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  // WP-40: authored port directions cross-checked against the surfaces.
  const directionWarnings = useMemo(() => derivedPortWarnings(draft), [draft]);
  const record = useMemo(
    () => (errors.length === 0 ? draftToRecord(draft) : null),
    [draft, errors],
  );
  const yaml = useMemo(() => (record ? recordToYaml(record) : ''), [record]);

  const download = () => {
    if (!record) return;
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    saveAs(blob, 'component.yml');
  };

  const saveToWorkspace = () => {
    if (!record) return;
    saveRecord(record);
    setSavedFlash(record.id);
    setTimeout(() => setSavedFlash(null), 2500);
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
      const module = index.modules.find(m =>
        m.component?.ref?.startsWith(`${recordId}@`),
      );
      const glbPath = module?.assets?.glb;
      if (glbPath) {
        const base = assetsBaseUrl(index.url);
        const abs = (p: string) => (p.startsWith('http') ? p : `${base}${p}`);
        const glbRes = await fetch(abs(glbPath), { cache: 'no-cache' });
        if (!glbRes.ok) throw new Error(`${glbRes.status} for ${glbPath}`);
        const glb = new Uint8Array(await glbRes.arrayBuffer());
        let step: Uint8Array | null = null;
        const stepPath = module?.assets?.step;
        if (stepPath) {
          const stepRes = await fetch(abs(stepPath), { cache: 'no-cache' });
          if (stepRes.ok) step = new Uint8Array(await stepRes.arrayBuffer());
        }
        bind.loadMesh(glbPath.split('/').pop() ?? 'model.glb', glb, step);
        setMeshStatus('loaded');
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
    void resolveMesh(rec.id);
  };

  // WP-37: deep link — the assembly links an insert to `?open=<componentId>`.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked) return;
    const id = new URLSearchParams(window.location.search).get('open');
    if (!id || index.loading) return;
    setDeepLinked(true);
    void (async () => {
      try {
        const url = `${assetsBaseUrl(index.url)}/v1/library/assets/components/${id}/component.yml`;
        const response = await fetch(url, { cache: 'no-cache' });
        if (response.ok) openRecord(recordFromYaml(await response.text()), 'index');
      } catch {
        /* stay on the blank draft if the record can't be fetched */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index.loading, deepLinked]);

  // Persist the bound mesh per record id so drafts survive a reload (WP-38).
  useEffect(() => {
    if (!record || !bindGlb || !bindMeshFile || meshStatus === 'loading') return;
    void saveBindMesh(record.id, {
      meshFile: bindMeshFile,
      glb: bindGlb,
      step: bindStep,
    }).catch(() => undefined);
  }, [record, bindGlb, bindStep, bindMeshFile, meshStatus]);

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
            <LibraryBrowser onOpenRecord={openRecord} />
          </Drawer>

          {/* center: one identity, two halves (WP-33) */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                Component editor
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1.5, fontFamily: 'monospace' }}>
                  {recordId(draft)}@{draft.version}
                </Typography>
              </Typography>
              <Button
                size="small" startIcon={<NewIcon />}
                onClick={() => {
                  setDraft(defaultDraft(draft.category));
                  setOpenedFrom(null);
                  setMeshStatus(null);
                  useBindStore.getState().clear();
                }}
              >
                new
              </Button>
            </Stack>

            {/* WP-38: published records open as editable copies. */}
            {openedFrom?.origin === 'index' && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                editing a copy of <b>{openedFrom.id}@{openedFrom.version}</b> — “Save to
                workspace library” forks it into your drafts; “Write into
                ../optikit-core/library” updates the published record
              </Alert>
            )}

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
              <Tab value="optics" label="optics — the symbol" sx={{ minHeight: 36 }} />
              <Tab value="mechanics" label="mechanics — the footprint (STP + datums)" sx={{ minHeight: 36 }} />
            </Tabs>

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
                    saved {savedFlash} to the workspace library
                  </Alert>
                )}

                <Stack direction="row" spacing={1.5} sx={{ mt: 2.5, mb: 4 }}>
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
                </Stack>
              </>
            )}
            {tab === 'mechanics' && (
              <MechanicsPanel draft={draft} record={record} meshStatus={meshStatus} />
            )}
          </Box>

          {/* right: preview */}
          <Box
            sx={{
              width: isMobile ? 0 : 360, flexShrink: 0, overflow: 'auto', p: 2,
              borderLeft: `1px solid ${muiTheme.palette.divider}`,
              display: isMobile ? 'none' : 'block',
            }}
          >
            <Typography variant="overline" color="text.secondary">schematic glyph</Typography>
            <GlyphPreview
              category={draft.category === 'electronics' || draft.category === 'mechanics' ? 'other' : draft.category}
              label={draft.name || draft.category}
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
    </Box>
  );
}

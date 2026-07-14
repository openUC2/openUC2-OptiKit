/**
 * Component ("symbol") editor page — WP-14.
 *
 * Create/edit optical component records: the physics of a part (verbatim
 * Optiland fragment + datum frames + ports + vendor provenance), independent
 * of any mechanical template. Records download as library-PR-ready YAML for
 * ../optikit-core/library/ or persist locally in the workspace library.
 */

import { useMemo, useState } from 'react';
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
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import {
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  NoteAdd as NewIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { saveAs } from 'file-saver';
import { materialThemeDark } from '../../theme/materialTheme';
import { Toolbar } from '../Toolbar';
import {
  defaultDraft,
  draftFromRecord,
  draftToRecord,
  recordId,
  recordToYaml,
  validateDraft,
  type RecordDraft,
} from '../../model/componentRecord';
import { useWorkspaceLibrary } from '../../model/workspaceLibrary';
import type { ComponentRecord } from '../../model/dsn/generated/library-component';
import { LibraryBrowser } from './LibraryBrowser';
import { RecordForm } from './RecordForm';
import { GlyphPreview } from './GlyphPreview';
import { RaySketch } from './RaySketch';

export function ComponentEditorPage() {
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [draft, setDraft] = useState<RecordDraft>(() => defaultDraft('lens'));
  const saveRecord = useWorkspaceLibrary(s => s.save);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const errors = useMemo(() => validateDraft(draft), [draft]);
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

  const openRecord = (rec: ComponentRecord) => setDraft(draftFromRecord(rec));

  const sidebarWidth = isMobile ? Math.min(340, window.innerWidth * 0.85) : 340;

  return (
    <ThemeProvider theme={materialThemeDark}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
        <Toolbar />
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

          {/* center: the form */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                Component editor
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1.5, fontFamily: 'monospace' }}>
                  {recordId(draft)}@{draft.version}
                </Typography>
              </Typography>
              <Button size="small" startIcon={<NewIcon />} onClick={() => setDraft(defaultDraft(draft.category))}>
                new
              </Button>
            </Stack>

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
            <GlyphPreview category={draft.category} label={draft.name || draft.category} />

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
      </Box>
    </ThemeProvider>
  );
}

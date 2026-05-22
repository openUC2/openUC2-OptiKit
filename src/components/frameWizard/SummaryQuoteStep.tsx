import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Button,
  TextField,
  Alert,
  Divider,
  Chip,
} from '@mui/material';
import { Email, Download, Edit } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

interface Props {
  onOpenInEditor: () => void;
}

/**
 * WP8: Final summary step. Renders a configuration overview, the Nyquist
 * result, two free-form text fields, and three actions (mail/quote, JSON
 * download, open in the editor canvas).
 */
export function SummaryQuoteStep({ onOpenInEditor }: Props) {
  const {
    wizardState,
    updateWizardState,
    objectives,
    cameras,
    fluorescenceOptions,
    getTotalPrice,
    getSelectedComponents,
    computeNyquist,
  } = useFrameWizardStore();

  const primaryObj = objectives.find((o) => o.id === wizardState.primaryObjective);
  const secondaryObj = objectives.find((o) => o.id === wizardState.secondaryObjective);
  const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
  const nyquist = computeNyquist();
  const total = getTotalPrice();

  const channelNames = wizardState.fluorescenceChannels
    .map((id) => fluorescenceOptions.find((f) => f.id === id)?.name || id)
    .join(', ');

  const buildPayload = () => ({
    wizardState,
    components: getSelectedComponents(),
    totalPrice: total,
    nyquist,
    generatedAt: new Date().toISOString(),
    schemaVersion: '1.0',
  });

  const onExportJson = () => {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frame-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onRequestQuote = () => {
    const subject = encodeURIComponent('FRAME Microscope Quote Request');
    const bodyLines = [
      'Hello openUC2 team,',
      '',
      'I would like a quote for the FRAME configuration described below.',
      '',
      `Objective changer: ${wizardState.objectiveChanger}`,
      `Primary objective: ${primaryObj?.name || '(none)'}`,
      secondaryObj ? `Secondary objective: ${secondaryObj.name}` : '',
      `Light source: ${wizardState.lightSource}`,
      `Condenser: ${wizardState.condenser}`,
      `Brightfield modes: ${wizardState.brightfieldModes.join(', ')}`,
      `Fluorescence: ${wizardState.hasFluorescence ? 'yes' : 'no'}`,
      wizardState.hasFluorescence
        ? `  Light source: ${wizardState.fluoLightSource} | Dichroic: ${wizardState.dichroic} | Channels: ${channelNames}`
        : '',
      `Camera: ${cam?.name || '(none)'}`,
      `Sample holder: ${wizardState.sampleHolder}${
        wizardState.sampleHolder === 'custom-3d'
          ? ` (notes: ${wizardState.customSampleHolderNotes})`
          : ''
      }`,
      '',
      `Field of application: ${wizardState.fieldOfApplication || '-'}`,
      `Special requirements: ${wizardState.specialRequirements || '-'}`,
      '',
      `Estimated price: $${total.toLocaleString()}`,
    ].filter(Boolean);
    const body = encodeURIComponent(bodyLines.join('\n'));
    window.location.href = `mailto:info@openuc2.com?subject=${subject}&body=${body}`;
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Summary & Quote
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review your configuration, add any extra notes and request a quote, export the
        configuration as JSON or open it in the editor.
      </Typography>

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableBody>
            <TableRow>
              <TableCell><strong>Objective changer</strong></TableCell>
              <TableCell>{wizardState.objectiveChanger}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Primary objective</strong></TableCell>
              <TableCell>{primaryObj?.name || '—'}</TableCell>
            </TableRow>
            {wizardState.objectiveChanger === '2-position' && (
              <TableRow>
                <TableCell><strong>Secondary objective</strong></TableCell>
                <TableCell>{secondaryObj?.name || '—'}</TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell><strong>Illumination</strong></TableCell>
              <TableCell>
                {wizardState.lightSource} · condenser: {wizardState.condenser} · modes:{' '}
                {wizardState.brightfieldModes.join(', ')}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Fluorescence</strong></TableCell>
              <TableCell>
                {wizardState.hasFluorescence
                  ? `${wizardState.fluoLightSource} · ${wizardState.dichroic} · ${channelNames || 'no channels'}`
                  : 'disabled'}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Camera</strong></TableCell>
              <TableCell>{cam?.name || '—'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Sample holder</strong></TableCell>
              <TableCell>
                {wizardState.sampleHolder}
                {wizardState.sampleHolder === 'custom-3d' && wizardState.customSampleHolderNotes && (
                  <Typography variant="caption" display="block" color="text.secondary">
                    Notes: {wizardState.customSampleHolderNotes}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell><strong>Total estimated price</strong></TableCell>
              <TableCell>
                <Chip color="primary" label={`$${total.toLocaleString()}`} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      {nyquist && (
        <Alert severity={nyquist.isSampled ? 'success' : 'warning'} sx={{ mb: 2 }}>
          Nyquist {nyquist.isSampled ? 'satisfied' : 'undersampled'} — effective px{' '}
          {nyquist.effectivePixelSize_um.toFixed(3)} µm vs required{' '}
          {nyquist.nyquistPixelSize_um.toFixed(3)} µm (ratio {nyquist.samplingRatio.toFixed(2)}).
        </Alert>
      )}

      <Divider sx={{ my: 2 }} />

      <TextField
        label="Field of application"
        placeholder="e.g. live-cell imaging of HeLa cells with SiR-DNA"
        fullWidth
        value={wizardState.fieldOfApplication}
        onChange={(e) => updateWizardState({ fieldOfApplication: e.target.value })}
        sx={{ mb: 2 }}
      />
      <TextField
        label="Special requirements / notes for the team"
        multiline
        minRows={3}
        fullWidth
        value={wizardState.specialRequirements}
        onChange={(e) => updateWizardState({ specialRequirements: e.target.value })}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" color="primary" startIcon={<Email />} onClick={onRequestQuote}>
          Request Quote
        </Button>
        <Button variant="outlined" startIcon={<Download />} onClick={onExportJson}>
          Export Configuration (JSON)
        </Button>
        <Button variant="outlined" startIcon={<Edit />} onClick={onOpenInEditor}>
          Open in Editor
        </Button>
      </Box>
    </Box>
  );
}

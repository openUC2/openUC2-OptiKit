import {
  Box,
  Typography,
  TextField,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function CustomizationStep() {
  const {
    wizardState,
    updateWizardState,
    getSelectedComponents,
    getTotalPrice,
    computeNyquist,
    objectives,
    cameras,
    lenses,
    fluorescenceOptions,
  } = useFrameWizardStore();

  const components = getSelectedComponents();
  const totalPrice = getTotalPrice();
  const nyquist = computeNyquist();

  // Build summary rows
  const summaryRows: { label: string; value: string; price: number }[] = [];

  // Frame body
  summaryRows.push({ label: 'FRAME Body', value: 'Included', price: 9999 });

  // Light source
  const lightLabels: Record<string, string> = {
    'single-led': 'Single White LED',
    'led-matrix': 'Programmable LED Matrix',
    'led-ring': 'LED Ring (Köhler)',
  };
  if (wizardState.lightSource !== 'none') {
    const lp: Record<string, number> = { 'single-led': 30, 'led-matrix': 150, 'led-ring': 120 };
    summaryRows.push({
      label: 'Light Source',
      value: lightLabels[wizardState.lightSource] || wizardState.lightSource,
      price: lp[wizardState.lightSource] || 0,
    });
  }

  // Autofocus
  if (wizardState.autofocus !== 'none') {
    summaryRows.push({
      label: 'Autofocus',
      value: wizardState.autofocus === 'laser-astigmatism' ? 'Laser (Astigmatism)' : 'Software (Image Contrast)',
      price: wizardState.autofocus === 'laser-astigmatism' ? 3000 : 0,
    });
  }

  // Objectives
  if (wizardState.primaryObjective) {
    const obj = objectives.find((o) => o.id === wizardState.primaryObjective);
    if (obj) summaryRows.push({ label: 'Primary Objective', value: obj.name, price: obj.price });
  }
  if (wizardState.secondaryObjective) {
    const obj = objectives.find((o) => o.id === wizardState.secondaryObjective);
    if (obj) summaryRows.push({ label: 'Secondary Objective', value: obj.name, price: obj.price });
  }

  // Revolver
  if (wizardState.hasRevolver) {
    summaryRows.push({ label: 'Objective Revolver', value: 'Motorized', price: 1500 });
  }

  // Sample holder
  const holderLabels: Record<string, string> = { '4-slide-insert': '4-Slide Insert', 'wellplate-insert': 'Wellplate Insert' };
  if (wizardState.sampleHolder !== 'none') {
    const sp: Record<string, number> = { '4-slide-insert': 80, 'wellplate-insert': 100 };
    summaryRows.push({ label: 'Sample Holder', value: holderLabels[wizardState.sampleHolder], price: sp[wizardState.sampleHolder] || 0 });
  }

  // Overview camera
  if (wizardState.hasOverviewCamera) {
    summaryRows.push({ label: 'Overview Camera', value: 'USB Camera Module', price: 150 });
  }

  // Fluorescence
  if (wizardState.hasFluorescence) {
    wizardState.fluorescenceChannels.forEach((chId) => {
      const ch = fluorescenceOptions.find((f) => f.id === chId);
      if (ch) summaryRows.push({ label: `Fluorescence: ${ch.dyeName}`, value: ch.name, price: ch.price_filterSet });
    });
  }

  // Camera
  if (wizardState.selectedCamera) {
    const cam = cameras.find((c) => c.id === wizardState.selectedCamera);
    if (cam) summaryRows.push({ label: 'Camera', value: cam.name, price: cam.price });
  }

  // Tube lens
  if (wizardState.selectedTubeLens) {
    const lens = lenses.find((l) => l.id === wizardState.selectedTubeLens);
    if (lens) summaryRows.push({ label: 'Tube Lens', value: lens.name, price: lens.price });
  }

  // Controls
  if (wizardState.controlInputs.includes('ps4-joystick')) {
    summaryRows.push({ label: 'PS4 Joystick', value: 'Wireless controller', price: 40 });
  }
  if (wizardState.controlInputs.includes('can-jog-dial')) {
    summaryRows.push({ label: 'CAN Jog Dial', value: 'Rotary encoder', price: 80 });
  }

  // Electronics
  summaryRows.push({ label: 'Electronics Board (UC2e v3)', value: 'Included', price: 150 });

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        📝 Review & Customization
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review your configuration and add any special requests or notes.
      </Typography>

      {/* Summary table */}
      <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 300 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Component</TableCell>
              <TableCell>Selection</TableCell>
              <TableCell align="right">Price</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summaryRows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{row.label}</Typography>
                </TableCell>
                <TableCell>{row.value}</TableCell>
                <TableCell align="right">${row.price.toLocaleString()}</TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell colSpan={2}>
                <Typography variant="subtitle1" fontWeight="bold">TOTAL</Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="subtitle1" fontWeight="bold" color="primary">
                  ${totalPrice.toLocaleString()}
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* Nyquist summary */}
      {nyquist && (
        <Alert severity={nyquist.isSampled ? 'success' : 'warning'} sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight="bold">
            Nyquist Sampling: {nyquist.isSampled ? 'Satisfied' : 'Undersampled'}
          </Typography>
          <Typography variant="caption">
            Resolution: {nyquist.resolution_um.toFixed(2)} µm | Effective pixel: {nyquist.effectivePixelSize_um.toFixed(2)} µm | Sampling: {nyquist.samplingRatio.toFixed(2)}×
          </Typography>
        </Alert>
      )}

      {/* Component count */}
      <Box sx={{ mb: 2 }}>
        <Chip label={`${components.length} modules on grid`} variant="outlined" />
      </Box>

      {/* Custom notes */}
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
        Special Requests / Notes
      </Typography>
      <TextField
        multiline
        rows={4}
        fullWidth
        placeholder="Add any custom requests, questions, or notes about your configuration..."
        value={wizardState.customNotes}
        onChange={(e) => updateWizardState({ customNotes: e.target.value })}
        sx={{ mb: 2 }}
      />

      <Alert severity="info">
        Click <strong>"Open in Editor"</strong> below to load this configuration into the visual canvas editor
        where you can fine-tune positions and generate a quote.
      </Alert>
    </Box>
  );
}

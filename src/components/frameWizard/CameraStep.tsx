import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import { CameraAlt, Bolt } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

/**
 * WP5: Camera selection. Shows the three curated cameras with recommendation
 * chips, highlights the Tucsen Libra16 for fluorescence, and renders a live
 * Nyquist indicator based on the currently selected primary objective.
 */
export function CameraStep() {
  const { wizardState, updateWizardState, cameras, computeNyquist } = useFrameWizardStore();
  const nyquist = computeNyquist();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CameraAlt color="primary" />
        <Typography variant="h5" fontWeight="bold">Camera</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose one of the three recommended cameras. The live Nyquist indicator below uses your
        selected primary objective and the fixed 180&nbsp;mm tube lens.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {cameras.map((cam) => {
          const selected = wizardState.selectedCamera === cam.id;
          const isLibra = cam.id === 'cam-tucsen-libra16';
          return (
            <Card
              key={cam.id}
              variant={selected ? 'elevation' : 'outlined'}
              sx={{
                width: 280,
                border: selected ? '2px solid' : undefined,
                borderColor: 'primary.main',
                position: 'relative',
              }}
            >
              {isLibra && (
                <Chip
                  icon={<Bolt />}
                  label="Best Quantum Efficiency"
                  color="warning"
                  size="small"
                  sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                />
              )}
              <CardActionArea
                onClick={() => updateWizardState({ selectedCamera: cam.id })}
                sx={{ p: 2, height: '100%' }}
              >
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Typography variant="subtitle1" fontWeight="bold">{cam.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {cam.manufacturer} · {cam.sensor}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                    <Chip label={cam.resolution} size="small" variant="outlined" />
                    <Chip label={`${cam.pixelSize_um} µm px`} size="small" variant="outlined" />
                    <Chip label={`${cam.fps_max} fps`} size="small" variant="outlined" />
                    <Chip label={`QE ${cam.quantumEfficiency}%`} size="small" variant="outlined" />
                  </Box>
                  {cam.recommendation && (
                    <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
                      {cam.recommendation}
                    </Alert>
                  )}
                  <Typography variant="subtitle2" color="primary" sx={{ mt: 1.5 }}>
                    +${cam.price.toLocaleString()}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Nyquist sampling check
      </Typography>
      {!wizardState.primaryObjective || !wizardState.selectedCamera ? (
        <Alert severity="info">
          Select a primary objective <em>and</em> a camera to see the Nyquist sampling result.
        </Alert>
      ) : nyquist ? (
        <Alert severity={nyquist.isSampled ? 'success' : 'warning'}>
          <Typography variant="body2">
            Effective pixel size: <strong>{nyquist.effectivePixelSize_um.toFixed(3)} µm</strong> ·
            Required (Nyquist): <strong>{nyquist.nyquistPixelSize_um.toFixed(3)} µm</strong>
          </Typography>
          <Typography variant="caption">
            Sampling ratio = {nyquist.samplingRatio.toFixed(2)} (≥ 1.0 means properly Nyquist-sampled).
            Optical resolution ≈ {(nyquist.resolution_um * 1000).toFixed(0)} nm.
          </Typography>
        </Alert>
      ) : null}
    </Box>
  );
}

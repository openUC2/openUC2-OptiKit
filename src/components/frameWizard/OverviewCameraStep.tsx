import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Info, CameraAlt } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function OverviewCameraStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CameraAlt color="primary" />
        <Typography variant="h5" fontWeight="bold">
          Overview Camera
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        An overview camera provides a low-magnification top-down view of the sample for navigation.
      </Typography>

      <Card variant="outlined" sx={{ maxWidth: 500 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img
              src="/configurator/icons/uc2-overviewcam.svg"
              alt="Overview Camera"
              style={{ height: 80, width: 80 }}
            />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Overview Camera Module
                </Typography>
                <Tooltip title="View documentation">
                  <IconButton
                    size="small"
                    onClick={() =>
                      window.open(
                        'https://docs.openuc2.com/frame/overview-camera',
                        '_blank',
                        'noopener'
                      )
                    }
                  >
                    <Info fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Low-cost USB camera with wide-angle lens. Provides a bird's-eye view of the entire
                sample holder area for quick visual navigation in ImSwitch.
              </Typography>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>
                $150
              </Typography>
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={wizardState.hasOverviewCamera}
                onChange={(e) => updateWizardState({ hasOverviewCamera: e.target.checked })}
              />
            }
            label="Include overview camera"
            sx={{ mt: 2 }}
          />
        </CardContent>
      </Card>
    </Box>
  );
}

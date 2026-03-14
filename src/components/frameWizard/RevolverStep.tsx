import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  Card,
  CardContent,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Info } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function RevolverStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        Motorized Objective Revolver
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add a motorized objective revolver to switch between objectives automatically during experiments.
      </Typography>

      <Card variant="outlined" sx={{ maxWidth: 500 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img
              src="/configurator/icons/uc2-objrevolver.svg"
              alt="Objective Revolver"
              style={{ height: 80, width: 80 }}
            />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Motorized Objective Revolver
                </Typography>
                <Tooltip title="View documentation">
                  <IconButton
                    size="small"
                    onClick={() =>
                      window.open(
                        'https://docs.openuc2.com/frame/objective-revolver',
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
                CAN-bus controlled stepper motor revolver. Allows automated switching between
                2–4 objectives for multi-resolution imaging.
              </Typography>
              <Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>
                $1,500
              </Typography>
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={wizardState.hasRevolver}
                onChange={(e) => updateWizardState({ hasRevolver: e.target.checked })}
              />
            }
            label="Include objective revolver"
            sx={{ mt: 2 }}
          />
        </CardContent>
      </Card>

      {wizardState.hasRevolver && !wizardState.secondaryObjective && (
        <Alert severity="info" sx={{ mt: 2, maxWidth: 500 }}>
          You have enabled the revolver but haven't selected a secondary objective.
          Go back to the Objectives step to add a second lens.
        </Alert>
      )}
    </Box>
  );
}

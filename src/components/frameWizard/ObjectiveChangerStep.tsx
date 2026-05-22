import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Alert,
} from '@mui/material';
import { SwapHoriz } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { ObjectiveChangerChoice } from '../../types/frameWizard';

interface ChangerOption {
  value: ObjectiveChangerChoice;
  label: string;
  description: string;
  detail: string;
  price: number;
}

const OPTIONS: ChangerOption[] = [
  {
    value: 'single',
    label: 'Single Objective Mount',
    description: 'Fixed mount for one objective. Lower cost, simpler alignment.',
    detail:
      'A static RMS/M25 mount that holds one objective at the correct parfocal distance. Choose this if you only need one magnification or want to keep the system minimal.',
    price: 120,
  },
  {
    value: '2-position',
    label: '2-Position Changer',
    description:
      'Motorized changer to switch between 2 objectives during experiments.',
    detail:
      'CAN-bus controlled stepper changer that can swap between two pre-calibrated objectives. Allows multi-resolution imaging without manual intervention.',
    price: 1500,
  },
];

/**
 * WP2: Replaces the legacy "Revolver" toggle with a proper Objective Changer
 * selection. The choice constrains how many objectives can be selected in the
 * Objectives step (handled there by reading `objectiveChanger` from the store).
 */
export function ObjectiveChangerStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  const onPick = (value: ObjectiveChangerChoice) => {
    // Drop the secondary objective when switching back to a single mount.
    if (value === 'single' && wizardState.secondaryObjective) {
      updateWizardState({ objectiveChanger: value, secondaryObjective: null });
    } else {
      updateWizardState({ objectiveChanger: value });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <SwapHoriz color="primary" />
        <Typography variant="h5" fontWeight="bold">
          Objective Changer
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Decide whether the FRAME should hold a single objective or a motorized
        2-position changer. This determines how many objectives you can pick in
        the next step.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {OPTIONS.map((opt) => (
          <Card
            key={opt.value}
            variant={wizardState.objectiveChanger === opt.value ? 'elevation' : 'outlined'}
            sx={{
              width: 320,
              border: wizardState.objectiveChanger === opt.value ? '2px solid' : undefined,
              borderColor: 'primary.main',
              transition: 'all 0.2s',
            }}
          >
            <CardActionArea onClick={() => onPick(opt.value)} sx={{ p: 2, height: '100%' }}>
              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {opt.label}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {opt.description}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {opt.detail}
                </Typography>
                <Typography variant="subtitle2" color="primary" sx={{ mt: 1.5 }}>
                  ${opt.price.toLocaleString()}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      {wizardState.objectiveChanger === '2-position' && (
        <Alert severity="info" sx={{ mt: 2, maxWidth: 660 }}>
          You can now pick a primary <em>and</em> a secondary objective in the next step.
        </Alert>
      )}
    </Box>
  );
}

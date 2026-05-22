import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  TextField,
  Alert,
} from '@mui/material';
import { ViewInAr } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { SampleHolderChoice } from '../../types/frameWizard';

interface HolderOption {
  value: SampleHolderChoice;
  title: string;
  description: string;
  price: number;
}

// WP7: four canonical sample holders + an optional custom 3D-printed one.
const OPTIONS: HolderOption[] = [
  {
    value: 'microscope-slide',
    title: 'Standard microscope slides',
    description: '76 × 26 mm slides — universal histology format.',
    price: 60,
  },
  {
    value: 'mtp',
    title: 'Microtiter plates (SLAS/ANSI)',
    description: '96/384-well plate holder for screening assays.',
    price: 100,
  },
  {
    value: 'petri-dish',
    title: 'Petri dishes',
    description: 'Standard 35–60 mm round dishes incl. glass-bottom variants.',
    price: 80,
  },
  {
    value: 'custom-3d',
    title: 'Custom 3D-printed insert',
    description: 'Bring your own geometry — we 3D print it to fit the FRAME.',
    price: 120,
  },
];

/**
 * WP7: Sample holder picker. Selecting "Custom 3D" unlocks a free-form text
 * field so users can describe what they need printed.
 */
export function SampleHolderStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ViewInAr color="primary" />
        <Typography variant="h5" fontWeight="bold">Sample Holder</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose how you would like to mount your samples. You can also skip this step.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {OPTIONS.map((opt) => {
          const selected = wizardState.sampleHolder === opt.value;
          return (
            <Card
              key={opt.value}
              variant={selected ? 'elevation' : 'outlined'}
              sx={{
                width: 260,
                border: selected ? '2px solid' : undefined,
                borderColor: 'primary.main',
              }}
            >
              <CardActionArea
                onClick={() =>
                  updateWizardState({
                    sampleHolder: selected ? 'none' : opt.value,
                    // Clear notes when leaving the custom option.
                    ...(selected && opt.value === 'custom-3d'
                      ? { customSampleHolderNotes: '' }
                      : {}),
                  })
                }
                sx={{ p: 2 }}
              >
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Typography variant="subtitle1" fontWeight="bold">{opt.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {opt.description}
                  </Typography>
                  <Typography variant="subtitle2" color="primary" sx={{ mt: 1.5 }}>
                    +${opt.price}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      {wizardState.sampleHolder === 'custom-3d' && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Describe the geometry, dimensions and material you need. Attach a CAD file to your
            quote request if available.
          </Alert>
          <TextField
            label="Custom holder description"
            multiline
            minRows={3}
            fullWidth
            value={wizardState.customSampleHolderNotes}
            onChange={(e) => updateWizardState({ customSampleHolderNotes: e.target.value })}
            placeholder="e.g. 35 mm round dish with cover glass bottom, 5 mm side opening, …"
          />
        </Box>
      )}
    </Box>
  );
}

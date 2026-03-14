import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Info, ViewModule } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { SampleHolderChoice } from '../../types/frameWizard';

const HOLDER_OPTIONS: {
  value: SampleHolderChoice;
  label: string;
  icon: string;
  description: string;
  docsUrl: string;
  price: number;
}[] = [
  {
    value: '4-slide-insert',
    label: '4-Slide Insert',
    icon: '/configurator/icons/uc2-framewellplate4.svg',
    description:
      'Holds up to 4 standard microscope slides (75×25mm). Compatible with motorized XY stage for scanning.',
    docsUrl: 'https://docs.openuc2.com/frame/4-slide-insert',
    price: 80,
  },
  {
    value: 'wellplate-insert',
    label: 'Wellplate Insert',
    icon: '/configurator/icons/uc2-framewellplate.svg',
    description:
      'Standard SBS-format wellplate holder. Fits 6, 12, 24, 48, or 96-well plates for high-throughput screening.',
    docsUrl: 'https://docs.openuc2.com/frame/wellplate-insert',
    price: 100,
  },
];

export function SampleHolderStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ViewModule color="primary" />
        <Typography variant="h5" fontWeight="bold">
          Sample Holder
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose which type of sample stage insert you need for your experiments.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {HOLDER_OPTIONS.map((opt) => (
          <Card
            key={opt.value}
            variant={wizardState.sampleHolder === opt.value ? 'elevation' : 'outlined'}
            sx={{
              width: 260,
              border: wizardState.sampleHolder === opt.value ? '2px solid' : undefined,
              borderColor: 'primary.main',
              transition: 'all 0.2s',
            }}
          >
            <CardActionArea
              onClick={() => updateWizardState({ sampleHolder: opt.value })}
              sx={{ p: 2 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 1,
                  height: 80,
                  alignItems: 'center',
                }}
              >
                <img src={opt.icon} alt={opt.label} style={{ maxHeight: 70, maxWidth: 70 }} />
              </Box>
              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <Typography variant="subtitle1" fontWeight="bold" textAlign="center">
                  {opt.label}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign="center"
                  sx={{ mt: 0.5, fontSize: '0.75rem' }}
                >
                  {opt.description}
                </Typography>
                <Typography variant="subtitle2" color="primary" textAlign="center" sx={{ mt: 1 }}>
                  ${opt.price}
                </Typography>
              </CardContent>
            </CardActionArea>
            <Box sx={{ textAlign: 'right', pr: 1, pb: 0.5 }}>
              <Tooltip title="View documentation">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(opt.docsUrl, '_blank', 'noopener');
                  }}
                >
                  <Info fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Card>
        ))}
      </Box>

      <Box sx={{ mt: 2 }}>
        <Card
          variant={wizardState.sampleHolder === 'none' ? 'elevation' : 'outlined'}
          sx={{
            border: wizardState.sampleHolder === 'none' ? '2px solid' : undefined,
            borderColor: 'text.secondary',
            cursor: 'pointer',
          }}
        >
          <CardActionArea
            onClick={() => updateWizardState({ sampleHolder: 'none' })}
            sx={{ p: 1.5 }}
          >
            <Typography variant="body2" textAlign="center" color="text.secondary">
              No sample holder (I'll use my own)
            </Typography>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
}

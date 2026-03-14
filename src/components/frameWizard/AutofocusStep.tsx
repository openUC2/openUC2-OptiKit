import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Tooltip,
  IconButton,
  Alert,
} from '@mui/material';
import { Info, GpsFixed } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { AutofocusChoice } from '../../types/frameWizard';

const AF_OPTIONS: {
  value: AutofocusChoice;
  label: string;
  icon: string;
  description: string;
  docsUrl: string;
  price: number;
}[] = [
  {
    value: 'laser-astigmatism',
    label: 'Laser Autofocus (Astigmatism)',
    icon: '/configurator/icons/uc2-laseraf.svg',
    description:
      'Hardware-based laser reflection autofocus using astigmatic detection. Fast and precise for Z-stack and time-lapse.',
    docsUrl: 'https://docs.openuc2.com/frame/laser-autofocus',
    price: 3000,
  },
  {
    value: 'image-contrast',
    label: 'Software Autofocus (Image Contrast)',
    icon: '/configurator/icons/uc2-imageaf.svg',
    description:
      'Software-based autofocus using image contrast metrics. No additional hardware needed. Runs in ImSwitch.',
    docsUrl: 'https://docs.openuc2.com/frame/image-autofocus',
    price: 0,
  },
];

export function AutofocusStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <GpsFixed color="primary" />
        <Typography variant="h5" fontWeight="bold">
          Hardware Autofocus
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose whether you want automatic focus stabilization for long experiments or Z-stack acquisitions.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        The laser autofocus module uses IR reflection to maintain focus lock. It's recommended for time-lapse, high-throughput screening, and wellplate scanning.
      </Alert>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {AF_OPTIONS.map((opt) => (
          <Card
            key={opt.value}
            variant={wizardState.autofocus === opt.value ? 'elevation' : 'outlined'}
            sx={{
              width: 260,
              border: wizardState.autofocus === opt.value ? '2px solid' : undefined,
              borderColor: 'primary.main',
              transition: 'all 0.2s',
            }}
          >
            <CardActionArea
              onClick={() => updateWizardState({ autofocus: opt.value })}
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
                  {opt.price > 0 ? `$${opt.price.toLocaleString()}` : 'Free (software only)'}
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
          variant={wizardState.autofocus === 'none' ? 'elevation' : 'outlined'}
          sx={{
            border: wizardState.autofocus === 'none' ? '2px solid' : undefined,
            borderColor: 'text.secondary',
            cursor: 'pointer',
          }}
        >
          <CardActionArea
            onClick={() => updateWizardState({ autofocus: 'none' })}
            sx={{ p: 1.5 }}
          >
            <Typography variant="body2" textAlign="center" color="text.secondary">
              No autofocus needed
            </Typography>
          </CardActionArea>
        </Card>
      </Box>
    </Box>
  );
}

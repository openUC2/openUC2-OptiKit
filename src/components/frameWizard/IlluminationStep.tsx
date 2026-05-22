import {
  Box,
  Typography,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  FormControlLabel,
  Checkbox,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { LightMode, FilterAlt } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type {
  LightSourceChoice,
  CondenserChoice,
  BrightfieldMode,
} from '../../types/frameWizard';

interface LightSourceCard {
  value: LightSourceChoice;
  title: string;
  description: string;
  price: number;
}

const LIGHT_CARDS: LightSourceCard[] = [
  {
    value: 'single-led',
    title: 'Single LED + Condenser',
    description:
      'Compact transmitted-light path with a single white/coloured LED and a chosen condenser. Ideal for simple brightfield.',
    price: 60,
  },
  {
    value: 'complex-setup',
    title: 'Complex Illumination Setup',
    description:
      'Single LED plus an RGB Köhler illumination ring for darkfield, oblique, polarization or computational microscopy.',
    price: 280,
  },
];

interface CondenserOption {
  value: CondenserChoice;
  title: string;
  detail: string;
  price: number;
}

const CONDENSERS: CondenserOption[] = [
  { value: 'abbe', title: 'Abbe condenser', detail: 'Classic 1.25 NA Abbe with iris.', price: 90 },
  {
    value: 'aspherical-25',
    title: 'Aspherical 25 mm',
    detail: 'Large 25 mm aspherical lens — high light throughput.',
    price: 45,
  },
  {
    value: 'aspherical-8-ph',
    title: 'Aspherical 8 mm (phase ring)',
    detail: 'Compact aspheric with integrated phase ring for phase contrast.',
    price: 50,
  },
];

interface BrightfieldOption {
  value: BrightfieldMode;
  label: string;
  description: string;
}

const BF_MODES: BrightfieldOption[] = [
  { value: 'bf-only', label: 'Brightfield', description: 'Standard transmitted light.' },
  { value: 'phase-contrast', label: 'Phase Contrast', description: 'Requires phase-ring condenser.' },
  { value: 'darkfield', label: 'Darkfield', description: 'Oblique LED ring illumination.' },
  { value: 'polarization', label: 'Polarization', description: 'Polariser/analyser inserts.' },
];

/**
 * WP4: Illumination step combining the transmitted light-source choice,
 * the condenser variant, and (for the complex setup) optional brightfield modes.
 */
export function IlluminationStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  const onLightSource = (value: LightSourceChoice) => {
    // Reset brightfield modes to just BF when switching back to the simple LED.
    if (value === 'single-led') {
      updateWizardState({ lightSource: value, brightfieldModes: ['bf-only'] });
    } else {
      updateWizardState({ lightSource: value });
    }
  };

  const toggleBrightfield = (mode: BrightfieldMode) => {
    const exists = wizardState.brightfieldModes.includes(mode);
    const next = exists
      ? wizardState.brightfieldModes.filter((m) => m !== mode)
      : [...wizardState.brightfieldModes, mode];
    // Always keep at least brightfield enabled.
    updateWizardState({
      brightfieldModes: next.length === 0 ? ['bf-only'] : next,
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LightMode color="primary" />
        <Typography variant="h5" fontWeight="bold">Illumination</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose the transmitted-light source and condenser. Advanced modes are available with
        the complex Köhler illumination setup.
      </Typography>

      {/* Light source picker */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        {LIGHT_CARDS.map((card) => (
          <Card
            key={card.value}
            variant={wizardState.lightSource === card.value ? 'elevation' : 'outlined'}
            sx={{
              width: 320,
              border: wizardState.lightSource === card.value ? '2px solid' : undefined,
              borderColor: 'primary.main',
            }}
          >
            <CardActionArea onClick={() => onLightSource(card.value)} sx={{ p: 2 }}>
              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <Typography variant="subtitle1" fontWeight="bold">{card.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {card.description}
                </Typography>
                <Typography variant="subtitle2" color="primary" sx={{ mt: 1.5 }}>
                  +${card.price}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Condenser */}
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Condenser
      </Typography>
      <ToggleButtonGroup
        value={wizardState.condenser}
        exclusive
        onChange={(_, v: CondenserChoice | null) => v && updateWizardState({ condenser: v })}
        sx={{ flexWrap: 'wrap', mb: 1 }}
      >
        {CONDENSERS.map((c) => (
          <ToggleButton
            key={c.value}
            value={c.value}
            sx={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', minWidth: 200, p: 1.5 }}
          >
            <Typography variant="subtitle2" fontWeight="bold">{c.title}</Typography>
            <Typography variant="caption" color="text.secondary">{c.detail}</Typography>
            <Typography variant="caption" color="primary" sx={{ mt: 0.5 }}>+${c.price}</Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Brightfield modes — only relevant for the complex setup */}
      {wizardState.lightSource === 'complex-setup' && (
        <>
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <FilterAlt color="primary" />
            <Typography variant="h6" fontWeight="bold">Brightfield modes</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Pick the contrast modes you would like to use. They reuse the same hardware.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {BF_MODES.map((m) => (
              <FormControlLabel
                key={m.value}
                control={
                  <Checkbox
                    checked={wizardState.brightfieldModes.includes(m.value)}
                    onChange={() => toggleBrightfield(m.value)}
                    disabled={m.value === 'bf-only'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" component="span" fontWeight="bold">
                      {m.label}
                    </Typography>{' '}
                    <Typography variant="caption" color="text.secondary" component="span">
                      — {m.description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </Box>
        </>
      )}

      {wizardState.lightSource === 'single-led' && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Only standard brightfield is available with a single LED. Switch to the complex setup
          to unlock phase contrast, darkfield and polarization.
        </Alert>
      )}
    </Box>
  );
}

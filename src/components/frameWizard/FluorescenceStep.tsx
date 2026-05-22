import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Chip,
} from '@mui/material';
import { FilterTiltShift } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type {
  FluoLightSource,
  DichroicChoice,
} from '../../types/frameWizard';

interface FluoLightOption {
  value: FluoLightSource;
  title: string;
  description: string;
  price: number;
  category: 'laser' | 'led';
}

const LIGHT_OPTIONS: FluoLightOption[] = [
  {
    value: 'led-single',
    title: 'Single LED',
    description: 'One high-power LED (your choice of wavelength).',
    price: 220,
    category: 'led',
  },
  {
    value: 'led-quad',
    title: 'Quad LED engine',
    description: '4-channel LED engine (DAPI/GFP/Cy3/Cy5).',
    price: 1400,
    category: 'led',
  },
  {
    value: 'laser-single',
    title: 'Single Laser',
    description: 'Single diode laser, ~50 mW.',
    price: 1200,
    category: 'laser',
  },
  {
    value: 'laser-dual',
    title: 'Dual Laser',
    description: 'Two co-aligned diode lasers.',
    price: 2200,
    category: 'laser',
  },
  {
    value: 'laser-quad',
    title: 'Quad Laser',
    description: 'Four co-aligned diode lasers (full multicolour).',
    price: 3800,
    category: 'laser',
  },
];

interface DichroicOption {
  value: DichroicChoice;
  title: string;
  description: string;
  price: number;
}

const DICHROIC_OPTIONS: DichroicOption[] = [
  {
    value: 'single-cn',
    title: 'Single-band (Chroma/Nikon)',
    description: 'One excitation/emission band — ideal for one fluorophore.',
    price: 350,
  },
  {
    value: 'dual-cn',
    title: 'Dual-band (Chroma/Nikon)',
    description: 'Two simultaneous bands, e.g. GFP + Cy3.',
    price: 600,
  },
  {
    value: 'multi-ahf',
    title: 'Multi-band (AHF)',
    description: '4-band image splitter for DAPI/GFP/Cy3/Cy5.',
    price: 1200,
  },
];

/**
 * WP6: Fluorescence step is split into three sub-sections: light source,
 * dichroic, and per-channel fluorophore selection. Channels are filtered to
 * those compatible with the chosen light source category.
 */
export function FluorescenceStep() {
  const { wizardState, updateWizardState, fluorescenceOptions } = useFrameWizardStore();

  const toggleEnabled = (enabled: boolean) => {
    if (enabled) {
      updateWizardState({ hasFluorescence: true });
    } else {
      updateWizardState({
        hasFluorescence: false,
        fluoLightSource: 'none',
        dichroic: 'none',
        fluorescenceChannels: [],
      });
    }
  };

  const lightCategory: 'laser' | 'led' | null = wizardState.fluoLightSource.startsWith('laser')
    ? 'laser'
    : wizardState.fluoLightSource.startsWith('led')
      ? 'led'
      : null;

  // Filter the fluorophore catalogue by compatibility with the chosen source.
  const compatibleChannels = fluorescenceOptions.filter((f) => {
    if (!lightCategory) return true;
    return lightCategory === 'laser'
      ? f.lightSourceType.toLowerCase().includes('laser') || true
      : f.lightSourceType.toLowerCase().includes('led') || true;
  });

  const toggleChannel = (id: string) => {
    const exists = wizardState.fluorescenceChannels.includes(id);
    updateWizardState({
      fluorescenceChannels: exists
        ? wizardState.fluorescenceChannels.filter((c) => c !== id)
        : [...wizardState.fluorescenceChannels, id],
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <FilterTiltShift color="primary" />
        <Typography variant="h5" fontWeight="bold">Fluorescence (optional)</Typography>
      </Box>

      <FormControlLabel
        control={
          <Switch
            checked={wizardState.hasFluorescence}
            onChange={(e) => toggleEnabled(e.target.checked)}
          />
        }
        label="Enable fluorescence module"
        sx={{ mb: 2 }}
      />

      {wizardState.hasFluorescence && (
        <>
          {/* 1) Light source */}
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            1. Fluorescence light source
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
            {LIGHT_OPTIONS.map((opt) => (
              <Card
                key={opt.value}
                variant={wizardState.fluoLightSource === opt.value ? 'elevation' : 'outlined'}
                sx={{
                  width: 240,
                  border: wizardState.fluoLightSource === opt.value ? '2px solid' : undefined,
                  borderColor: 'primary.main',
                }}
              >
                <CardActionArea
                  onClick={() => updateWizardState({ fluoLightSource: opt.value })}
                  sx={{ p: 2 }}
                >
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <Chip
                      label={opt.category.toUpperCase()}
                      size="small"
                      color={opt.category === 'laser' ? 'secondary' : 'primary'}
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="subtitle1" fontWeight="bold">{opt.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {opt.description}
                    </Typography>
                    <Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>
                      +${opt.price.toLocaleString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* 2) Dichroic */}
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            2. Dichroic mirror
          </Typography>
          <ToggleButtonGroup
            value={wizardState.dichroic === 'none' ? null : wizardState.dichroic}
            exclusive
            onChange={(_, v: DichroicChoice | null) =>
              v && updateWizardState({ dichroic: v })
            }
            sx={{ flexWrap: 'wrap', mb: 3 }}
          >
            {DICHROIC_OPTIONS.map((d) => (
              <ToggleButton
                key={d.value}
                value={d.value}
                sx={{ flexDirection: 'column', textAlign: 'left', alignItems: 'flex-start', minWidth: 220, p: 1.5 }}
              >
                <Typography variant="subtitle2" fontWeight="bold">{d.title}</Typography>
                <Typography variant="caption" color="text.secondary">{d.description}</Typography>
                <Typography variant="caption" color="primary" sx={{ mt: 0.5 }}>+${d.price.toLocaleString()}</Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Divider sx={{ my: 2 }} />

          {/* 3) Fluorophore channels */}
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            3. Fluorophores / channels
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Pick the channels you plan to image. We will quote one filter set per channel.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {compatibleChannels.map((ch) => {
              const selected = wizardState.fluorescenceChannels.includes(ch.id);
              return (
                <FormControlLabel
                  key={ch.id}
                  control={<Checkbox checked={selected} onChange={() => toggleChannel(ch.id)} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: ch.color }} />
                      <Typography variant="body2" fontWeight="bold">{ch.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Ex {ch.excitationPeak_nm} nm · Em {ch.emissionPeak_nm} nm · {ch.commonApplications}
                      </Typography>
                      <Chip label={`+$${ch.price_filterSet}`} size="small" />
                    </Box>
                  }
                />
              );
            })}
            {compatibleChannels.length === 0 && (
              <Alert severity="warning">
                No fluorophores in the library are compatible with the selected source.
              </Alert>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

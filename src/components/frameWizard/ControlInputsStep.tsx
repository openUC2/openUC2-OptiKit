import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Info, Gamepad, TuneOutlined } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

const CONTROL_OPTIONS = [
  {
    value: 'ps4-joystick',
    label: 'PS4 / USB Joystick',
    icon: '/configurator/icons/uc2-ps4joystick.svg',
    description: 'Wireless or wired PS4 controller for intuitive XYZ navigation and focus control via ImSwitch.',
    docsUrl: 'https://docs.openuc2.com/frame/ps4-joystick',
    price: 40,
    muiIcon: <Gamepad />,
  },
  {
    value: 'can-jog-dial',
    label: 'CAN-Bus Jog Dial',
    icon: '/configurator/icons/uc2-dialcontrol.svg',
    description: 'Precision rotary encoder dial for fine Z-axis and stage control. CAN-bus connected.',
    docsUrl: 'https://docs.openuc2.com/frame/dial-control',
    price: 80,
    muiIcon: <TuneOutlined />,
  },
];

export function ControlInputsStep() {
  const { wizardState, updateWizardState } = useFrameWizardStore();

  const toggleControl = (value: string) => {
    const inputs = [...wizardState.controlInputs];
    const idx = inputs.indexOf(value);
    if (idx >= 0) {
      inputs.splice(idx, 1);
    } else {
      inputs.push(value);
    }
    updateWizardState({ controlInputs: inputs });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        🎮 Control Inputs
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add physical input devices for controlling stage movement, focus, and other functions.
        All control is handled through ImSwitch software.
      </Typography>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {CONTROL_OPTIONS.map((opt) => (
          <Card
            key={opt.value}
            variant={
              wizardState.controlInputs.includes(opt.value) ? 'elevation' : 'outlined'
            }
            sx={{
              width: 280,
              border: wizardState.controlInputs.includes(opt.value) ? '2px solid' : undefined,
              borderColor: 'primary.main',
              transition: 'all 0.2s',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <img src={opt.icon} alt={opt.label} style={{ height: 60, width: 60 }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {opt.label}
                    </Typography>
                    <Tooltip title="View documentation">
                      <IconButton
                        size="small"
                        onClick={() => window.open(opt.docsUrl, '_blank', 'noopener')}
                      >
                        <Info fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {opt.description}
                  </Typography>
                  <Typography variant="subtitle2" color="primary" sx={{ mt: 0.5 }}>
                    ${opt.price}
                  </Typography>
                </Box>
              </Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={wizardState.controlInputs.includes(opt.value)}
                    onChange={() => toggleControl(opt.value)}
                  />
                }
                label="Include"
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}

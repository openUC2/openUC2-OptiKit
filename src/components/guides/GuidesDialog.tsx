/**
 * The Guides dialog (WP-27): a list of guided walkthroughs, each an ordered
 * step list with deep links to the page it happens on. Reads across routes,
 * so a guide can walk from the schematic to the component editor to the
 * assembly without an element-anchored overlay tour.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Close as CloseIcon,
  OpenInNew as GotoIcon,
} from '@mui/icons-material';
import { GUIDES, type Guide } from './guides';

export function GuidesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [active, setActive] = useState<Guide | null>(null);

  const close = () => {
    setActive(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {active && (
          <IconButton size="small" onClick={() => setActive(null)}>
            <BackIcon fontSize="small" />
          </IconButton>
        )}
        <Box sx={{ flex: 1 }}>{active ? active.title : 'Guides & tutorials'}</Box>
        <IconButton size="small" onClick={close}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {!active && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Short, step-by-step walkthroughs of the main flows. Each opens the
              right page as you go.
            </Typography>
            <List disablePadding>
              {GUIDES.map(guide => (
                <ListItemButton
                  key={guide.id}
                  onClick={() => setActive(guide)}
                  sx={{ borderRadius: 1, mb: 0.5, border: '1px solid', borderColor: 'divider' }}
                >
                  <ListItemText
                    primary={guide.title}
                    secondary={guide.blurb}
                    primaryTypographyProps={{ fontWeight: 600 }}
                  />
                  <Chip size="small" label={`${guide.steps.length} steps`} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}

        {active && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {active.blurb}
              </Typography>
              <Button
                size="small" variant="outlined" startIcon={<GotoIcon />}
                onClick={() => { navigate(active.startRoute); }}
              >
                open page
              </Button>
            </Stack>
            <Stepper orientation="vertical" nonLinear activeStep={-1}>
              {active.steps.map((step, i) => (
                <Step key={i} active expanded>
                  <StepLabel>
                    <Typography variant="subtitle2">{step.title}</Typography>
                  </StepLabel>
                  <StepContent>
                    <Typography variant="body2" color="text.secondary">
                      {step.body}
                    </Typography>
                    {step.goto && (
                      <Button
                        size="small" startIcon={<GotoIcon />} sx={{ mt: 0.5 }}
                        onClick={() => { navigate(step.goto!); }}
                      >
                        go to this page
                      </Button>
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

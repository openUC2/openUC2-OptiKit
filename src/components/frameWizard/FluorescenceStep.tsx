import {
  Box,
  Typography,
  Switch,
  FormControlLabel,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
} from '@mui/material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function FluorescenceStep() {
  const { wizardState, updateWizardState, fluorescenceOptions } = useFrameWizardStore();

  const toggleChannel = (id: string) => {
    const channels = [...wizardState.fluorescenceChannels];
    const idx = channels.indexOf(id);
    if (idx >= 0) {
      channels.splice(idx, 1);
    } else {
      channels.push(id);
    }
    updateWizardState({ fluorescenceChannels: channels });
  };

  // Separate single-band and multi-band options
  const singleBand = fluorescenceOptions.filter(
    (f) => !f.name.toLowerCase().includes('multiband') && !f.name.toLowerCase().includes('quad')
  );
  const multiBand = fluorescenceOptions.filter(
    (f) => f.name.toLowerCase().includes('multiband') || f.name.toLowerCase().includes('quad')
  );

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        🔬 Fluorescence Configuration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enable fluorescence imaging and pick the excitation/emission channels you need.
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={wizardState.hasFluorescence}
            onChange={(e) => {
              updateWizardState({
                hasFluorescence: e.target.checked,
                fluorescenceChannels: e.target.checked ? wizardState.fluorescenceChannels : [],
              });
            }}
          />
        }
        label="Enable fluorescence imaging"
        sx={{ mb: 2 }}
      />

      {wizardState.hasFluorescence && (
        <>
          {/* Selected channels summary */}
          {wizardState.fluorescenceChannels.length > 0 && (
            <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {wizardState.fluorescenceChannels.map((chId) => {
                const ch = fluorescenceOptions.find((f) => f.id === chId);
                return ch ? (
                  <Chip
                    key={chId}
                    label={ch.dyeName}
                    onDelete={() => toggleChannel(chId)}
                    sx={{
                      bgcolor: ch.color,
                      color: ['#FFFF00', '#00FF00'].includes(ch.color) ? '#000' : '#fff',
                    }}
                  />
                ) : null;
              })}
            </Box>
          )}

          {/* Single-band options */}
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
            Single-Band Channels
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 3, maxHeight: 300 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Dye</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Ex (nm)</TableCell>
                  <TableCell align="right">Em (nm)</TableCell>
                  <TableCell>Color</TableCell>
                  <TableCell>Applications</TableCell>
                  <TableCell align="right">Price</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {singleBand.map((fl) => (
                  <TableRow key={fl.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={wizardState.fluorescenceChannels.includes(fl.id)}
                        onChange={() => toggleChannel(fl.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {fl.dyeName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={fl.lightSourceType} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{fl.excitationPeak_nm}</TableCell>
                    <TableCell align="right">{fl.emissionPeak_nm}</TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          bgcolor: fl.color,
                          border: '1px solid #ccc',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{fl.commonApplications}</Typography>
                    </TableCell>
                    <TableCell align="right">${fl.price_filterSet}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Multi-band options */}
          {multiBand.length > 0 && (
            <>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                Multi-Band Filter Sets
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 200 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Applications</TableCell>
                      <TableCell align="right">Price</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {multiBand.map((fl) => (
                      <TableRow key={fl.id} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={wizardState.fluorescenceChannels.includes(fl.id)}
                            onChange={() => toggleChannel(fl.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {fl.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={fl.lightSourceType} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fl.commonApplications}</Typography>
                        </TableCell>
                        <TableCell align="right">${fl.price_filterSet}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {wizardState.fluorescenceChannels.length === 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Fluorescence is enabled but no channels are selected. Pick at least one channel above.
            </Alert>
          )}
        </>
      )}
    </Box>
  );
}

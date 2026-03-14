import { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Radio,
  Paper,
  TextField,
  Chip,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Search, Info, Lens } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function TubeLensStep() {
  const { wizardState, updateWizardState, lenses, computeNyquist } = useFrameWizardStore();
  const [search, setSearch] = useState('');

  // Filter to tube lenses only
  const tubeLenses = lenses.filter(
    (l) =>
      l.type.toLowerCase().includes('tube') ||
      l.name.toLowerCase().includes('tube')
  );

  const filtered = tubeLenses.filter(
    (l) =>
      !search ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.manufacturer.toLowerCase().includes(search.toLowerCase())
  );

  const nyquist = computeNyquist();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Lens color="primary" />
        <Typography variant="h5" fontWeight="bold">
          Tube Lens Selection
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The tube lens focuses the image onto the camera sensor. Focal length affects effective magnification and Nyquist sampling.
      </Typography>

      {/* Nyquist info box */}
      {nyquist && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 2,
            bgcolor: nyquist.isSampled ? '#e8f5e9' : '#fff3e0',
          }}
        >
          <Typography variant="body2" fontWeight="bold">
            With current selection: Effective pixel = {nyquist.effectivePixelSize_um.toFixed(2)} µm
            | Nyquist limit = {nyquist.nyquistPixelSize_um.toFixed(2)} µm
            | {nyquist.isSampled ? '✓ Nyquist satisfied' : '✗ Undersampled'}
          </Typography>
        </Paper>
      )}

      <TextField
        size="small"
        placeholder="Search tube lenses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{ input: { startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} /> } }}
        sx={{ width: 280, mb: 2 }}
      />

      <TableContainer component={Paper} sx={{ maxHeight: 380 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Name</TableCell>
              <TableCell>Manufacturer</TableCell>
              <TableCell align="right">f (mm)</TableCell>
              <TableCell align="right">Ø (mm)</TableCell>
              <TableCell>Coating</TableCell>
              <TableCell>Mount</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((lens) => (
              <TableRow
                key={lens.id}
                hover
                sx={{
                  bgcolor: wizardState.selectedTubeLens === lens.id ? 'primary.50' : undefined,
                }}
              >
                <TableCell padding="checkbox">
                  <Radio
                    size="small"
                    checked={wizardState.selectedTubeLens === lens.id}
                    onChange={() => updateWizardState({ selectedTubeLens: lens.id })}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {lens.name}
                  </Typography>
                  {lens.partNumber && (
                    <Typography variant="caption" color="text.secondary">
                      Part: {lens.partNumber}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{lens.manufacturer}</TableCell>
                <TableCell align="right">{lens.focalLength_mm}</TableCell>
                <TableCell align="right">{lens.diameter_mm}</TableCell>
                <TableCell>
                  <Chip label={lens.coating} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{lens.mountType}</TableCell>
                <TableCell align="right">${lens.price.toLocaleString()}</TableCell>
                <TableCell>
                  {lens.docsUrl && (
                    <Tooltip title="View specs">
                      <IconButton
                        size="small"
                        onClick={() => window.open(lens.docsUrl, '_blank', 'noopener')}
                      >
                        <Info fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
          No tube lenses found. Try adjusting your search.
        </Typography>
      )}
    </Box>
  );
}

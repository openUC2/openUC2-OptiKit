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
  TextField,
  Chip,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
} from '@mui/material';
import { Search, Info } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';

export function ObjectiveStep() {
  const { wizardState, updateWizardState, objectives } = useFrameWizardStore();
  const [search, setSearch] = useState('');
  const [mfgFilter, setMfgFilter] = useState<string>('all');

  const manufacturers = [...new Set(objectives.map((o) => o.manufacturer))];

  const filtered = objectives.filter((o) => {
    const matchSearch =
      !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.manufacturer.toLowerCase().includes(search.toLowerCase());
    const matchMfg = mfgFilter === 'all' || o.manufacturer === mfgFilter;
    return matchSearch && matchMfg;
  });

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 1 }}>
        🔬 Select Objective Lenses
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose a primary objective (required) and optionally a secondary objective for the motorized revolver.
      </Typography>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search objectives..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ width: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Manufacturer</InputLabel>
          <Select
            value={mfgFilter}
            label="Manufacturer"
            onChange={(e) => setMfgFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            {manufacturers.map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {wizardState.primaryObjective && (
          <Chip label="Primary selected" color="primary" size="small" />
        )}
        {wizardState.secondaryObjective && (
          <Chip label="Secondary selected" color="secondary" size="small" />
        )}
      </Box>

      {/* Objective Table */}
      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">Primary</TableCell>
              <TableCell padding="checkbox">Secondary</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Manufacturer</TableCell>
              <TableCell align="right">Mag</TableCell>
              <TableCell align="right">NA</TableCell>
              <TableCell align="right">WD (mm)</TableCell>
              <TableCell>Immersion</TableCell>
              <TableCell>Thread</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((obj) => (
              <TableRow
                key={obj.id}
                hover
                sx={{
                  bgcolor:
                    wizardState.primaryObjective === obj.id
                      ? 'primary.50'
                      : wizardState.secondaryObjective === obj.id
                        ? 'secondary.50'
                        : undefined,
                }}
              >
                <TableCell padding="checkbox">
                  <Radio
                    size="small"
                    checked={wizardState.primaryObjective === obj.id}
                    onChange={() => updateWizardState({ primaryObjective: obj.id })}
                  />
                </TableCell>
                <TableCell padding="checkbox">
                  <Radio
                    size="small"
                    checked={wizardState.secondaryObjective === obj.id}
                    onChange={() => updateWizardState({ secondaryObjective: obj.id })}
                    disabled={wizardState.primaryObjective === obj.id}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {obj.name}
                  </Typography>
                </TableCell>
                <TableCell>{obj.manufacturer}</TableCell>
                <TableCell align="right">{obj.magnification}×</TableCell>
                <TableCell align="right">{obj.na}</TableCell>
                <TableCell align="right">{obj.workingDistance_mm}</TableCell>
                <TableCell>
                  <Chip label={obj.immersion} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{obj.threadType}</TableCell>
                <TableCell align="right">${obj.price.toLocaleString()}</TableCell>
                <TableCell>
                  {obj.docsUrl && (
                    <Tooltip title="View specs">
                      <IconButton
                        size="small"
                        onClick={() => window.open(obj.docsUrl, '_blank', 'noopener')}
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
    </Box>
  );
}

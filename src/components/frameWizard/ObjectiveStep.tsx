import { useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Radio,
  Chip,
  Alert,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Visibility, Clear } from '@mui/icons-material';
import { useFrameWizardStore } from '../../stores/frameWizardStore';
import type { ObjectiveOption } from '../../types/frameWizard';

/**
 * WP3: Objective selection. Lists the canonical 11 objectives grouped by
 * category, hides the secondary column when the user has chosen a single mount,
 * and emphasises Olympus 180 mm tube-lens compatibility.
 */
export function ObjectiveStep() {
  const { wizardState, updateWizardState, objectives } = useFrameWizardStore();
  const showSecondary = wizardState.objectiveChanger === '2-position';

  // Group objectives by their declared category for clean visual sections.
  const grouped = useMemo(() => {
    const map = new Map<string, ObjectiveOption[]>();
    objectives.forEach((o) => {
      const key = o.category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    // Stable ordering for the rendered sections.
    const order = ['Special', 'High Rank Soptop', 'Phase Contrast', 'Low Rank', 'Other'];
    return order
      .filter((k) => map.has(k))
      .map((k) => [k, map.get(k)!] as const)
      .concat(
        Array.from(map.entries()).filter(([k]) => !order.includes(k)),
      );
  }, [objectives]);

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Select Objective{showSecondary ? 's' : ''}
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        All objectives are optically based on <strong>Olympus infinity correction</strong> and use a
        fixed <strong>180&nbsp;mm tube lens</strong>. Effective magnification therefore equals the
        nominal objective magnification.
      </Alert>

      {grouped.map(([category, list]) => (
        <Paper key={category} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" fontWeight="bold">{category}</Typography>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 60 }} align="center">Primary</TableCell>
                {showSecondary && (
                  <TableCell sx={{ width: 80 }} align="center">Secondary</TableCell>
                )}
                <TableCell>Name</TableCell>
                <TableCell align="right">Mag</TableCell>
                <TableCell align="right">NA</TableCell>
                <TableCell align="right">WD (mm)</TableCell>
                <TableCell align="right">f (mm)</TableCell>
                <TableCell>Thread</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="center">Info</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((obj) => (
                <TableRow key={obj.id} hover>
                  <TableCell align="center">
                    <Radio
                      checked={wizardState.primaryObjective === obj.id}
                      onChange={() => updateWizardState({ primaryObjective: obj.id })}
                    />
                  </TableCell>
                  {showSecondary && (
                    <TableCell align="center">
                      <Radio
                        checked={wizardState.secondaryObjective === obj.id}
                        onChange={() => updateWizardState({ secondaryObjective: obj.id })}
                        disabled={wizardState.primaryObjective === obj.id}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">{obj.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {obj.manufacturer} · {obj.correctionType}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{obj.magnification}x</TableCell>
                  <TableCell align="right">{obj.na}</TableCell>
                  <TableCell align="right">{obj.workingDistance_mm}</TableCell>
                  <TableCell align="right">{obj.focalLength_mm}</TableCell>
                  <TableCell><Chip label={obj.threadType} size="small" /></TableCell>
                  <TableCell align="right">
                    <strong>${obj.price.toLocaleString()}</strong>
                  </TableCell>
                  <TableCell align="center">
                    {obj.docsUrl && (
                      <Tooltip title="Open documentation">
                        <IconButton
                          size="small"
                          onClick={() => window.open(obj.docsUrl, '_blank')}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ))}

      {/* Allow clearing the secondary slot without un-selecting the primary one. */}
      {showSecondary && wizardState.secondaryObjective && (
        <Chip
          label="Clear secondary objective"
          onDelete={() => updateWizardState({ secondaryObjective: null })}
          deleteIcon={<Clear />}
          sx={{ mt: 1 }}
        />
      )}
    </Box>
  );
}

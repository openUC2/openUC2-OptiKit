/**
 * KernelDiagnostics — the kernel loop's diagnostics in the SimulationPanel
 * (EMB-D): materialize + trace wall times, service findings keyed by their
 * stable code and naming the component/source (decision 6.14), manifest
 * warnings, unmapped "not simulated" modules (decision E4), and service
 * errors. Renders only on the kernel engine.
 */

import React from 'react';
import { Alert, Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import { segmentCount } from '../kernel/segments';

export const KernelDiagnostics: React.FC = () => {
  const engine = useSimulationStore(s => s.engine);
  const kernel = useSimulationStore(s => s.kernel);
  const enabled = useSimulationStore(s => s.config.enabled);
  const modules = useAppStore(s => s.modules);

  if (engine !== 'kernel' || !enabled) return null;

  const moduleName = (moduleId: string) =>
    modules.find(m => m.id === moduleId)?.name ?? moduleId;
  const traced = segmentCount(kernel.segments);

  return (
    <Card data-testid="kernel-diagnostics">
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip size="small" color="primary" label="engine: kernel (oc-wasm)" />
          {kernel.busy && <Chip size="small" label="tracing…" />}
          {kernel.requestId > 0 && (
            <Typography variant="caption" color="text.secondary">
              {traced} segments · materialize {kernel.materializeMs.toFixed(0)} ms · trace{' '}
              {kernel.traceMs.toFixed(0)} ms
            </Typography>
          )}
        </Box>

        {kernel.serviceError && (
          <Alert severity="error" sx={{ mt: 1 }} data-testid="kernel-service-error">
            {kernel.serviceError}
          </Alert>
        )}

        {kernel.findings.map((finding, i) => (
          <Alert
            key={`finding-${i}`}
            severity={finding.severity === 'error' ? 'warning' : 'info'}
            sx={{ mt: 1 }}
            data-testid={`kernel-finding-${finding.code}`}
          >
            <strong>{finding.code}</strong>
            {finding.context ? ` — ${finding.context}` : ''}: {finding.message}
          </Alert>
        ))}

        {kernel.warnings.map((warning, i) => (
          <Typography key={`warn-${i}`} variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {warning}
          </Typography>
        ))}

        {kernel.unmapped.length > 0 && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Not simulated (no optical record):{' '}
            {kernel.unmapped.map(u => moduleName(u.moduleId)).join(', ')}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * SimulationPanel - Control panel for ray tracing simulation
 * 
 * Provides controls for:
 * - Running/stopping simulation
 * - Configuring ray count, bounces, brightness
 * - Viewing detector readings
 * - Seeing warnings/errors
 */

import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Slider,
  Switch,
  FormControlLabel,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  IconButton,
  Collapse
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Science as ScienceIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import { hasSimulationModel, isSourceElement, isDetectorElement } from '../utils/sceneBuilder';

export const SimulationPanel: React.FC = () => {
  const [detailsExpanded, setDetailsExpanded] = React.useState(true);
  const [detectorsExpanded, setDetectorsExpanded] = React.useState(true);
  
  const {
    config,
    isRunning,
    lastRunTime,
    rays,
    detectorReadings,
    warnings,
    errors,
    setConfig,
    runSimulation,
    stopSimulation,
    clearResults
  } = useSimulationStore();
  
  const { placedModules, modules } = useAppStore();
  
  // Count optical elements
  const opticalElements = placedModules.filter(m => hasSimulationModel(m.moduleId));
  const sourceCount = placedModules.filter(m => isSourceElement(m.moduleId)).length;
  const detectorCount = placedModules.filter(m => isDetectorElement(m.moduleId)).length;
  
  // Handle run/stop
  const handleRunStop = () => {
    if (isRunning) {
      stopSimulation();
    } else {
      runSimulation();
    }
  };
  
  // Get module name for detector
  const getModuleName = (moduleInstanceId: string): string => {
    const placed = placedModules.find(m => m.id === moduleInstanceId);
    if (!placed) return 'Unknown';
    const def = modules.find(m => m.id === placed.moduleId);
    return def?.name || placed.moduleId;
  };
  
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
      <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ScienceIcon />
        Ray Simulation
      </Typography>
      
      {/* Enable/Disable Toggle */}
      <Card>
        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
          <FormControlLabel
            control={
              <Switch
                checked={config.enabled}
                onChange={(e) => setConfig({ enabled: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>Simulation {config.enabled ? 'ON' : 'OFF'}</Typography>
                {config.enabled && (
                  <Chip 
                    size="small" 
                    label={`${opticalElements.length} elements`}
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>
            }
          />
        </CardContent>
      </Card>
      
      {/* Controls - only show when enabled */}
      {config.enabled && (
        <>
          {/* Run Controls */}
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  variant="contained"
                  color={isRunning ? 'error' : 'primary'}
                  startIcon={isRunning ? <StopIcon /> : <PlayIcon />}
                  onClick={handleRunStop}
                  disabled={sourceCount === 0}
                  fullWidth
                >
                  {isRunning ? 'Stop' : 'Run Simulation'}
                </Button>
                <Tooltip title="Clear results">
                  <IconButton onClick={clearResults} disabled={isRunning}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={config.autoRun}
                    onChange={(e) => setConfig({ autoRun: e.target.checked })}
                  />
                }
                label="Auto-run on changes"
              />
              
              {/* Status */}
              <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  size="small" 
                  icon={isRunning ? <CircularProgress size={12} /> : undefined}
                  label={isRunning ? 'Running...' : `${rays.length} rays`}
                  color={isRunning ? 'warning' : 'default'}
                />
                {lastRunTime > 0 && (
                  <Chip 
                    size="small" 
                    label={`${lastRunTime.toFixed(1)} ms`}
                    variant="outlined"
                  />
                )}
                <Chip 
                  size="small" 
                  label={`${sourceCount} sources`}
                  color={sourceCount > 0 ? 'success' : 'error'}
                  variant="outlined"
                />
                <Chip 
                  size="small" 
                  label={`${detectorCount} detectors`}
                  color={detectorCount > 0 ? 'success' : 'default'}
                  variant="outlined"
                />
              </Box>
            </CardContent>
          </Card>
          
          {/* Warnings/Errors */}
          {(warnings.length > 0 || errors.length > 0) && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {errors.map((error, i) => (
                <Alert key={`err-${i}`} severity="error" icon={<ErrorIcon />}>
                  {error.message}
                </Alert>
              ))}
              {warnings.map((warning, i) => (
                <Alert key={`warn-${i}`} severity="warning" icon={<WarningIcon />}>
                  {warning.message}
                </Alert>
              ))}
            </Box>
          )}
          
          {/* Settings */}
          <Card>
            <CardContent>
              <Box 
                sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setDetailsExpanded(!detailsExpanded)}
              >
                <Typography variant="subtitle2">Settings</Typography>
                <IconButton size="small">
                  {detailsExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </IconButton>
              </Box>
              
              <Collapse in={detailsExpanded}>
                <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Max Rays */}
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Max Rays per Source: {config.maxRays}
                    </Typography>
                    <Slider
                      value={config.maxRays}
                      onChange={(_, v) => setConfig({ maxRays: v as number })}
                      min={5}
                      max={200}
                      step={5}
                      marks={[
                        { value: 5, label: '5' },
                        { value: 50, label: '50' },
                        { value: 100, label: '100' },
                        { value: 200, label: '200' }
                      ]}
                      size="small"
                    />
                  </Box>
                  
                  {/* Max Bounces */}
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Max Bounces: {config.maxBounces}
                    </Typography>
                    <Slider
                      value={config.maxBounces}
                      onChange={(_, v) => setConfig({ maxBounces: v as number })}
                      min={1}
                      max={50}
                      step={1}
                      marks={[
                        { value: 1, label: '1' },
                        { value: 10, label: '10' },
                        { value: 25, label: '25' },
                        { value: 50, label: '50' }
                      ]}
                      size="small"
                    />
                  </Box>
                  
                  {/* Ray Brightness */}
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Ray Brightness: {Math.round(config.rayBrightness * 100)}%
                    </Typography>
                    <Slider
                      value={config.rayBrightness}
                      onChange={(_, v) => setConfig({ rayBrightness: v as number })}
                      min={0.1}
                      max={1}
                      step={0.1}
                      size="small"
                    />
                  </Box>
                  
                  {/* Color Mode */}
                  <FormControl fullWidth size="small">
                    <InputLabel>Ray Color Mode</InputLabel>
                    <Select
                      value={config.rayColorMode}
                      label="Ray Color Mode"
                      onChange={(e) => setConfig({ rayColorMode: e.target.value as 'wavelength' | 'intensity' | 'source' })}
                    >
                      <MenuItem value="wavelength">By Wavelength</MenuItem>
                      <MenuItem value="intensity">By Intensity</MenuItem>
                      <MenuItem value="source">By Source</MenuItem>
                    </Select>
                  </FormControl>
                  
                  {/* Visibility toggles */}
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={config.showRays}
                          onChange={(e) => setConfig({ showRays: e.target.checked })}
                        />
                      }
                      label="Show Rays"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={config.showDetectorReadings}
                          onChange={(e) => setConfig({ showDetectorReadings: e.target.checked })}
                        />
                      }
                      label="Show Readings"
                    />
                  </Box>
                </Box>
              </Collapse>
            </CardContent>
          </Card>
          
          {/* Detector Readings */}
          {detectorReadings.length > 0 && (
            <Card>
              <CardContent>
                <Box 
                  sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                  onClick={() => setDetectorsExpanded(!detectorsExpanded)}
                >
                  <Typography variant="subtitle2">
                    Detector Readings ({detectorReadings.length})
                  </Typography>
                  <IconButton size="small">
                    {detectorsExpanded ? <CollapseIcon /> : <ExpandIcon />}
                  </IconButton>
                </Box>
                
                <Collapse in={detectorsExpanded}>
                  <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Detector</TableCell>
                          <TableCell align="right">Rays</TableCell>
                          <TableCell align="right">Power</TableCell>
                          <TableCell align="right">Spread</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detectorReadings.map((reading) => (
                          <TableRow key={reading.detectorId}>
                            <TableCell>
                              {getModuleName(reading.moduleInstanceId)}
                            </TableCell>
                            <TableCell align="right">
                              {reading.rayCount}
                            </TableCell>
                            <TableCell align="right">
                              {reading.totalPower.toFixed(3)}
                            </TableCell>
                            <TableCell align="right">
                              {reading.rayCount > 0 
                                ? `±${reading.spread.x.toFixed(2)} mm`
                                : '-'
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </CardContent>
            </Card>
          )}
          
          {/* Help text when no sources */}
          {sourceCount === 0 && (
            <Alert severity="info">
              Add a light source (Laser or LED) to start simulating ray paths.
            </Alert>
          )}
        </>
      )}
      
      {/* Help text when disabled */}
      {!config.enabled && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
          Enable simulation to visualize ray paths through your optical setup.
          Place optical elements (lenses, mirrors, beam splitters) and light sources
          (lasers, LEDs) on the grid.
        </Typography>
      )}
    </Box>
  );
};

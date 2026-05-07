import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Slider,
  Chip,
  Divider
} from '@mui/material';
import {
  RotateRight as RotateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  Download as DownloadIcon,
  Science as SimulationIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { getSimulationModel, getElementTypeName } from '../utils/sceneBuilder';
import type { PlacedModule } from '../types';

// Proper React component so hooks are never called conditionally
const DetectorSignalPlot: React.FC<{ module: PlacedModule }> = ({ module }) => {
  const { detectorReadings } = useSimulationStore();

  const reading = detectorReadings.find(r => r.moduleInstanceId === module.id);

  if (!reading || reading.rayCount === 0) {
    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          No rays detected. Run simulation to see signal.
        </Typography>
      </Box>
    );
  }

  const sensorWidth = module.params?.width as number || 12;
  const numBins = 20;
  const bins = new Array(numBins).fill(0);

  const simModel = getSimulationModel(module.moduleId);
  const rotationOffset = simModel?.rotationOffset || 0;
  const totalRotation = ((module.rotation || 0) + rotationOffset) * Math.PI / 180;
  const perpDir = { x: -Math.sin(totalRotation), y: Math.cos(totalRotation) };

  for (const impact of reading.rayImpacts) {
    const dx = impact.x - reading.centroid.x;
    const dy = impact.y - reading.centroid.y;
    const lateralPos = dx * perpDir.x + dy * perpDir.y;
    const binIndex = Math.floor((lateralPos / sensorWidth + 0.5) * numBins);
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex]++;
    }
  }

  const maxCount = Math.max(...bins, 1);
  const barHeight = 60;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
        Ray Distribution ({reading.rayCount} rays)
      </Typography>

      {/* Simple bar chart */}
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-end',
        height: barHeight + 20,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        p: 1,
        gap: '1px'
      }}>
        {bins.map((count, idx) => (
          <Box
            key={idx}
            sx={{
              flex: 1,
              height: `${(count / maxCount) * barHeight}px`,
              bgcolor: count > 0 ? 'primary.main' : 'action.disabledBackground',
              minHeight: 2,
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.2s'
            }}
            title={`Bin ${idx + 1}: ${count} rays`}
          />
        ))}
      </Box>

      {/* X-axis labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          -{(sensorWidth / 2).toFixed(1)}mm
        </Typography>
        <Typography variant="caption" color="text.secondary">
          0
        </Typography>
        <Typography variant="caption" color="text.secondary">
          +{(sensorWidth / 2).toFixed(1)}mm
        </Typography>
      </Box>

      {/* Statistics */}
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Chip
          size="small"
          label={`Power: ${reading.totalPower.toFixed(2)}`}
          variant="outlined"
        />
        <Chip
          size="small"
          label={`RMS: ${reading.spread.x.toFixed(2)}mm`}
          variant="outlined"
        />
      </Box>
    </Box>
  );
};

export const PropertyPanel: React.FC = () => {
  const { 
    selectedItemId, 
    selectedItemType, 
    placedModules, 
    annotations, 
    modules,
    setupMetadata,
    removeModule,
    removeAnnotation,
    rotateModule,
    updateModuleCustomText,
    updateModuleParams,
    updateSetupMetadata,
    exportData,
    selectItem,
    clearSelection
  } = useAppStore();

  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);

  const categories = ['General', 'Microscopy', 'Astronomy', 'Spectroscopy', 'Imaging', 'Laser'];

  const handleOpenMetadataDialog = () => {
    setMetadataDialogOpen(true);
  };

  const handleCloseMetadataDialog = () => {
    setMetadataDialogOpen(false);
  };

  const handleSaveMetadata = async () => {
    // Export data already includes the setup metadata from the store
    const currentSetup = await exportData();
    
    // Download as JSON file
    const blob = new Blob([currentSetup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setupMetadata.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    handleCloseMetadataDialog();
  };

  if (!selectedItemId || !selectedItemType) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <SettingsIcon />
          Properties
        </Typography>
        
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Setup Metadata
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Enter metadata for your optical setup.
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Setup Name"
                fullWidth
                size="small"
                value={setupMetadata.name}
                onChange={(e) => updateSetupMetadata({ name: e.target.value })}
              />
              
              <TextField
                label="Author"
                fullWidth
                size="small"
                value={setupMetadata.author}
                onChange={(e) => updateSetupMetadata({ author: e.target.value })}
                placeholder="Your name"
              />
              
              <TextField
                label="GitHub Account"
                fullWidth
                size="small"
                value={setupMetadata.githubAccount}
                onChange={(e) => updateSetupMetadata({ githubAccount: e.target.value })}
                placeholder="github_username"
              />
              
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select
                  value={setupMetadata.category}
                  label="Category"
                  onChange={(e) => updateSetupMetadata({ category: e.target.value as any })}
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                size="small"
                value={setupMetadata.description}
                onChange={(e) => updateSetupMetadata({ description: e.target.value })}
                placeholder="Describe your optical setup..."
              />
              
              <TextField
                label="Screenshot URL"
                fullWidth
                size="small"
                value={setupMetadata.screenshot}
                onChange={(e) => updateSetupMetadata({ screenshot: e.target.value })}
                placeholder="https://example.com/screenshot.png"
              />
              
              <TextField
                label="Notification"
                fullWidth
                multiline
                rows={2}
                size="small"
                value={setupMetadata.notification}
                onChange={(e) => updateSetupMetadata({ notification: e.target.value })}
                placeholder="Safety warnings, requirements, or important notices..."
                helperText="This message will be displayed when users import your setup"
              />
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => {
                    if (setupMetadata.notification && setupMetadata.notification.trim()) {
                      // Use addNotification from the store
                      const { addNotification } = useAppStore.getState();
                      addNotification({
                        type: 'warning',
                        title: 'Setup Notice Preview',
                        message: setupMetadata.notification,
                        duration: 6000
                      });
                    } else {
                      alert('Enter a notification message first to preview it');
                    }
                  }}
                  sx={{ flex: 1 }}
                >
                  Test Notification
                </Button>
                <Button 
                  variant="contained" 
                  startIcon={<DownloadIcon />}
                  onClick={handleOpenMetadataDialog}
                  size="small"
                  sx={{ flex: 2 }}
                >
                  Export Setup
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
        
        {/* Drawing Elements Management */}
        {annotations.length > 0 && (
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Drawing Elements
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Manage your annotations (lines, arrows, text).
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflow: 'auto' }}>
                {annotations.map((annotation) => (
                  <Paper 
                    key={annotation.id} 
                    sx={{ 
                      p: 1, 
                      cursor: 'pointer',
                      bgcolor: selectedItemId === annotation.id ? 'primary.light' : 'grey.50',
                      color: selectedItemId === annotation.id ? 'primary.contrastText' : 'inherit',
                      '&:hover': { bgcolor: selectedItemId === annotation.id ? 'primary.main' : 'grey.100' }
                    }}
                    onClick={() => {
                      if (selectedItemId === annotation.id) {
                        // Deselect if already selected
                        clearSelection();
                      } else {
                        // Select this annotation
                        selectItem(annotation.id, 'annotation');
                      }
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                          {annotation.text && ` - "${annotation.text.substring(0, 20)}${annotation.text.length > 20 ? '...' : ''}"`}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          Layer {annotation.layer}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete this ${annotation.type}?`)) {
                            removeAnnotation(annotation.id);
                          }
                        }}
                        sx={{ 
                          color: selectedItemId === annotation.id ? 'inherit' : 'error.main',
                          '&:hover': { bgcolor: 'error.light' }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Paper>
                ))}
              </Box>
              
              {annotations.length > 0 && (
                <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    onClick={() => {
                      if (confirm('Delete all drawing elements?')) {
                        annotations.forEach(annotation => removeAnnotation(annotation.id));
                      }
                    }}
                    fullWidth
                  >
                    Clear All
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
        
        <Paper 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: 'grey.50'
          }}
        >
          <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center' }}>
            Select a component to view and edit its properties
          </Typography>
        </Paper>
      </Box>
    );
  }

  const renderModuleProperties = () => {
    const module = placedModules.find(m => m.id === selectedItemId);
    if (!module) return null;

    const moduleDefinition = modules.find(m => m.id === module.moduleId);
    if (!moduleDefinition) return null;

    const handleRotate = () => {
      const newRotation = (module.rotation + 90) % 360;
      rotateModule(module.id, newRotation);
    };

    const handleEditText = () => {
      setEditText(module.customText || moduleDefinition.defaultParams?.customText as string || '');
      setIsEditingText(true);
    };

    const handleSaveText = () => {
      updateModuleCustomText(module.id, editText);
      setIsEditingText(false);
    };

    const handleCancelEdit = () => {
      setIsEditingText(false);
      setEditText('');
    };

    const isWildCard = moduleDefinition.defaultParams?.isWildCard === true;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Module Info
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Name</Typography>
                <Typography variant="body2">{moduleDefinition.name}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Position</Typography>
                <Typography variant="body2">({module.position.x}, {module.position.y})</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Rotation</Typography>
                <Typography variant="body2">{module.rotation}°</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Layer</Typography>
                <Typography variant="body2">{module.layer}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Footprint</Typography>
                <Typography variant="body2">
                  {module.rotation === 90 || module.rotation === 270 ? 
                    `${moduleDefinition.footprint.height} × ${moduleDefinition.footprint.width}` : 
                    `${moduleDefinition.footprint.width} × ${moduleDefinition.footprint.height}`}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {isWildCard && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Wild Card Text
              </Typography>
              {isEditingText ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    multiline
                    rows={3}
                    fullWidth
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Enter custom text..."
                    variant="outlined"
                    size="small"
                  />
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Button 
                      variant="contained" 
                      size="small"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveText}
                    >
                      Save
                    </Button>
                    <Button 
                      variant="outlined" 
                      size="small"
                      startIcon={<CancelIcon />}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" sx={{ mb: 2, fontStyle: module.customText ? 'normal' : 'italic' }}>
                    {module.customText || 'No custom text set'}
                  </Typography>
                  <Button 
                    variant="outlined" 
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={handleEditText}
                  >
                    {module.customText ? 'Edit Text' : 'Add Text'}
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Actions
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button 
                variant="outlined"
                startIcon={<RotateIcon />}
                onClick={handleRotate}
                size="small"
              >
                Rotate 90°
              </Button>
              <Button 
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => removeModule(module.id)}
                size="small"
              >
                Delete
              </Button>
            </Box>
          </CardContent>
        </Card>

        {module.params && Object.keys(module.params).length > 0 && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Parameters
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Object.entries(module.params).map(([key, value]) => {
                  const handleParamChange = (newValue: string) => {
                    // Try to parse as number if possible, otherwise keep as string
                    let parsedValue: unknown = newValue;
                    if (!isNaN(Number(newValue)) && newValue.trim() !== '') {
                      parsedValue = Number(newValue);
                    } else if (newValue.toLowerCase() === 'true') {
                      parsedValue = true;
                    } else if (newValue.toLowerCase() === 'false') {
                      parsedValue = false;
                    }
                    
                    updateModuleParams(module.id, { [key]: parsedValue });
                  };

                  return (
                    <Box key={key}>
                      <TextField
                        label={key}
                        fullWidth
                        size="small"
                        value={String(value)}
                        onChange={(e) => handleParamChange(e.target.value)}
                        variant="outlined"
                        helperText={typeof value === 'number' ? 'Numeric value' : 'Text value'}
                      />
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Optical Simulation Properties */}
        {renderOpticalProperties(module)}
      </Box>
    );
  };

  // Render optical simulation properties for a module
  const renderOpticalProperties = (module: typeof placedModules[0]) => {
    const simModel = getSimulationModel(module.moduleId);
    const simConfig = useSimulationStore.getState().config;
    
    if (!simModel || !simConfig.enabled) return null;
    
    const elementType = simModel.elementType;
    const typeName = getElementTypeName(elementType);
    
    // Get current simulation parameters from module params or defaults
    const getSimParam = (key: string, defaultVal: number) => {
      if (module.params?.[key] !== undefined) return module.params[key] as number;
      if (simModel.defaultParams?.[key as keyof typeof simModel.defaultParams] !== undefined) {
        return simModel.defaultParams[key as keyof typeof simModel.defaultParams] as number;
      }
      return defaultVal;
    };
    
    const handleSimParamChange = (key: string, value: number) => {
      updateModuleParams(module.id, { [key]: value });
      // Trigger auto-run if enabled
      if (simConfig.autoRun) {
        useSimulationStore.getState().scheduleAutoRun();
      }
    };
    
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SimulationIcon color="primary" />
            <Typography variant="h6">
              Optical Properties
            </Typography>
            <Chip size="small" label={typeName} color="primary" variant="outlined" />
          </Box>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Lens properties */}
            {elementType === 'lens' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Focal Length: {getSimParam('focalLength', 100)} mm
                  </Typography>
                  <Slider
                    value={getSimParam('focalLength', 100)}
                    onChange={(_, v) => handleSimParamChange('focalLength', v as number)}
                    min={-500}
                    max={500}
                    step={5}
                    marks={[
                      { value: -200, label: '-200' },
                      { value: 0, label: '0' },
                      { value: 200, label: '200' }
                    ]}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {getSimParam('focalLength', 100) > 0 ? 'Converging lens' : 'Diverging lens'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Principal Plane Offset: {getSimParam('principalPlaneOffset', 0)} mm
                  </Typography>
                  <Slider
                    value={getSimParam('principalPlaneOffset', 0)}
                    onChange={(_, v) => handleSimParamChange('principalPlaneOffset', v as number)}
                    min={-50}
                    max={50}
                    step={1}
                    marks={[
                      { value: -25, label: '-25' },
                      { value: 0, label: '0' },
                      { value: 25, label: '25' }
                    ]}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Shift principal plane along optical axis
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Clear Aperture: {getSimParam('aperture', 25)} mm
                  </Typography>
                  <Slider
                    value={getSimParam('aperture', 25)}
                    onChange={(_, v) => handleSimParamChange('aperture', v as number)}
                    min={1}
                    max={50}
                    step={1}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Rays outside aperture are blocked
                  </Typography>
                </Box>
              </>
            )}
            
            {/* Mirror properties */}
            {elementType === 'mirror' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Mirror Angle: {getSimParam('angle', 45)}°
                  </Typography>
                  <Slider
                    value={getSimParam('angle', 45)}
                    onChange={(_, v) => handleSimParamChange('angle', v as number)}
                    min={0}
                    max={90}
                    step={1}
                    marks={[
                      { value: 0, label: '0°' },
                      { value: 45, label: '45°' },
                      { value: 90, label: '90°' }
                    ]}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                </Box>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Reflectivity: {Math.round(getSimParam('reflectivity', 0.99) * 100)}%
                  </Typography>
                  <Slider
                    value={getSimParam('reflectivity', 0.99)}
                    onChange={(_, v) => handleSimParamChange('reflectivity', v as number)}
                    min={0}
                    max={1}
                    step={0.01}
                    size="small"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  />
                </Box>
              </>
            )}
            
            {/* Beam splitter properties */}
            {elementType === 'beamsplitter' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Split Ratio (T/R): {Math.round(getSimParam('splitRatio', 0.5) * 100)}% / {Math.round((1 - getSimParam('splitRatio', 0.5)) * 100)}%
                  </Typography>
                  <Slider
                    value={getSimParam('splitRatio', 0.5)}
                    onChange={(_, v) => handleSimParamChange('splitRatio', v as number)}
                    min={0}
                    max={1}
                    step={0.05}
                    marks={[
                      { value: 0, label: '0/100' },
                      { value: 0.5, label: '50/50' },
                      { value: 1, label: '100/0' }
                    ]}
                    size="small"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round(v * 100)}%T`}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Surface Angle: {getSimParam('angle', 45)}°
                  </Typography>
                  <Slider
                    value={getSimParam('angle', 45)}
                    onChange={(_, v) => handleSimParamChange('angle', v as number)}
                    min={0}
                    max={90}
                    step={1}
                    marks={[
                      { value: 0, label: '0°' },
                      { value: 45, label: '45°' },
                      { value: 90, label: '90°' }
                    ]}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" color="text.secondary">
                    45° reflects horizontal rays vertically (90° deflection)
                  </Typography>
                </Box>
              </>
            )}
            
            {/* Dichroic properties */}
            {elementType === 'dichroic' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Cutoff Wavelength: {getSimParam('cutoffWavelength', 510)} nm
                  </Typography>
                  <Slider
                    value={getSimParam('cutoffWavelength', 510)}
                    onChange={(_, v) => handleSimParamChange('cutoffWavelength', v as number)}
                    min={400}
                    max={700}
                    step={5}
                    size="small"
                    valueLabelDisplay="auto"
                    sx={{
                      '& .MuiSlider-track': {
                        background: 'linear-gradient(to right, violet, blue, cyan, green, yellow, orange, red)'
                      }
                    }}
                  />
                </Box>
              </>
            )}
            
            {/* Source properties (laser/LED) */}
            {(elementType === 'laser' || elementType === 'led') && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Wavelength: {getSimParam('wavelength', 532)} nm
                  </Typography>
                  <Slider
                    value={getSimParam('wavelength', 532)}
                    onChange={(_, v) => handleSimParamChange('wavelength', v as number)}
                    min={380}
                    max={780}
                    step={5}
                    size="small"
                    valueLabelDisplay="auto"
                    sx={{
                      '& .MuiSlider-track': {
                        background: 'linear-gradient(to right, violet, blue, cyan, green, yellow, orange, red)'
                      }
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Beam Diameter: {getSimParam('beamDiameter', 2)} mm
                  </Typography>
                  <Slider
                    value={getSimParam('beamDiameter', 2)}
                    onChange={(_, v) => handleSimParamChange('beamDiameter', v as number)}
                    min={0.5}
                    max={20}
                    step={0.5}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                </Box>
                {elementType === 'led' && (
                  <Box>
                    <Typography variant="body2" gutterBottom>
                      Divergence: {getSimParam('divergence', 30)}°
                    </Typography>
                    <Slider
                      value={getSimParam('divergence', 30)}
                      onChange={(_, v) => handleSimParamChange('divergence', v as number)}
                      min={0}
                      max={60}
                      step={1}
                      size="small"
                      valueLabelDisplay="auto"
                    />
                  </Box>
                )}
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Ray Count: {getSimParam('rayCount', 5)}
                  </Typography>
                  <Slider
                    value={getSimParam('rayCount', 5)}
                    onChange={(_, v) => handleSimParamChange('rayCount', v as number)}
                    min={1}
                    max={20}
                    step={1}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                </Box>
              </>
            )}
            
            {/* Aperture properties */}
            {elementType === 'aperture' && (
              <Box>
                <Typography variant="body2" gutterBottom>
                  Aperture Diameter: {getSimParam('aperture', 5)} mm
                </Typography>
                <Slider
                  value={getSimParam('aperture', 5)}
                  onChange={(_, v) => handleSimParamChange('aperture', v as number)}
                  min={0.01}
                  max={25}
                  step={0.1}
                  size="small"
                  valueLabelDisplay="auto"
                />
              </Box>
            )}
            
            {/* Filter properties */}
            {elementType === 'filter' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Transmission: {Math.round(getSimParam('transmission', 0.5) * 100)}%
                  </Typography>
                  <Slider
                    value={getSimParam('transmission', 0.5)}
                    onChange={(_, v) => handleSimParamChange('transmission', v as number)}
                    min={0}
                    max={1}
                    step={0.05}
                    size="small"
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                  />
                </Box>
                {getSimParam('bandpassCenter', 0) > 0 && (
                  <>
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Center Wavelength: {getSimParam('bandpassCenter', 525)} nm
                      </Typography>
                      <Slider
                        value={getSimParam('bandpassCenter', 525)}
                        onChange={(_, v) => handleSimParamChange('bandpassCenter', v as number)}
                        min={400}
                        max={700}
                        step={5}
                        size="small"
                        valueLabelDisplay="auto"
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Bandwidth (FWHM): {getSimParam('bandpassWidth', 50)} nm
                      </Typography>
                      <Slider
                        value={getSimParam('bandpassWidth', 50)}
                        onChange={(_, v) => handleSimParamChange('bandpassWidth', v as number)}
                        min={5}
                        max={100}
                        step={5}
                        size="small"
                        valueLabelDisplay="auto"
                      />
                    </Box>
                  </>
                )}
              </>
            )}
            
            {/* Detector properties */}
            {elementType === 'detector' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Sensor Width: {getSimParam('width', 12)} mm
                  </Typography>
                  <Slider
                    value={getSimParam('width', 12)}
                    onChange={(_, v) => handleSimParamChange('width', v as number)}
                    min={1}
                    max={50}
                    step={0.5}
                    size="small"
                    valueLabelDisplay="auto"
                  />
                </Box>
                {/* Detector Signal Plot */}
                <DetectorSignalPlot module={module} />
              </>
            )}
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Button
            variant="outlined"
            size="small"
            onClick={() => useSimulationStore.getState().runSimulation()}
            fullWidth
          >
            Run Simulation
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderAnnotationProperties = () => {
    const annotation = annotations.find(a => a.id === selectedItemId);
    if (!annotation) return null;

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Annotation Info
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Type</Typography>
                <Typography variant="body2">{annotation.type}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="textSecondary">Layer</Typography>
                <Typography variant="body2">{annotation.layer}</Typography>
              </Box>
              {annotation.text && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="textSecondary">Text</Typography>
                  <Typography variant="body2">{annotation.text}</Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Actions
            </Typography>
            <Button 
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => removeAnnotation(annotation.id)}
              size="small"
            >
              Delete
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SettingsIcon />
        Properties
      </Typography>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {selectedItemType === 'module' && renderModuleProperties()}
        {selectedItemType === 'annotation' && renderAnnotationProperties()}
      </Box>

      {/* Export Confirmation Dialog */}
      <Dialog open={metadataDialogOpen} onClose={handleCloseMetadataDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Export Setup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will export your current optical setup with the metadata you've entered above.
          </Typography>
          <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>Setup Details:</Typography>
            <Typography variant="body2"><strong>Name:</strong> {setupMetadata.name}</Typography>
            <Typography variant="body2"><strong>Author:</strong> {setupMetadata.author || 'Not specified'}</Typography>
            <Typography variant="body2"><strong>Category:</strong> {setupMetadata.category}</Typography>
            {setupMetadata.description && (
              <Typography variant="body2"><strong>Description:</strong> {setupMetadata.description}</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMetadataDialog}>Cancel</Button>
          <Button 
            onClick={handleSaveMetadata} 
            variant="contained"
            disabled={!setupMetadata.name.trim()}
          >
            Export Setup
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

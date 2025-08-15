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
  DialogActions
} from '@mui/material';
import {
  RotateRight as RotateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

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
      </Box>
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
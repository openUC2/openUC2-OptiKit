import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Chip,
  Paper
} from '@mui/material';
import {
  RotateRight as RotateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

export const PropertyPanel: React.FC = () => {
  const { 
    selectedItemId, 
    selectedItemType, 
    placedModules, 
    annotations, 
    modules,
    removeModule,
    removeAnnotation,
    rotateModule,
    updateModuleCustomText
  } = useAppStore();

  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState('');

  if (!selectedItemId || !selectedItemType) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <SettingsIcon />
          Properties
        </Typography>
        <Paper 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: 'grey.50'
          }}
        >
          <Typography variant="body2" color="textSecondary">
            Select an item to view its properties
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
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {Object.entries(module.params).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">{key}</Typography>
                    <Chip label={String(value)} size="small" variant="outlined" />
                  </Box>
                ))}
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
    </Box>
  );
};
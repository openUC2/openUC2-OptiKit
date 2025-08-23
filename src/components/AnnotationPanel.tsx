import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Paper,
  Chip,
  Tooltip,
  Button,
  Stack
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Timeline as LineIcon,
  ArrowForward as ArrowIcon,
  MoreHoriz as OpticalAxisIcon,
  TextFields as TextIcon,
  Edit as EditIcon,
  Clear as ClearAllIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

export const AnnotationPanel: React.FC = () => {
  const { 
    annotations, 
    removeAnnotation, 
    selectItem, 
    selectedItemId,
    annotationMode,
    setAnnotationMode,
    layers
  } = useAppStore();

  // Filter annotations by visible layers
  const visibleAnnotations = annotations.filter(annotation => {
    const layer = layers.find(l => l.index === annotation.layer);
    return layer && layer.visible;
  });

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'line':
        return <LineIcon fontSize="small" />;
      case 'arrow':
        return <ArrowIcon fontSize="small" />;
      case 'optical-axis':
        return <OpticalAxisIcon fontSize="small" />;
      case 'text':
        return <TextIcon fontSize="small" />;
      default:
        return <EditIcon fontSize="small" />;
    }
  };

  const getAnnotationTypeLabel = (type: string) => {
    switch (type) {
      case 'line':
        return 'Line';
      case 'arrow':
        return 'Arrow';
      case 'optical-axis':
        return 'Optical Axis';
      case 'text':
        return 'Text';
      default:
        return type;
    }
  };

  const getAnnotationDescription = (annotation: any) => {
    if (annotation.type === 'text' && annotation.text) {
      return `"${annotation.text}"`;
    } else if (annotation.points && annotation.points.length >= 2) {
      const start = annotation.points[0];
      const end = annotation.points[annotation.points.length - 1];
      return `(${start.x.toFixed(0)}, ${start.y.toFixed(0)}) → (${end.x.toFixed(0)}, ${end.y.toFixed(0)})`;
    }
    return 'Click to select';
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    if (confirm('Are you sure you want to delete this annotation?')) {
      removeAnnotation(annotationId);
    }
  };

  const handleSelectAnnotation = (annotationId: string) => {
    selectItem(annotationId, 'annotation');
  };

  const handleClearAll = () => {
    if (annotations.length === 0) return;
    
    if (confirm(`Are you sure you want to delete all ${annotations.length} annotations? This action cannot be undone.`)) {
      annotations.forEach(annotation => removeAnnotation(annotation.id));
    }
  };

  const getCurrentModeIcon = () => {
    switch (annotationMode) {
      case 'line':
        return <LineIcon />;
      case 'arrow':
        return <ArrowIcon />;
      case 'optical-axis':
        return <OpticalAxisIcon />;
      case 'text':
        return <TextIcon />;
      default:
        return null;
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <EditIcon />
        Annotations
      </Typography>

      {/* Drawing Mode Status */}
      {annotationMode !== 'none' && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            {getCurrentModeIcon()}
            <Typography variant="body2" fontWeight="bold" color="primary">
              Drawing Mode: {getAnnotationTypeLabel(annotationMode)}
            </Typography>
          </Box>
          <Typography variant="caption" color="textSecondary">
            Click on the canvas to start drawing. Click again to finish.
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Button 
              size="small" 
              onClick={() => setAnnotationMode('none')}
              variant="outlined"
            >
              Exit Drawing Mode
            </Button>
          </Box>
        </Paper>
      )}

      {/* Drawing Tools */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Drawing Tools
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Tooltip title="Draw Line">
            <Button
              size="small"
              variant={annotationMode === 'line' ? 'contained' : 'outlined'}
              onClick={() => setAnnotationMode(annotationMode === 'line' ? 'none' : 'line')}
              startIcon={<LineIcon />}
            >
              Line
            </Button>
          </Tooltip>
          <Tooltip title="Draw Arrow">
            <Button
              size="small"
              variant={annotationMode === 'arrow' ? 'contained' : 'outlined'}
              onClick={() => setAnnotationMode(annotationMode === 'arrow' ? 'none' : 'arrow')}
              startIcon={<ArrowIcon />}
            >
              Arrow
            </Button>
          </Tooltip>
          <Tooltip title="Draw Optical Axis">
            <Button
              size="small"
              variant={annotationMode === 'optical-axis' ? 'contained' : 'outlined'}
              onClick={() => setAnnotationMode(annotationMode === 'optical-axis' ? 'none' : 'optical-axis')}
              startIcon={<OpticalAxisIcon />}
            >
              Optical
            </Button>
          </Tooltip>
          <Tooltip title="Add Text">
            <Button
              size="small"
              variant={annotationMode === 'text' ? 'contained' : 'outlined'}
              onClick={() => setAnnotationMode(annotationMode === 'text' ? 'none' : 'text')}
              startIcon={<TextIcon />}
            >
              Text
            </Button>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Annotations List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2">
            Annotations ({visibleAnnotations.length})
          </Typography>
          {annotations.length > 0 && (
            <Tooltip title="Delete all annotations">
              <IconButton 
                size="small" 
                color="error" 
                onClick={handleClearAll}
              >
                <ClearAllIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {visibleAnnotations.length === 0 ? (
          <Paper 
            sx={{ 
              p: 3, 
              textAlign: 'center', 
              bgcolor: 'grey.50',
              border: '1px dashed',
              borderColor: 'grey.300'
            }}
          >
            <EditIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
            <Typography variant="body2" color="textSecondary">
              No annotations yet
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Use the drawing tools above to add annotations to your layout
            </Typography>
          </Paper>
        ) : (
          <List dense>
            {visibleAnnotations.map((annotation, index) => (
              <ListItem
                key={annotation.id}
                sx={{
                  border: '1px solid',
                  borderColor: selectedItemId === annotation.id ? 'primary.main' : 'grey.300',
                  borderRadius: 1,
                  mb: 1,
                  bgcolor: selectedItemId === annotation.id ? 'primary.50' : 'background.paper',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: selectedItemId === annotation.id ? 'primary.100' : 'grey.50'
                  }
                }}
                onClick={() => handleSelectAnnotation(annotation.id)}
              >
                <Box sx={{ mr: 1, color: 'primary.main' }}>
                  {getAnnotationIcon(annotation.type)}
                </Box>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {getAnnotationTypeLabel(annotation.type)}
                      </Typography>
                      <Chip 
                        label={`Layer ${annotation.layer}`} 
                        size="small" 
                        variant="outlined"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="textSecondary">
                      {getAnnotationDescription(annotation)}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Delete annotation">
                    <IconButton
                      edge="end"
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAnnotation(annotation.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Help Text */}
      <Paper sx={{ p: 2, mt: 2, bgcolor: 'info.50', border: '1px solid', borderColor: 'info.200' }}>
        <Typography variant="caption" color="textSecondary">
          <strong>Tips:</strong> Click on annotations to select them. Selected annotations can be moved by dragging. 
          Right-click on annotations in the canvas for more options.
        </Typography>
      </Paper>
    </Box>
  );
};
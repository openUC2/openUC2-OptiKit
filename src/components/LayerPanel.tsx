import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Fab,
  Chip,
  Paper,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Checkbox,
  ListItemIcon,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Layers as LayersIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

export const LayerPanel: React.FC = () => {
  const { 
    layers, 
    activeLayerId, 
    setActiveLayer, 
    addLayer, 
    removeLayer,
    toggleLayerVisibility,
    setAllLayersVisibility
  } = useAppStore();

  const [viewMode, setViewMode] = React.useState<'single' | 'all' | 'custom'>('single');

  const handleAddLayer = () => {
    const layerName = `Layer ${layers.length}`;
    addLayer(layerName);
  };

  const handleRemoveLayer = (layerId: string) => {
    if (layers.length > 1) {
      removeLayer(layerId);
    }
  };

  const handleViewModeChange = (newMode: string) => {
    setViewMode(newMode as 'single' | 'all' | 'custom');
    
    if (newMode === 'single') {
      // Show only active layer
      setAllLayersVisibility(false);
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer) {
        toggleLayerVisibility(activeLayer.id, true);
      }
    } else if (newMode === 'all') {
      // Show all layers
      setAllLayersVisibility(true);
    }
    // For 'custom', user can manually toggle individual layers
  };

  const handleLayerVisibilityToggle = (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (layer) {
      toggleLayerVisibility(layerId, !layer.visible);
      if (viewMode !== 'custom') {
        setViewMode('custom');
      }
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LayersIcon />
          Layers
        </Typography>
        <Fab 
          size="small"
          color="primary"
          onClick={handleAddLayer}
          aria-label="Add Layer"
        >
          <AddIcon />
        </Fab>
      </Box>
      
      {/* View Mode Selector */}
      <Box sx={{ mb: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel>View Mode</InputLabel>
          <Select
            value={viewMode}
            label="View Mode"
            onChange={(e) => handleViewModeChange(e.target.value)}
          >
            <MenuItem value="single">Single Layer</MenuItem>
            <MenuItem value="all">All Layers</MenuItem>
            <MenuItem value="custom">Custom Selection</MenuItem>
          </Select>
        </FormControl>
      </Box>
      
      <Divider sx={{ mb: 2 }} />
      
      {/* Layer List */}
      <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto' }}>
        <List disablePadding>
          {layers.map((layer) => (
            <ListItem 
              key={layer.id}
              disablePadding
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Tooltip title={layer.visible ? "Hide Layer" : "Show Layer"}>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleLayerVisibilityToggle(layer.id)}
                    >
                      {layer.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    </IconButton>
                  </Tooltip>
                  {layers.length > 1 && (
                    <Tooltip title="Delete Layer">
                      <IconButton 
                        edge="end" 
                        aria-label="delete"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveLayer(layer.id);
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              }
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Checkbox
                  edge="start"
                  checked={layer.visible}
                  onChange={() => handleLayerVisibilityToggle(layer.id)}
                  size="small"
                />
              </ListItemIcon>
              <ListItemButton
                selected={activeLayerId === layer.id}
                onClick={() => setActiveLayer(layer.id)}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  my: 0.5,
                  opacity: layer.visible ? 1 : 0.5,
                  '&.Mui-selected': {
                    bgcolor: 'primary.light',
                    color: 'primary.contrastText',
                    '&:hover': {
                      bgcolor: 'primary.main',
                    },
                  },
                }}
              >
                <ListItemText 
                  primary={layer.name}
                  secondary={
                    <Chip 
                      label={`Z: ${layer.index}`}
                      size="small"
                      variant="outlined"
                      sx={{ 
                        height: 20,
                        fontSize: '0.65rem',
                        mt: 0.5,
                        bgcolor: activeLayerId === layer.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                        borderColor: activeLayerId === layer.id ? 'rgba(255,255,255,0.5)' : 'grey.400',
                        color: activeLayerId === layer.id ? 'inherit' : 'text.secondary',
                      }}
                    />
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};
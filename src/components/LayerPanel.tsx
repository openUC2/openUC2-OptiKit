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
  Paper
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Layers as LayersIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

export const LayerPanel: React.FC = () => {
  const { 
    layers, 
    activeLayerId, 
    setActiveLayer, 
    addLayer, 
    removeLayer 
  } = useAppStore();

  const handleAddLayer = () => {
    const layerName = `Layer ${layers.length}`;
    addLayer(layerName);
  };

  const handleRemoveLayer = (layerId: string) => {
    if (layers.length > 1) {
      removeLayer(layerId);
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
      
      {/* Layer List */}
      <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto' }}>
        <List disablePadding>
          {layers.map((layer) => (
            <ListItem 
              key={layer.id}
              disablePadding
              secondaryAction={
                layers.length > 1 && (
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
                )
              }
            >
              <ListItemButton
                selected={activeLayerId === layer.id}
                onClick={() => setActiveLayer(layer.id)}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  my: 0.5,
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
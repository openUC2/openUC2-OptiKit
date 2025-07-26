import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Typography,
  Chip,
  InputAdornment,
  Paper
} from '@mui/material';
import {
  Search as SearchIcon,
  DragIndicator as DragIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';

export const PartLibrary: React.FC = () => {
  const { modules, loadModules } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const longPressTimeout = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const filteredModules = modules.filter(module => {
    try {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'all' || module.group === selectedGroup;
    return matchesSearch && matchesGroup;
  } catch (error) {
    console.error('Error filtering modules:', error);
    return false; // Skip this module if there's an error
  }
});

  const groups = ['all', ...new Set(modules.map(m => m.group))];

  const handleDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData('moduleId', moduleId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Touch support for mobile devices with long press
  const handleTouchStart = (e: React.TouchEvent, moduleId: string) => {
    const target = e.currentTarget as HTMLElement;
    // Start long press timer
    longPressTimeout.current = window.setTimeout(() => {
      isDragging.current = true;
      target.dataset.moduleId = moduleId;
      // Visual feedback
      target.style.opacity = '0.7';
      target.style.transform = 'scale(0.95)';
    }, 350); // 350ms long press
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return; // Only drag after long press
    e.preventDefault();
    const touch = e.touches[0];
    const target = e.currentTarget as HTMLElement;
    
    // Check if we're over the canvas
    const canvasElement = document.querySelector('.layout-canvas');
    if (canvasElement) {
      const rect = canvasElement.getBoundingClientRect();
      const isOverCanvas = touch.clientX >= rect.left && 
                          touch.clientX <= rect.right && 
                          touch.clientY >= rect.top && 
                          touch.clientY <= rect.bottom;
      if (isOverCanvas) {
        target.style.opacity = '0.5';
      } else {
        target.style.opacity = '0.7';
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimeout.current) window.clearTimeout(longPressTimeout.current);
    const target = e.currentTarget as HTMLElement;
    if (!isDragging.current) return; // Only drop if drag was started
    isDragging.current = false;
    e.preventDefault();
    const touch = e.changedTouches[0];
    const moduleId = target.dataset.moduleId;
    // Reset visual feedback
    target.style.opacity = '1';
    target.style.transform = 'scale(1)';
    if (!moduleId) return;
    // Check if we're over the canvas
    const canvasElement = document.querySelector('.layout-canvas');
    if (canvasElement) {
      const rect = canvasElement.getBoundingClientRect();
      const isOverCanvas = touch.clientX >= rect.left && 
                          touch.clientX <= rect.right && 
                          touch.clientY >= rect.top && 
                          touch.clientY <= rect.bottom;
      if (isOverCanvas) {
        // Simulate a drop event
        const dropEvent = new CustomEvent('mobile-drop', {
          detail: {
            moduleId,
            x: touch.clientX,
            y: touch.clientY
          }
        });
        canvasElement.dispatchEvent(dropEvent);
      }
    }
  };

  const handleTouchCancel = () => {
    if (longPressTimeout.current) window.clearTimeout(longPressTimeout.current);
    isDragging.current = false;
  };

  const renderModuleTile = (module: ModuleDefinition) => {
    return (
      <Card
        key={module.id}
        sx={{
          cursor: 'grab',
          position: 'relative',
          height: 120,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 3,
          },
          '&:active': {
            cursor: 'grabbing',
            transform: 'scale(0.95)',
          },
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, module.id)}
        onTouchStart={(e) => handleTouchStart(e, module.id)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <CardContent sx={{ p: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              minHeight: 60,
              borderRadius: 1,
              bgcolor: 'grey.50',
              mb: 1,
            }}
          >
            {module.thumbnail ? (
              <img 
                src={module.thumbnail} 
                alt={module.name}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  borderRadius: 4 
                }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  bgcolor: module.color || 'grey.300',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                }}
              >
                {module.footprint.width} × {module.footprint.height}
              </Box>
            )}
            <DragIcon 
              sx={{ 
                position: 'absolute', 
                top: 2, 
                right: 2, 
                fontSize: 16, 
                color: 'grey.400' 
              }} 
            />
          </Box>
          
          <Typography 
            variant="caption" 
            sx={{ 
              fontWeight: 500, 
              lineHeight: 1.2, 
              mb: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {module.name}
          </Typography>
          
          <Chip 
            label={`${module.footprint.width}×${module.footprint.height}`}
            size="small"
            variant="outlined"
            sx={{ 
              height: 20, 
              fontSize: '0.65rem',
              alignSelf: 'flex-start',
            }}
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, borderRadius: 0 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
          Part Library
        </Typography>
        
        <TextField
          fullWidth
          size="small"
          placeholder="Search parts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        
        <FormControl fullWidth size="small">
          <InputLabel>Group</InputLabel>
          <Select
            value={selectedGroup}
            label="Group"
            onChange={(e) => setSelectedGroup(e.target.value)}
          >
            {groups.map(group => (
              <MenuItem key={group} value={group}>
                {group === 'all' ? 'All Groups' : group.charAt(0).toUpperCase() + group.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 2,
          }}
        >
          {filteredModules.map(renderModuleTile)}
        </Box>
        
        {filteredModules.length === 0 && (
          <Paper 
            sx={{ 
              p: 3, 
              textAlign: 'center', 
              mt: 2,
              bgcolor: 'grey.50' 
            }}
          >
            <Typography variant="body2" color="textSecondary">
              No parts found matching "{searchTerm}"
            </Typography>
          </Paper>
        )}
      </Box>
      
      {/* Footer */}
      <Paper elevation={1} sx={{ p: 1.5, borderRadius: 0 }}>
        <Typography 
          variant="caption" 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            color: 'text.secondary' 
          }}
        >
          <DragIcon fontSize="small" />
          Drag parts onto the canvas to place them
        </Typography>
      </Paper>
    </Box>
  );
};
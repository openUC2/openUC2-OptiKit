import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import { ElementShape } from './PhysicalModuleOverlay';
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
  Paper,
  Button,
  Divider,
  Tabs,
  Tab,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Search as SearchIcon,
  DragIndicator as DragIcon,
  Add as AddIcon,
  Image as ImageIcon,
  Biotech as PhysicsIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import { loadThumbnailManifest, defaultOrientation, thumbnailUrl, type ThumbnailManifest } from '../utils/moduleThumbnails';
import { ModuleCreationWizard } from './ModuleCreationWizard';
import { MODULE_SIMULATION_MODELS } from '../types';
import type { ModuleDefinition, OpticalElement, OpticalElementType } from '../types';

// ---------------------------------------------------------------------------
// Mini Konva icon – renders the physics shape of a module at tile size
// ---------------------------------------------------------------------------

interface MiniPhysicalIconProps {
  module: ModuleDefinition;
  size?: number;
}

const MiniPhysicalIcon: React.FC<MiniPhysicalIconProps> = ({ module, size = 58 }) => {
  const model = MODULE_SIMULATION_MODELS[module.id];
  if (!model || model.elementType === 'compound') {
    // Fallback: coloured rectangle for unknown / compound modules
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          background: module.color || '#bdc3c7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        {module.footprint.width}×{module.footprint.height}
      </div>
    );
  }

  // Build a mock OpticalElement centred at (0,0) in simulation space
  const mockEl: OpticalElement = {
    id: `mini-${module.id}`,
    moduleInstanceId: `mini-${module.id}`,
    type: model.elementType as OpticalElementType,
    position: { x: 0, y: 0 },
    rotation: model.rotationOffset ?? 0,
    params: { ...model.defaultParams } as OpticalElement['params'],
  };

  // gridCellSize controls how many pixels per 50 mm of simulation space.
  // Using size * 0.7 makes the aperture (~25 mm) fill ≈35 % of the tile.
  const miniGridCellSize = size * 0.7;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Stage width={size} height={size} style={{ borderRadius: 4, display: 'block' }}>
      <Layer>
        {/* Background */}
        <Rect x={0} y={0} width={size} height={size} fill="#f0f4f8" cornerRadius={4} />
        {/* Centre-offset group so (0,0) in sim-space maps to the tile centre */}
        <Group x={cx} y={cy}>
          <ElementShape el={mockEl} gridCellSize={miniGridCellSize} cellPx={size} />
        </Group>
      </Layer>
    </Stage>
  );
};

export const PartLibrary: React.FC = () => {
  const { modules, loadModules, placeModule, placedModules, layers, activeLayerId } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState(0); // 0 for all modules, 1 for user created
  const [iconMode, setIconMode] = useState<'svg' | 'canvas'>('svg'); // icon display mode
  const [thumbManifest, setThumbManifest] = useState<ThumbnailManifest>({});
  const longPressTimeout = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Load the pre-rendered GLB thumbnail manifest (falls back to SVG when absent)
  useEffect(() => {
    loadThumbnailManifest().then(setThumbManifest);
  }, []);

  useEffect(() => {
    loadModules();
    
    // Load external sources from GitHub on each page load
    const loadExternalSources = async () => {
      try {
        // Load modules from external GitHub repository
        const externalResponse = await fetch('https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/parts/parts.csv');
        if (externalResponse.ok) {
          await externalResponse.text();
          console.log('External sources loaded successfully');
          // The CSV will be processed by the existing loadModules function
        }
      } catch (error) {
        console.warn('Failed to load external sources:', error);
      }
    };
    
    loadExternalSources();
    
    // Listen for successful module placement feedback
    const handlePlacementSuccess = () => {
      // Visual feedback can be added here if needed
      console.log('Module placed successfully');
    };
    
    window.addEventListener('module-placed-success', handlePlacementSuccess);
    
    return () => {
      window.removeEventListener('module-placed-success', handlePlacementSuccess);
    };
  }, [loadModules]);

  const filteredModules = modules.filter(module => {
    try {
      const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = selectedGroup === 'all' || module.group === selectedGroup;
      
      // Filter by tab: 0 = all parts (non-user-created), 1 = user created only
      // More robust check for user-created modules
      const isUserCreated = Boolean(
        module.defaultParams && 
        typeof module.defaultParams === 'object' && 
        (module.defaultParams as any)?.isCustom === true
      );
      
      // All Parts tab shows non-user-created modules, User Created tab shows user-created modules
      const matchesTab = activeTab === 0 ? !isUserCreated : isUserCreated;
      
      return matchesSearch && matchesGroup && matchesTab;
    } catch (error) {
      console.error('Error filtering modules:', error, module);
      // If there's an error, default to showing in "All Parts" tab (treat as non-user-created)
      return activeTab === 0;
    }
  });

  const groups = ['all', ...new Set(modules.map(m => m.group))];

  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  const currentLayerIndex = activeLayer?.index ?? 0;

  // Double-click / tap to place module at the next free grid position
  const handleQuickPlace = (moduleId: string) => {
    // Find the center of the visible grid area – just pick the next free spot
    const occupied = new Set(
      placedModules.map(m => `${m.position.x},${m.position.y}`)
    );
    // Try center-first spiral: 5,5 → 4,5 → 5,4 → 6,5 → …
    for (let r = 0; r < 10; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = 5 + dx;
          const y = 5 + dy;
          if (x >= 0 && x < 10 && y >= 0 && y < 10 && !occupied.has(`${x},${y}`)) {
            placeModule(moduleId, { x, y }, currentLayerIndex);
            if ('vibrate' in navigator) navigator.vibrate(30);
            return;
          }
        }
      }
    }
    // Fallback: place at 0,0
    placeModule(moduleId, { x: 0, y: 0 }, currentLayerIndex);
  };

  const handleDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData('moduleId', moduleId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Touch support for mobile devices with long press
  const handleTouchStart = (e: React.TouchEvent, moduleId: string) => {
    const target = e.currentTarget as HTMLElement;
    // Prevent default to avoid scrolling
    e.preventDefault();
    
    // Start long press timer
    longPressTimeout.current = window.setTimeout(() => {
      isDragging.current = true;
      target.dataset.moduleId = moduleId;
      // Visual feedback with better mobile styling
      target.style.opacity = '0.8';
      target.style.transform = 'scale(1.05)';
      target.style.zIndex = '1000';
      target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
      
      // Add haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 300); // Reduced to 300ms for better responsiveness
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) {
      // Clear timeout if moving before long press completes
      if (longPressTimeout.current) {
        window.clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
      return;
    }
    
    e.preventDefault();
    const touch = e.touches[0];
    const target = e.currentTarget as HTMLElement;
    
    // Update position to follow finger
    const rect = target.getBoundingClientRect();
    target.style.position = 'fixed';
    target.style.left = `${touch.clientX - rect.width / 2}px`;
    target.style.top = `${touch.clientY - rect.height / 2}px`;
    target.style.pointerEvents = 'none';
    
    // Check if we're over the canvas
    const konvaContent = document.querySelector('.konvajs-content');
    const canvasElement = konvaContent?.parentElement ?? konvaContent;
    if (canvasElement) {
      const canvasRect = canvasElement.getBoundingClientRect();
      const isOverCanvas = touch.clientX >= canvasRect.left && 
                          touch.clientX <= canvasRect.right && 
                          touch.clientY >= canvasRect.top && 
                          touch.clientY <= canvasRect.bottom;
      if (isOverCanvas) {
        target.style.opacity = '0.6';
        target.style.boxShadow = '0 8px 25px rgba(46, 204, 113, 0.4)';
      } else {
        target.style.opacity = '0.8';
        target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimeout.current) {
      window.clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    
    const target = e.currentTarget as HTMLElement;
    
    if (!isDragging.current) return;
    
    isDragging.current = false;
    e.preventDefault();
    
    const touch = e.changedTouches[0];
    const moduleId = target.dataset.moduleId;
    
    // Reset visual feedback
    target.style.opacity = '1';
    target.style.transform = 'scale(1)';
    target.style.position = 'relative';
    target.style.left = 'auto';
    target.style.top = 'auto';
    target.style.zIndex = 'auto';
    target.style.boxShadow = '';
    target.style.pointerEvents = 'auto';
    
    if (!moduleId) return;
    
    // Determine whether the touch ended over the canvas area
    const konvaContent = document.querySelector('.konvajs-content');
    const canvasElement = konvaContent?.parentElement ?? konvaContent;
    const isOverCanvas = (() => {
      if (!canvasElement) return true; // fallback: attempt drop anyway
      const rect = canvasElement.getBoundingClientRect();
      return (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      );
    })();

    if (isOverCanvas) {
      // Provide haptic feedback for successful drop
      if ('vibrate' in navigator) {
        navigator.vibrate([30, 30, 30]);
      }
      // Dispatch on window so GridCanvas always receives it regardless of DOM structure
      window.dispatchEvent(new CustomEvent('mobile-drop', {
        detail: { moduleId, x: touch.clientX, y: touch.clientY },
      }));
    }
  };

  const handleTouchCancel = (e: React.TouchEvent) => {
    if (longPressTimeout.current) {
      window.clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
    
    const target = e.currentTarget as HTMLElement;
    isDragging.current = false;
    
    // Reset visual state
    target.style.opacity = '1';
    target.style.transform = 'scale(1)';
    target.style.position = 'relative';
    target.style.left = 'auto';
    target.style.top = 'auto';
    target.style.zIndex = 'auto';
    target.style.boxShadow = '';
    target.style.pointerEvents = 'auto';
  };

  const renderModuleTile = (module: ModuleDefinition) => {
    // Prefer a pre-rendered GLB thumbnail (default orientation), else the SVG.
    const glbOrient = defaultOrientation(thumbManifest, module.id);
    const imgSrc = (glbOrient ? thumbnailUrl(module.id, glbOrient) : null) || module.thumbnail;
    return (
      <Card
        key={module.id}
        sx={{
          cursor: 'grab',
          position: 'relative',
          height: { xs: 90, sm: 100, md: 110 },
          transition: 'all 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'manipulation',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 3,
          },
          '&:active': {
            cursor: 'grabbing',
            transform: 'scale(0.98)',
          },
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, module.id)}
        onDoubleClick={() => handleQuickPlace(module.id)}
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
            {iconMode === 'canvas' ? (
              <MiniPhysicalIcon module={module} size={58} />
            ) : imgSrc ? (
              <img
                src={imgSrc}
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
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography 
              variant="caption" 
              sx={{ 
                fontWeight: 500, 
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0
              }}
            >
              {module.name}
            </Typography>
            
            <Chip 
              label={`${module.footprint.width}×${module.footprint.height}`}
              size="small"
              variant="outlined"
              sx={{ 
                height: 18, 
                fontSize: '0.6rem',
                flexShrink: 0,
              }}
            />
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box data-tour="part-library" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, borderRadius: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 500, flex: 1 }}>
            Part Library
          </Typography>
          <Tooltip title={iconMode === 'svg' ? 'Switch to physics icons' : 'Switch to SVG thumbnails'}>
            <IconButton
              size="small"
              onClick={() => setIconMode(m => m === 'svg' ? 'canvas' : 'svg')}
              color={iconMode === 'canvas' ? 'primary' : 'default'}
            >
              {iconMode === 'svg' ? <PhysicsIcon fontSize="small" /> : <ImageIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
        
        {/* Tabs for All Parts vs User Created */}
        <Tabs 
          value={activeTab} 
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ mb: 2 }}
          variant="fullWidth"
        >
          <Tab label="All Parts" />
          <Tab label="User Created" />
        </Tabs>
        
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
        
        <Divider sx={{ my: 2 }} />
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setShowWizard(true)}
          fullWidth
          sx={{ mb: 1 }}
        >
          Create Custom Module
        </Button>
      </Paper>
      
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(100px, 1fr))', sm: 'repeat(auto-fill, minmax(120px, 1fr))', md: 'repeat(auto-fill, minmax(130px, 1fr))' },
            gap: 1.5,
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
          Drag or double-tap parts to place them
        </Typography>
      </Paper>
      
      <ModuleCreationWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onModuleCreated={(module) => {
          // Module created successfully - reload modules to show new user-created module
          loadModules();
          // Switch to User Created tab to show the new module
          setActiveTab(1);
          console.log('Custom module created:', module);
        }}
      />
    </Box>
  );
};
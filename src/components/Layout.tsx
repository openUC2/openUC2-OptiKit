import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Box, 
  Drawer, 
  Tabs, 
  Tab, 
  IconButton, 
  Paper,
  Tooltip,
  useTheme,
  useMediaQuery 
} from '@mui/material';
import {
  Inventory as PartsIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon
} from '@mui/icons-material';
import { PartLibrary } from './PartLibrary';
import { GridCanvas } from './GridCanvas';
import { LayerPanel } from './LayerPanel';
import { PropertyPanel } from './PropertyPanel';
import { BOMPanel } from './BOMPanel';
import { AnnotationPanel } from './AnnotationPanel';
import { ChatPanel } from './ChatPanel';
import { SimulationPanel } from './SimulationPanel';
import { Toolbar } from './Toolbar';
import { Tutorial } from './Tutorial';
import { useAppStore } from '../stores/appStore';

export const Layout: React.FC = () => {
  const theme = useTheme();
  // md = 900 px; sm = 600 px
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));  // tablets portrait + phones
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));   // phones only
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(!isMobile);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(!isMobile);
  const { activeRightTab, setActiveRightTab, selectItem, setActiveLayer } = useAppStore();
  const location = useLocation();

  // Restore selection and active layer from query params (e.g. when navigating back from 3D)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selectedId = params.get('selected');
    const layerId = params.get('layer');
    if (selectedId) selectItem(selectedId, 'module');
    if (layerId) setActiveLayer(layerId);
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Collapse both panels automatically when the screen becomes narrow
    if (isMobile) {
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    } else {
      setLeftSidebarOpen(true);
      setRightSidebarOpen(true);
    }
  }, [isMobile]);

  const sidebarWidth = isPhone
    ? Math.min(300, window.innerWidth * 0.9)
    : isMobile
    ? Math.min(350, window.innerWidth * 0.85)
    : 400;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <Toolbar />
      
      {/* Mobile Controls bar – shown on screens narrower than md (< 900 px) */}
      {isMobile && (
        <Paper 
          elevation={1} 
          sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            p: 1, 
            borderRadius: 0,
            bgcolor: 'primary.main',
            color: 'white'
          }}
        >
          <Tooltip title={leftSidebarOpen ? 'Close parts library' : 'Open parts library'}>
            <IconButton 
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              sx={{ 
                color: leftSidebarOpen ? 'rgba(255,255,255,0.5)' : 'white',
                minWidth: 44,
                minHeight: 44,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' }
            }}
            aria-label="Toggle parts library"
          >
            <PartsIcon />
          </IconButton>
          </Tooltip>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={rightSidebarOpen ? 'Close settings panel' : 'Open settings panel'}>
            <IconButton 
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              sx={{ 
                color: rightSidebarOpen ? 'rgba(255,255,255,0.5)' : 'white',
                minWidth: 44,
                minHeight: 44,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' }
              }}
              aria-label="Toggle settings panel"
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Paper>
      )}
      
      {/* Main Layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Left Sidebar - Parts Library */}
        <Drawer
          variant={isMobile ? "temporary" : "persistent"}
          anchor="left"
          open={leftSidebarOpen}
          onClose={() => setLeftSidebarOpen(false)}
          sx={{
            width: sidebarWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              position: 'relative',
              height: '100%',
              top: 'auto',
              borderRight: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          <PartLibrary />
        </Drawer>
        
        {/* Canvas + panel toggle buttons */}
        <Box 
          component="main"
          data-tour="canvas"
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: 'background.default',
            position: 'relative',
          }}
        >
          {/* Left panel toggle – visible on all screen sizes */}
          <Tooltip title={leftSidebarOpen ? 'Collapse parts library' : 'Expand parts library'} placement="right">
            <IconButton
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              size="small"
              sx={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
                bgcolor: 'primary.main',
                color: 'white',
                borderRadius: '0 6px 6px 0',
                width: 18,
                height: 52,
                minWidth: 0,
                p: 0,
                '&:hover': { bgcolor: 'primary.dark' },
                boxShadow: 2,
              }}
              aria-label="Toggle parts library"
            >
              {leftSidebarOpen ? <ChevronLeftIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>

          <GridCanvas />

          {/* Right panel toggle – visible on all screen sizes */}
          <Tooltip title={rightSidebarOpen ? 'Collapse settings panel' : 'Expand settings panel'} placement="left">
            <IconButton
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              size="small"
              sx={{
                position: 'absolute',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
                bgcolor: 'primary.main',
                color: 'white',
                borderRadius: '6px 0 0 6px',
                width: 18,
                height: 52,
                minWidth: 0,
                p: 0,
                '&:hover': { bgcolor: 'primary.dark' },
                boxShadow: 2,
              }}
              aria-label="Toggle settings panel"
            >
              {rightSidebarOpen ? <ChevronRightIcon sx={{ fontSize: 14 }} /> : <ChevronLeftIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        </Box>
        
        {/* Right Sidebar - Layers, Properties, BOM */}
        <Drawer
          variant={isMobile ? "temporary" : "persistent"}
          anchor="right"
          open={rightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
          sx={{
            width: sidebarWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
              position: 'relative',
              height: '100%',
              top: 'auto',
              borderLeft: `1px solid ${theme.palette.divider}`,
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Tabs 
              value={activeRightTab} 
              onChange={(_, newValue) => setActiveRightTab(newValue)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{ 
                borderBottom: 1, 
                borderColor: 'divider',
                minHeight: 48,
                '& .MuiTab-root': {
                  minWidth: 'auto',
                  px: 2,
                }
              }}
            >
              <Tab label="Layers" value="layers" data-tour="layers-tab" />
              <Tab label="Properties" value="properties" data-tour="properties-tab" />
              <Tab label="Simulation" value="simulation" data-tour="simulation-tab" />
              <Tab label="Annotations" value="annotations" data-tour="annotations-tab" />
              <Tab label="BOM/Quote" value="bom" data-tour="bom-tab" />
              <Tab label="Chat" value="chat" data-tour="chat-tab" />
            </Tabs>
            
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {activeRightTab === 'layers' && <LayerPanel />}
              {activeRightTab === 'properties' && <PropertyPanel />}
              {activeRightTab === 'simulation' && <SimulationPanel />}
              {activeRightTab === 'annotations' && <AnnotationPanel />}
              {activeRightTab === 'bom' && <BOMPanel />}
              {activeRightTab === 'chat' && <ChatPanel />}
            </Box>
          </Box>
        </Drawer>
      </Box>
      
      {/* Tutorial Component */}
      <Tutorial />
    </Box>
  );
};
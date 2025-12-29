import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Drawer, 
  Tabs, 
  Tab, 
  IconButton, 
  Paper,
  useTheme,
  useMediaQuery 
} from '@mui/material';
import {
  Inventory as PartsIcon,
  Settings as SettingsIcon
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
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(!isMobile);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(!isMobile);
  const { activeRightTab, setActiveRightTab } = useAppStore();
  const [showMobileWarning, setShowMobileWarning] = useState(false);

  useEffect(() => {
    // On mobile, close sidebars by default for better canvas space
    if (isMobile) {
      setLeftSidebarOpen(false);
      setRightSidebarOpen(false);
    } else {
      // Always show sidebars when switching to desktop
      setLeftSidebarOpen(true);
      setRightSidebarOpen(true);
    }
  }, [isMobile]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setShowMobileWarning(mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const sidebarWidth = isMobile ? Math.min(350, window.innerWidth * 0.85) : 400;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <Toolbar />
      
      {/* Mobile Warning Banner */}
      {showMobileWarning && (
        <Box sx={{
          background: '#e74c3c',
          color: 'white',
          padding: '12px',
          textAlign: 'center',
          fontWeight: 'bold',
          zIndex: 1000,
        }}>
          ⚠️ This application is currently not supported on smartphones. For the best experience, please use a desktop or tablet.<br />
          <button style={{ marginTop: 8, background: 'white', color: '#e74c3c', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowMobileWarning(false)}>
            Dismiss
          </button>
        </Box>
      )}
      
      {/* Mobile Controls */}
      {isMobile && (
        <Paper 
          elevation={1} 
          sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            p: 1.5, 
            borderRadius: 0,
            bgcolor: 'primary.main',
            color: 'white'
          }}
        >
          <IconButton 
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            sx={{ 
              color: 'white',
              minWidth: 48,
              minHeight: 48,
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            <PartsIcon />
          </IconButton>
          <IconButton 
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            sx={{ 
              color: 'white',
              minWidth: 48,
              minHeight: 48,
              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            <SettingsIcon />
          </IconButton>
        </Paper>
      )}
      
      {/* Main Layout */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
        
        {/* Canvas */}
        <Box 
          component="main"
          data-tour="canvas"
          sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: 'background.default'
          }}
        >
          <GridCanvas />
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
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
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
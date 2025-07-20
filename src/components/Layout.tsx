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
import { Toolbar } from './Toolbar';

export const Layout: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activeRightTab, setActiveRightTab] = useState<'layers' | 'properties' | 'bom'>('layers');

  useEffect(() => {
    // Always show sidebars when switching to desktop
    if (!isMobile) {
      setLeftSidebarOpen(true);
      setRightSidebarOpen(true);
    }
  }, [isMobile]);

  const sidebarWidth = 300;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Toolbar */}
      <Toolbar />
      
      {/* Mobile Controls */}
      {isMobile && (
        <Paper 
          elevation={1} 
          sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            p: 1, 
            borderRadius: 0 
          }}
        >
          <IconButton 
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            color="primary"
          >
            <PartsIcon />
          </IconButton>
          <IconButton 
            onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            color="primary"
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
              <Tab label="Layers" value="layers" />
              <Tab label="Properties" value="properties" />
              <Tab label="BOM" value="bom" />
            </Tabs>
            
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {activeRightTab === 'layers' && <LayerPanel />}
              {activeRightTab === 'properties' && <PropertyPanel />}
              {activeRightTab === 'bom' && <BOMPanel />}
            </Box>
          </Box>
        </Drawer>
      </Box>
    </Box>
  );
};
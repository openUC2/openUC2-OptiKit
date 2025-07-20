import React, { useState, useEffect } from 'react';
import { PartLibrary } from './PartLibrary';
import { GridCanvas } from './GridCanvas';
import { LayerPanel } from './LayerPanel';
import { PropertyPanel } from './PropertyPanel';
import { Toolbar } from './Toolbar';
import './Layout.css';

export const Layout: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      // Always show sidebars when switching to desktop
      if (!mobile) {
        setLeftSidebarOpen(true);
        setRightSidebarOpen(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="layout">
      <div className="layout-toolbar">
        <Toolbar />
        {isMobile && (
          <div className="mobile-controls">
            <button 
              className="mobile-toggle"
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              title="Toggle Parts Library"
            >
              📦
            </button>
            <button 
              className="mobile-toggle"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              title="Toggle Layers & Properties"
            >
              ⚙️
            </button>
          </div>
        )}
      </div>
      
      <div className="layout-main">
        <div 
          className={`layout-sidebar-left ${isMobile && !leftSidebarOpen ? 'collapsed' : ''}`}
        >
          <PartLibrary />
        </div>
        
        <div className="layout-canvas">
          <GridCanvas />
        </div>
        
        <div 
          className={`layout-sidebar-right ${isMobile && !rightSidebarOpen ? 'collapsed' : ''}`}
        >
          <LayerPanel />
          <PropertyPanel />
        </div>
      </div>
    </div>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';
import './PartLibrary.css';

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
      <div
        key={module.id}
        className="module-tile"
        draggable
        onDragStart={(e) => handleDragStart(e, module.id)}
        onTouchStart={(e) => handleTouchStart(e, module.id)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        title={module.description || module.name}
      >
        <div className="module-preview">
          {module.thumbnail ? (
            <img 
              src={module.thumbnail} 
              alt={module.name}
              className="module-icon"
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div 
              className="module-fallback"
              style={{ backgroundColor: module.color }}
            >
              <div className="module-footprint">
                {module.footprint.width} × {module.footprint.height}
              </div>
            </div>
          )}
        </div>
        <div className="module-info">
          <div className="module-name">{module.name}</div>
          <div className="module-description">
            {module.footprint.width} × {module.footprint.height} cells
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="part-library">
      <div className="part-library-header">
        <h3>Part Library</h3>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search parts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="group-filter">
          <select 
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="group-select"
          >
            {groups.map(group => (
              <option key={group} value={group}>
                {group === 'all' ? 'All Groups' : group.charAt(0).toUpperCase() + group.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="part-library-content">
        <div className="module-grid">
          {filteredModules.map(renderModuleTile)}
        </div>
        
        {filteredModules.length === 0 && (
          <div className="no-results">
            No parts found matching "{searchTerm}"
          </div>
        )}
      </div>
      
      <div className="part-library-footer">
        <p className="drag-hint">
          💡 Drag parts onto the canvas to place them
        </p>
      </div>
    </div>
  );
};
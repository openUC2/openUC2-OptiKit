import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';
import './PartLibrary.css';

export const PartLibrary: React.FC = () => {
  const { modules, loadModules } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const filteredModules = modules.filter(module => {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroup === 'all' || module.group === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const groups = ['all', ...new Set(modules.map(m => m.group))];

  const handleDragStart = (e: React.DragEvent, moduleId: string) => {
    e.dataTransfer.setData('moduleId', moduleId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const renderModuleTile = (module: ModuleDefinition) => {
    return (
      <div
        key={module.id}
        className="module-tile"
        draggable
        onDragStart={(e) => handleDragStart(e, module.id)}
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
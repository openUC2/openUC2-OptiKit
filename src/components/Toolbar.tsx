import React from 'react';
import { useAppStore } from '../stores/appStore';
import './Toolbar.css';

export const Toolbar: React.FC = () => {
  const { 
    grid, 
    setGridConfig, 
    exportData, 
    importData, 
    undo, 
    redo,
    centerView,
    annotationMode,
    setAnnotationMode
  } = useAppStore();

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optikit-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    const data = exportData();
    const subject = 'OpenUC2 OptiKit Layout';
    const body = `Please find attached the OpenUC2 OptiKit layout configuration:\n\n${data}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result as string;
          importData(data);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button 
          className="toolbar-button"
          onClick={undo}
          title="Undo"
        >
          ↶
        </button>
        <button 
          className="toolbar-button"
          onClick={redo}
          title="Redo"
        >
          ↷
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className={`toolbar-button ${grid.gridVisible ? 'active' : ''}`}
          onClick={() => setGridConfig({ gridVisible: !grid.gridVisible })}
          title="Toggle Grid"
        >
          #
        </button>
        <button 
          className={`toolbar-button ${grid.snapEnabled ? 'active' : ''}`}
          onClick={() => setGridConfig({ snapEnabled: !grid.snapEnabled })}
          title="Toggle Snap to Grid"
        >
          ⊞
        </button>
        <button 
          className="toolbar-button"
          onClick={centerView}
          title="Center View"
        >
          ⌖
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className={`toolbar-button ${annotationMode === 'line' ? 'active' : ''}`}
          onClick={() => setAnnotationMode(annotationMode === 'line' ? 'none' : 'line')}
          title="Draw Line"
        >
          ╱
        </button>
        <button 
          className={`toolbar-button ${annotationMode === 'arrow' ? 'active' : ''}`}
          onClick={() => setAnnotationMode(annotationMode === 'arrow' ? 'none' : 'arrow')}
          title="Draw Arrow"
        >
          ↗
        </button>
        <button 
          className={`toolbar-button ${annotationMode === 'optical-axis' ? 'active' : ''}`}
          onClick={() => setAnnotationMode(annotationMode === 'optical-axis' ? 'none' : 'optical-axis')}
          title="Draw Optical Axis"
        >
          ⟷
        </button>
        <button 
          className={`toolbar-button ${annotationMode === 'text' ? 'active' : ''}`}
          onClick={() => setAnnotationMode(annotationMode === 'text' ? 'none' : 'text')}
          title="Add Text"
        >
          T
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button 
          className="toolbar-button"
          onClick={handleExport}
          title="Export Layout"
        >
          ↓
        </button>
        <button 
          className="toolbar-button"
          onClick={handleShare}
          title="Share via Email"
        >
          ✉
        </button>
        <button 
          className="toolbar-button"
          onClick={handleImport}
          title="Import Layout"
        >
          ↑
        </button>
      </div>

      <div className="toolbar-title">
        <h1>OpenUC2 OptiKit - 2D Grid Builder</h1>
      </div>
    </div>
  );
};
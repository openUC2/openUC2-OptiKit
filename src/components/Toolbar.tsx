import { useRef } from 'react';
import { useAppStore } from '../store';
import './Toolbar.css';

export function Toolbar() {
  const { exportScene, importScene, clearScene, placedCubes } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = exportScene();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optikit-scene-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        importScene(content);
      };
      reader.readAsText(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClear = () => {
    if (placedCubes.length > 0) {
      const confirmed = window.confirm(
        'Are you sure you want to clear all cubes from the scene?'
      );
      if (confirmed) {
        clearScene();
      }
    }
  };

  const handleCopyToClipboard = async () => {
    const data = exportScene();
    try {
      await navigator.clipboard.writeText(data);
      // You could add a toast notification here
      console.log('Scene data copied to clipboard');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <h3>Scene</h3>
        <div className="toolbar-buttons">
          <button
            onClick={handleExport}
            disabled={placedCubes.length === 0}
            title="Export scene as JSON"
          >
            Export
          </button>
          <button onClick={handleImport} title="Import scene from JSON file">
            Import
          </button>
          <button
            onClick={handleClear}
            disabled={placedCubes.length === 0}
            title="Clear all cubes"
            className="danger"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <h3>Share</h3>
        <div className="toolbar-buttons">
          <button
            onClick={handleCopyToClipboard}
            disabled={placedCubes.length === 0}
            title="Copy scene data to clipboard"
          >
            Copy Data
          </button>
        </div>
      </div>

      <div className="toolbar-section">
        <h3>Stats</h3>
        <div className="toolbar-stats">
          <span className="stat">
            <strong>{placedCubes.length}</strong> cubes placed
          </span>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

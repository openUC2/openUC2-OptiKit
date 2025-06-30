import { useAppStore } from '../store';
import './PropertyPanel.css';

export function PropertyPanel() {
  const {
    selectedCubeId,
    placedCubes,
    availableModules,
    updateCubeRotation,
    updateCubeParameters,
    removeCube,
  } = useAppStore();

  const selectedCube = selectedCubeId
    ? placedCubes.find((cube) => cube.id === selectedCubeId)
    : null;

  const selectedModule = selectedCube
    ? availableModules.find((module) => module.id === selectedCube.moduleId)
    : null;

  if (!selectedCube || !selectedModule) {
    return (
      <div className="property-panel">
        <div className="property-panel-header">
          <h2>Properties</h2>
        </div>
        <div className="property-panel-content">
          <div className="no-selection">
            <p>Select a cube to edit its properties</p>
          </div>
        </div>
      </div>
    );
  }

  const handleRotationChange = (axis: 'x' | 'z', delta: number) => {
    const newRotation = [...selectedCube.rotation] as [number, number, number];
    const axisIndex = axis === 'x' ? 0 : 2;
    newRotation[axisIndex] = (newRotation[axisIndex] + delta) % 360;
    updateCubeRotation(selectedCube.id, newRotation);
  };

  const handleParameterChange = (key: string, value: unknown) => {
    updateCubeParameters(selectedCube.id, { [key]: value });
  };

  const handleRemove = () => {
    removeCube(selectedCube.id);
  };

  return (
    <div className="property-panel">
      <div className="property-panel-header">
        <h2>Properties</h2>
        <button
          className="remove-button"
          onClick={handleRemove}
          title="Remove cube"
        >
          ×
        </button>
      </div>

      <div className="property-panel-content">
        {/* Cube Info */}
        <div className="property-section">
          <h3>Cube Information</h3>
          <div className="property-item">
            <label>Name:</label>
            <span>{selectedModule.name}</span>
          </div>
          <div className="property-item">
            <label>Category:</label>
            <span>{selectedModule.category}</span>
          </div>
          <div className="property-item">
            <label>ID:</label>
            <span className="cube-id">{selectedCube.id}</span>
          </div>
        </div>

        {/* Position */}
        <div className="property-section">
          <h3>Position (Grid Units)</h3>
          <div className="position-grid">
            <div className="position-item">
              <label>X:</label>
              <span>{Math.round(selectedCube.position[0] / 50)}</span>
            </div>
            <div className="position-item">
              <label>Y:</label>
              <span>{Math.round(selectedCube.position[1] / 50)}</span>
            </div>
            <div className="position-item">
              <label>Z:</label>
              <span>{Math.round(selectedCube.position[2] / 55)}</span>
            </div>
          </div>
        </div>

        {/* Rotation */}
        <div className="property-section">
          <h3>Rotation</h3>
          <div className="rotation-controls">
            <div className="rotation-axis">
              <label>X-Axis:</label>
              <div className="rotation-buttons">
                <button
                  onClick={() => handleRotationChange('x', -90)}
                  title="Rotate -90° around X"
                >
                  ⟲
                </button>
                <span>{selectedCube.rotation[0]}°</span>
                <button
                  onClick={() => handleRotationChange('x', 90)}
                  title="Rotate +90° around X"
                >
                  ⟳
                </button>
              </div>
            </div>
            <div className="rotation-axis">
              <label>Z-Axis:</label>
              <div className="rotation-buttons">
                <button
                  onClick={() => handleRotationChange('z', -90)}
                  title="Rotate -90° around Z"
                >
                  ⟲
                </button>
                <span>{selectedCube.rotation[2]}°</span>
                <button
                  onClick={() => handleRotationChange('z', 90)}
                  title="Rotate +90° around Z"
                >
                  ⟳
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Parameters */}
        {Object.keys(selectedCube.parameters).length > 0 && (
          <div className="property-section">
            <h3>Parameters</h3>
            <div className="parameters-list">
              {Object.entries(selectedCube.parameters).map(([key, value]) => (
                <div key={key} className="parameter-item">
                  <label>{key}:</label>
                  <input
                    type="text"
                    value={String(value || '')}
                    onChange={(e) => handleParameterChange(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

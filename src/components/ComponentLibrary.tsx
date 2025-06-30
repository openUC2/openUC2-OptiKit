import { useDrag } from 'react-dnd';
import { useAppStore } from '../store';
import './ComponentLibrary.css';

interface DraggableModuleProps {
  module: {
    id: string;
    name: string;
    color: string;
    category: string;
  };
}

function DraggableModule({ module }: DraggableModuleProps) {
  const [{ isDragging }, drag] = useDrag({
    type: 'cube-module',
    item: { moduleId: module.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <div
      ref={drag as unknown as React.LegacyRef<HTMLDivElement>}
      className={`module-item ${isDragging ? 'dragging' : ''}`}
      style={{ borderLeft: `4px solid ${module.color}` }}
    >
      <div className="module-preview" style={{ backgroundColor: module.color }}>
        <div className="module-preview-cube"></div>
      </div>
      <div className="module-info">
        <h4>{module.name}</h4>
        <span className="module-category">{module.category}</span>
      </div>
    </div>
  );
}

export function ComponentLibrary() {
  const availableModules = useAppStore((state) => state.availableModules);

  // Group modules by category
  const modulesByCategory = availableModules.reduce(
    (acc, module) => {
      if (!acc[module.category]) {
        acc[module.category] = [];
      }
      acc[module.category].push(module);
      return acc;
    },
    {} as Record<string, typeof availableModules>
  );

  return (
    <div className="component-library">
      <div className="component-library-header">
        <h2>Component Library</h2>
        <span className="component-count">
          {availableModules.length} modules
        </span>
      </div>

      <div className="component-library-content">
        {Object.entries(modulesByCategory).map(([category, modules]) => (
          <div key={category} className="module-category">
            <h3 className="category-title">{category}</h3>
            <div className="module-list">
              {modules.map((module) => (
                <DraggableModule key={module.id} module={module} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="component-library-footer">
        <p className="drag-hint">
          Drag modules to the 3D workspace to place them
        </p>
      </div>
    </div>
  );
}

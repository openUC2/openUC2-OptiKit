import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ComponentLibrary } from './components/ComponentLibrary';
import { Scene3D } from './components/Scene3D';
import { PropertyPanel } from './components/PropertyPanel';
import { Toolbar } from './components/Toolbar';
import './App.css';

function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="app">
        <ComponentLibrary />
        <div className="main-content">
          <Scene3D />
          <Toolbar />
        </div>
        <PropertyPanel />
      </div>
    </DndProvider>
  );
}

export default App;

import { useAppStore } from '../stores/appStore';
import { CubeInstance } from './CubeInstance';

export function Cubes() {
  const placedModules = useAppStore(s => s.placedModules);
  const modules = useAppStore(s => s.modules);

  return (
    <>
      {placedModules.map(m => (
        <CubeInstance
          key={m.id}
          module={m}
          moduleDef={modules.find(d => d.id === m.moduleId)}
        />
      ))}
    </>
  );
}

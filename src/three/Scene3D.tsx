import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Cubes } from './Cubes';
import { SelectionHUD } from './SelectionHUD';
import { useAppStore } from '../stores/appStore';

export function Scene3D() {
  const clearSelection = useAppStore(s => s.clearSelection);

  return (
    <Canvas
      camera={{ position: [300, 300, 300], near: 1, far: 5000, fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      onPointerMissed={() => clearSelection()}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 400, 200]} intensity={0.8} castShadow />

      <OrbitControls makeDefault />

      {/* XZ grid at Y=0 */}
      <Grid
        args={[2000, 2000]}
        cellSize={50}
        sectionSize={250}
        infiniteGrid
        fadeDistance={1500}
        position={[0, 0, 0]}
      />

      <Suspense fallback={null}>
        <Cubes />
        <SelectionHUD />
      </Suspense>
    </Canvas>
  );
}

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Box } from '@react-three/drei';
import { useDrop } from 'react-dnd';
import * as THREE from 'three';
import { useAppStore, type PlacedCube } from '../store';
import { snapToGrid, createGridLines } from '../utils/grid';
import './Scene3D.css';

// Grid component
function Grid() {
  const { showGrid } = useAppStore();
  const gridRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.clear();
      if (showGrid) {
        const grid = createGridLines(10);
        gridRef.current.add(grid);
      }
    }
  }, [showGrid]);

  return <group ref={gridRef} />;
}

// Individual cube component
function CubeComponent({ cube }: { cube: PlacedCube }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectedCubeId, selectCube, availableModules } = useAppStore();
  const [hovered, setHovered] = useState(false);

  const module = availableModules.find((m) => m.id === cube.moduleId);
  const isSelected = selectedCubeId === cube.id;

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(
        cube.position[0],
        cube.position[1],
        cube.position[2]
      );
      meshRef.current.rotation.set(
        THREE.MathUtils.degToRad(cube.rotation[0]),
        THREE.MathUtils.degToRad(cube.rotation[1]),
        THREE.MathUtils.degToRad(cube.rotation[2])
      );
    }
  });

  const handleClick = (
    event: THREE.Event & { stopPropagation: () => void }
  ) => {
    event.stopPropagation();
    selectCube(cube.id);
  };

  const handlePointerOver = () => setHovered(true);
  const handlePointerOut = () => setHovered(false);

  return (
    <Box
      ref={meshRef}
      args={[45, 45, 50]} // Slightly smaller than grid for visual clarity
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      <meshStandardMaterial
        color={module?.color || '#666666'}
        transparent
        opacity={hovered ? 0.8 : 0.9}
        emissive={isSelected ? '#444444' : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(47, 47, 52)]} />
          <lineBasicMaterial color="#ffffff" linewidth={2} />
        </lineSegments>
      )}
    </Box>
  );
}

// Drag target for the scene
function DragTarget() {
  const { camera, gl } = useThree();
  const { addCube } = useAppStore();
  const [dragPreview, setDragPreview] = useState<{
    position: THREE.Vector3;
    moduleId: string;
  } | null>(null);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  );

  const [, drop] = useDrop({
    accept: 'cube-module',
    drop: (item: { moduleId: string }) => {
      if (dragPreview) {
        const snappedPosition = snapToGrid(dragPreview.position);
        addCube(item.moduleId, [
          snappedPosition.x,
          snappedPosition.y,
          snappedPosition.z,
        ]);
      }
      setDragPreview(null);
    },
    hover: (item: { moduleId: string }, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (clientOffset) {
        const rect = gl.domElement.getBoundingClientRect();

        mouse.x = ((clientOffset.x - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientOffset.y - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(plane);

        if (intersects.length > 0) {
          const worldPos = intersects[0].point;
          const snappedPos = snapToGrid(worldPos);
          setDragPreview({
            position: snappedPos,
            moduleId: item.moduleId,
          });
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      item: monitor.getItem(),
    }),
  });

  return (
    <group ref={drop as unknown as React.MutableRefObject<THREE.Group>}>
      {/* Invisible plane for drag targeting */}
      <primitive object={plane} />

      {/* Drag preview */}
      {dragPreview && (
        <Box
          position={[
            dragPreview.position.x,
            dragPreview.position.y,
            dragPreview.position.z,
          ]}
          args={[45, 45, 50]}
        >
          <meshStandardMaterial
            color="#00ff00"
            transparent
            opacity={0.5}
            wireframe
          />
        </Box>
      )}
    </group>
  );
}

// Main scene component
function SceneContent() {
  const placedCubes = useAppStore((state) => state.placedCubes);
  const selectCube = useAppStore((state) => state.selectCube);

  const handleSceneClick = () => {
    selectCube(null);
  };

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <directionalLight position={[-10, -10, -5]} intensity={0.4} />

      {/* Grid */}
      <Grid />

      {/* Placed cubes */}
      {placedCubes.map((cube) => (
        <CubeComponent key={cube.id} cube={cube} />
      ))}

      {/* Drag target */}
      <DragTarget />

      {/* Scene click handler */}
      <mesh onClick={handleSceneClick} visible={false}>
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Camera controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={100}
        maxDistance={1000}
      />
    </>
  );
}

export function Scene3D() {
  return (
    <div className="scene-3d">
      <Canvas
        camera={{ position: [200, 200, 200], fov: 50 }}
        style={{ background: '#f1f5f9' }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}

import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { moduleWorldPosition } from './coords';
import { useAppStore } from '../stores/appStore';
import { GRID_MM } from '../constants/grid';
import { GLBErrorBoundary } from './GLBErrorBoundary';
import type { PlacedModule, ModuleDefinition } from '../types';

// ─── Shared ref registry so CubeGizmo can find the selected cube ────────────

/** Map of module id → outer Three.js group ref */
export const cubeRefRegistry = new Map<string, THREE.Group>();

// ─── Selection / hover highlight ─────────────────────────────────────────────

const SELECTION_COLOR = '#FFAA00';
const HOVER_COLOR = '#88CCFF';

function HighlightBox({ color, size }: { color: string; size: number }) {
  return (
    <mesh>
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.8} />
    </mesh>
  );
}

// ─── Default fallback cube (shown when no GLB URL or load fails) ─────────────

function DefaultCube({ offset }: { offset?: [number, number, number] }) {
  const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(48, 48, 48));
  return (
    <group position={offset}>
      <mesh>
        <boxGeometry args={[48, 48, 48]} />
        <meshStandardMaterial color="#b0b0b0" roughness={0.7} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#888888" />
      </lineSegments>
    </group>
  );
}

// ─── GLB loader ──────────────────────────────────────────────────────────────
// Separate component so useGLTF is always called with a real URL (no conditional
// hook calls). Suspends while loading; error boundary above catches failures.

interface GLBSceneProps {
  url: string;
  offset?: [number, number, number];
}

function GLBScene({ url, offset }: GLBSceneProps) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(
    () => skeletonClone(scene) as THREE.Group,
    [scene],
  );
  return (
    <group position={offset}>
      <primitive object={cloned} />
    </group>
  );
}

// ─── CubeInstance ────────────────────────────────────────────────────────────

interface CubeInstanceProps {
  module: PlacedModule;
  moduleDef?: ModuleDefinition;
}

export function CubeInstance({ module: m, moduleDef: def }: CubeInstanceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const selectItem = useAppStore(s => s.selectItem);
  const isSelected = useAppStore(s => s.selectedItemId === m.id);

  // Register / unregister this group in the shared ref map
  useEffect(() => {
    const node = groupRef.current;
    if (node) cubeRefRegistry.set(m.id, node);
    return () => { cubeRefRegistry.delete(m.id); };
  }, [m.id]);

  const worldPos  = moduleWorldPosition(m);
  const yRotRad   = THREE.MathUtils.degToRad(-m.rotation);
  const topRotRad = THREE.MathUtils.degToRad(m.topRotation ?? 0);
  const offset    = def?.glbOffset;

  return (
    // Outer group: grid position + in-plane (Y-axis) rotation
    <group
      ref={groupRef}
      position={worldPos}
      rotation={[0, yRotRad, 0]}
      onClick={(e) => { e.stopPropagation(); selectItem(m.id, 'module'); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      {/* Selection / hover wireframe overlay at cube centre */}
      {isSelected && <HighlightBox color={SELECTION_COLOR} size={GRID_MM.cube + 2} />}
      {hovered && !isSelected && <HighlightBox color={HOVER_COLOR} size={GRID_MM.cube + 1} />}

      {/* Inner group: top rotation around Z axis */}
      <group rotation={[0, 0, topRotRad]}>
        {def?.glbUrl ? (
          <GLBErrorBoundary fallback={<DefaultCube offset={offset} />}>
            <Suspense fallback={<DefaultCube offset={offset} />}>
              <GLBScene url={def.glbUrl} offset={offset} />
            </Suspense>
          </GLBErrorBoundary>
        ) : (
          <DefaultCube offset={offset} />
        )}
      </group>
    </group>
  );
}

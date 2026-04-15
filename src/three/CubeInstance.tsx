import { useState, Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { moduleWorldPosition } from './coords';
import { useAppStore } from '../stores/appStore';
import { GRID_MM } from '../constants/grid';
import type { PlacedModule, ModuleDefinition } from '../types';

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

// ─── Fallback ────────────────────────────────────────────────────────────────

function FallbackBox({ offset }: { offset?: [number, number, number] }) {
  return (
    <group position={offset}>
      <mesh>
        <boxGeometry args={[50, 50, 50]} />
        <meshBasicMaterial color={0x888888} wireframe />
      </mesh>
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
  const [hovered, setHovered] = useState(false);
  const selectItem = useAppStore(s => s.selectItem);
  const isSelected = useAppStore(s => s.selectedItemId === m.id);

  const worldPos  = moduleWorldPosition(m);
  const yRotRad   = THREE.MathUtils.degToRad(-m.rotation);
  const topRotRad = THREE.MathUtils.degToRad(m.topRotation ?? 0);
  const offset    = def?.glbOffset;

  return (
    // Outer group: grid position + in-plane (Y-axis) rotation
    <group
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
          <Suspense fallback={<FallbackBox offset={offset} />}>
            <GLBScene url={def.glbUrl} offset={offset} />
          </Suspense>
        ) : (
          <FallbackBox offset={offset} />
        )}
      </group>
    </group>
  );
}

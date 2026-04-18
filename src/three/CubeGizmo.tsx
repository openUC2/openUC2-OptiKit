import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useAppStore } from '../stores/appStore';
import { cubeRefRegistry } from './CubeInstance';
import { snapGridXZ, snapLayerY, snapRotation, moduleWorldPosition } from './coords';
import { GRID_MM } from '../constants/grid';

export type GizmoMode = 'translate-xz' | 'translate-y' | 'rotate-base' | 'rotate-top';

interface CubeGizmoProps {
  mode: GizmoMode;
  onDraggingChanged: (dragging: boolean) => void;
}

export function CubeGizmo({ mode, onDraggingChanged }: CubeGizmoProps) {
  const controlsRef = useRef<TransformControlsImpl>(null);
  const [blocked, setBlocked] = useState(false);

  const selectedId = useAppStore(s => s.selectedItemId);
  const selectedType = useAppStore(s => s.selectedItemType);
  const placedModules = useAppStore(s => s.placedModules);
  const modules = useAppStore(s => s.modules);
  const moveModule = useAppStore(s => s.moveModule);
  const moveModuleToLayer = useAppStore(s => s.moveModuleToLayer);
  const rotateModule = useAppStore(s => s.rotateModule);
  const rotateModuleTop = useAppStore(s => s.rotateModuleTop);
  const checkCollision = useAppStore(s => s.checkCollision);

  const { invalidate } = useThree();

  const placed = selectedId && selectedType === 'module'
    ? placedModules.find(m => m.id === selectedId)
    : undefined;

  const def = placed ? modules.find(d => d.id === placed.moduleId) : undefined;

  // Get the target object from the ref registry
  const targetObject = selectedId ? cubeRefRegistry.get(selectedId) : undefined;

  // Store the original position/rotation before drag starts
  const dragStartRef = useRef<{ pos: [number, number, number]; rotY: number; rotZ: number } | null>(null);

  // Clear blocked flash after timeout
  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => setBlocked(false), 400);
    return () => clearTimeout(t);
  }, [blocked]);

  // Listen for dragging-changed on the TransformControls
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleDraggingChanged = (event: { value: boolean }) => {
      onDraggingChanged(event.value);

      if (event.value && placed) {
        // Drag started — record starting state
        dragStartRef.current = {
          pos: moduleWorldPosition(placed),
          rotY: THREE.MathUtils.degToRad(-placed.rotation),
          rotZ: THREE.MathUtils.degToRad(placed.topRotation ?? 0),
        };
      }

      if (!event.value && placed && def) {
        // Drag ended — commit the snapped result
        commitTransform();
      }
    };

    // TransformControls fires "dragging-changed" which isn't in the TS event map
    const c = controls as unknown as {
      addEventListener(type: string, listener: (event: { value: boolean }) => void): void;
      removeEventListener(type: string, listener: (event: { value: boolean }) => void): void;
    };
    c.addEventListener('dragging-changed', handleDraggingChanged);
    return () => {
      c.removeEventListener('dragging-changed', handleDraggingChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, def, mode]);

  const commitTransform = useCallback(() => {
    if (!placed || !def || !targetObject) return;

    if (mode === 'translate-xz') {
      const wp = targetObject.position;
      const snapped = snapGridXZ(wp.x, wp.z);

      // Collision check
      const footprint = def.footprint;
      const isRotated = placed.rotation === 90 || placed.rotation === 270;
      const actualFp = isRotated
        ? { width: footprint.height, height: footprint.width }
        : { width: footprint.width, height: footprint.height };

      if (checkCollision(snapped, actualFp, placed.layer, placed.id)) {
        // Blocked — snap back to original position
        setBlocked(true);
        const origPos = moduleWorldPosition(placed);
        targetObject.position.set(origPos[0], origPos[1], origPos[2]);
        invalidate();
        return;
      }

      moveModule(placed.id, snapped);
    } else if (mode === 'translate-y') {
      const newLayer = snapLayerY(targetObject.position.y);
      moveModuleToLayer(placed.id, newLayer);
    } else if (mode === 'rotate-base') {
      const yRad = targetObject.rotation.y;
      const deg = snapRotation(-THREE.MathUtils.radToDeg(yRad));
      rotateModule(placed.id, deg);
    } else if (mode === 'rotate-top') {
      // Top rotation is the Z on the inner group — but TransformControls is on the outer.
      // We read the Z euler from the outer group, snap, and commit.
      const zRad = targetObject.rotation.z;
      const deg = snapRotation(THREE.MathUtils.radToDeg(zRad));
      rotateModuleTop(placed.id, deg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, def, targetObject, mode]);

  if (!targetObject || !placed) return null;

  // Derive TransformControls props from gizmo mode
  const controlsProps = getControlsProps(mode);

  return (
    <TransformControls
      ref={controlsRef}
      object={targetObject}
      {...controlsProps}
      space="world"
      size={0.8}
    />
  );
}

function getControlsProps(mode: GizmoMode) {
  switch (mode) {
    case 'translate-xz':
      return {
        mode: 'translate' as const,
        showX: true,
        showY: false,
        showZ: true,
        translationSnap: GRID_MM.x,
      };
    case 'translate-y':
      return {
        mode: 'translate' as const,
        showX: false,
        showY: true,
        showZ: false,
        translationSnap: GRID_MM.yLayer,
      };
    case 'rotate-base':
      return {
        mode: 'rotate' as const,
        showX: false,
        showY: true,
        showZ: false,
        rotationSnap: Math.PI / 2,
      };
    case 'rotate-top':
      return {
        mode: 'rotate' as const,
        showX: false,
        showY: false,
        showZ: true,
        rotationSnap: Math.PI / 2,
      };
  }
}

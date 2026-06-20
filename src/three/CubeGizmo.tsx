import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { useAppStore } from '../stores/appStore';
import { cubeRefRegistry } from './CubeInstance';
import { snapGridXZ, snapLayerY, snapRotation, moduleWorldPosition } from './coords';

// Two Slicer-style tools: a 3-axis move and a 3-axis rotate (all three rings).
export type GizmoMode = 'translate' | 'rotate';

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
  const rotateModuleTilt = useAppStore(s => s.rotateModuleTilt);
  const checkCollision = useAppStore(s => s.checkCollision);

  const { invalidate } = useThree();

  const placed = selectedId && selectedType === 'module'
    ? placedModules.find(m => m.id === selectedId)
    : undefined;

  const def = placed ? modules.find(d => d.id === placed.moduleId) : undefined;

  // Get the target object from the ref registry
  const targetObject = selectedId ? cubeRefRegistry.get(selectedId) : undefined;

  // Orientation captured when a rotate drag begins (for delta-based commit).
  const dragStartQuat = useRef<THREE.Quaternion | null>(null);

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

      if (event.value && targetObject) {
        dragStartQuat.current = targetObject.quaternion.clone();
      }

      if (!event.value && placed && def) {
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
  }, [placed, def, mode, targetObject]);

  const commitTransform = useCallback(() => {
    if (!placed || !def || !targetObject) return;

    if (mode === 'translate') {
      // Snap X/Z to the grid and Y to the nearest layer — a full 3-axis move.
      const wp = targetObject.position;
      const snapped = snapGridXZ(wp.x, wp.z);
      const newLayer = snapLayerY(wp.y);

      const footprint = def.footprint;
      const isRotated = placed.rotation === 90 || placed.rotation === 270;
      const actualFp = isRotated
        ? { width: footprint.height, height: footprint.width }
        : { width: footprint.width, height: footprint.height };

      if (checkCollision(snapped, actualFp, newLayer, placed.id)) {
        // Blocked — snap the object back to its committed pose.
        setBlocked(true);
        const origPos = moduleWorldPosition(placed);
        targetObject.position.set(origPos[0], origPos[1], origPos[2]);
        invalidate();
        return;
      }

      moveModule(placed.id, snapped);
      if (newLayer !== placed.layer) moveModuleToLayer(placed.id, newLayer);
    } else {
      // Rotate: compare end vs start orientation, snap the dominant axis to 90°,
      // and apply it to the matching store field (the gizmo snaps one ring at a time).
      const start = dragStartQuat.current;
      if (!start) return;
      const delta = targetObject.quaternion.clone().multiply(start.clone().invert());
      const e = new THREE.Euler().setFromQuaternion(delta, 'XYZ');
      const dx = THREE.MathUtils.radToDeg(e.x);
      const dy = THREE.MathUtils.radToDeg(e.y);
      const dz = THREE.MathUtils.radToDeg(e.z);
      const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      if (Math.max(ax, ay, az) < 1) return; // no meaningful rotation

      if (ax >= ay && ax >= az) {
        rotateModuleTilt(placed.id, snapRotation((placed.tiltRotation ?? 0) + dx));
      } else if (ay >= ax && ay >= az) {
        // CubeInstance applies world-yaw = -rotation, so a +Y world delta lowers rotation.
        rotateModule(placed.id, snapRotation(placed.rotation - dy));
      } else {
        rotateModuleTop(placed.id, snapRotation((placed.topRotation ?? 0) + dz));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, def, targetObject, mode]);

  if (!targetObject || !placed) return null;

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
  if (mode === 'translate') {
    return {
      mode: 'translate' as const,
      showX: true,
      showY: true,
      showZ: true,
    };
  }
  return {
    mode: 'rotate' as const,
    showX: true,
    showY: true,
    showZ: true,
    rotationSnap: Math.PI / 2,
  };
}

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

const SESSION_KEY = 'openuc2-3d-camera';
const DEFAULT_POSITION: [number, number, number] = [300, 300, 300];
const DEFAULT_TARGET: [number, number, number] = [0, 0, 0];

interface SavedCamera {
  position: [number, number, number];
  target: [number, number, number];
}

function save(pos: THREE.Vector3, target: THREE.Vector3) {
  const data: SavedCamera = {
    position: [pos.x, pos.y, pos.z],
    target: [target.x, target.y, target.z],
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function load(): SavedCamera | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedCamera) : null;
  } catch {
    return null;
  }
}

/**
 * Must be called inside a <Canvas> (R3F context).
 * Returns a `resetCamera` function that snaps the camera back to the default view.
 */
export function useCameraState(controlsRef: React.RefObject<OrbitControlsImpl | null>) {
  const { camera } = useThree();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the saved camera once, synchronously, so callers can branch on it
  // during the same render (e.g. skip the initial top-down fit).
  const savedRef = useRef<SavedCamera | null | undefined>(undefined);
  if (savedRef.current === undefined) savedRef.current = load();
  const hadSaved = !!savedRef.current;

  // On mount: restore saved camera state
  useEffect(() => {
    const saved = savedRef.current;
    if (saved) {
      camera.position.set(...saved.position);
      // Wait one frame for OrbitControls to mount before updating target
      const raf = requestAnimationFrame(() => {
        controlsRef.current?.target.set(...saved.target);
        controlsRef.current?.update();
      });
      return () => cancelAnimationFrame(raf);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to controls change event and debounce-save
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onchange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        save(camera.position, controls.target);
      }, 500);
    };

    controls.addEventListener('change', onchange);
    return () => {
      controls.removeEventListener('change', onchange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // Re-subscribe if controls ref value changes after the first render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsRef.current]);

  const resetCamera = () => {
    camera.position.set(...DEFAULT_POSITION);
    controlsRef.current?.target.set(...DEFAULT_TARGET);
    controlsRef.current?.update();
    save(camera.position, controlsRef.current?.target ?? new THREE.Vector3());
  };

  return { resetCamera, hadSaved };
}

import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PlacedModule } from '../types';
import { moduleWorldPosition } from './coords';

const PADDING = 50; // mm extra on each side

/** Shared mutable tween target — read by the useFrame loop in SceneContent. */
export interface CameraTween {
  active: boolean;
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  /** progress 0..1 (set by useFrame) */
  t: number;
}

export function makeTween(): CameraTween {
  return {
    active: false,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    t: 0,
  };
}

/** Start or overwrite an animated camera move. */
export function animateTo(
  tween: CameraTween,
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  toPos: THREE.Vector3,
  toTarget: THREE.Vector3,
) {
  tween.fromPos.copy(camera.position);
  tween.fromTarget.copy(controls.target);
  tween.toPos.copy(toPos);
  tween.toTarget.copy(toTarget);
  tween.t = 0;
  tween.active = true;
}

/** Compute scene center + bounding extents from placed modules. */
function sceneBounds(placedModules: PlacedModule[]) {
  if (placedModules.length === 0) {
    return {
      center: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector3(500, 200, 500),
    };
  }

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const m of placedModules) {
    const [wx, wy, wz] = moduleWorldPosition(m);
    min.x = Math.min(min.x, wx - PADDING);
    min.y = Math.min(min.y, wy - PADDING);
    min.z = Math.min(min.z, wz - PADDING);
    max.x = Math.max(max.x, wx + PADDING);
    max.y = Math.max(max.y, wy + PADDING);
    max.z = Math.max(max.z, wz + PADDING);
  }

  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  return { center, size };
}

/**
 * Compute a top-down ("XY-plane") camera framing that fits all placed modules,
 * accounting for viewport aspect ratio. Returns position + target without
 * animating — used for the initial 3D entry view.
 *
 * In a top-down view the screen's vertical axis maps to world Z (depth) and the
 * horizontal axis to world X, so we fit each against the matching FOV.
 */
export function computeTopFit(
  camera: THREE.PerspectiveCamera,
  placedModules: PlacedModule[],
  aspect: number,
  marginFactor = 1.35,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const { center, size } = sceneBounds(placedModules);
  const fovRad = (camera.fov * Math.PI) / 180;
  const tan = Math.tan(fovRad / 2);
  // Guard against a not-yet-laid-out canvas (aspect ~0) producing an absurd distance.
  const safeAspect = aspect > 0.05 ? aspect : 1.5;
  const distForDepth = size.z / 2 / tan; // vertical screen axis ← world Z
  const distForWidth = size.x / 2 / (tan * safeAspect); // horizontal ← world X
  const dist = Math.min(
    Math.max(distForDepth, distForWidth, 200) * marginFactor,
    6000,
  );
  // Tiny Z nudge keeps the view direction off the camera-up axis (avoids gimbal flip).
  const position = new THREE.Vector3(center.x, center.y + dist, center.z + 0.01);
  return { position, target: center.clone() };
}

/** Animate the camera to a top-down framing of all placed modules. */
export function topFitView(
  tween: CameraTween,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl,
  placedModules: PlacedModule[],
  aspect: number,
) {
  const { position, target } = computeTopFit(camera, placedModules, aspect);
  animateTo(tween, camera, controls, position, target);
}

/** Animate the camera to frame all placed modules. */
export function zoomToFit(
  tween: CameraTween,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl,
  placedModules: PlacedModule[],
) {
  const { center, size } = sceneBounds(placedModules);

  // Required distance to fit the bounding diagonal in the vertical FOV
  const diagonal = Math.max(size.x, size.y, size.z);
  const fovRad = (camera.fov * Math.PI) / 180;
  const distance = (diagonal / 2) / Math.tan(fovRad / 2) * 1.2; // 1.2 = small margin

  // Keep current horizontal angle, set elevation to ~35°
  const elevation = Math.PI / 5; // ~36°
  const azimuth = Math.atan2(
    camera.position.x - center.x,
    camera.position.z - center.z,
  );
  const toPos = new THREE.Vector3(
    center.x + distance * Math.sin(azimuth) * Math.cos(elevation),
    center.y + distance * Math.sin(elevation),
    center.z + distance * Math.cos(azimuth) * Math.cos(elevation),
  );

  animateTo(tween, camera, controls, toPos, center);
}

/** Animate the camera to frame a single world-space point at a given radius. */
export function focusOn(
  tween: CameraTween,
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  point: THREE.Vector3,
  radius = 200,
) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const toPos = point.clone().addScaledVector(dir, radius);
  animateTo(tween, camera, controls, toPos, point.clone());
}

/** Preset: top-down view. */
export function topView(
  tween: CameraTween,
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  placedModules: PlacedModule[],
) {
  const { center } = sceneBounds(placedModules);
  const toPos = new THREE.Vector3(center.x, center.y + 800, center.z);
  // Slight offset so camera.up doesn't align with look direction
  toPos.z += 0.01;
  animateTo(tween, camera, controls, toPos, center.clone());
}

/** Preset: front view. */
export function frontView(
  tween: CameraTween,
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
  placedModules: PlacedModule[],
) {
  const { center } = sceneBounds(placedModules);
  const toPos = new THREE.Vector3(center.x, center.y, center.z + 800);
  animateTo(tween, camera, controls, toPos, center.clone());
}

/** Preset: isometric view at default position. */
export function isoView(
  tween: CameraTween,
  camera: THREE.Camera,
  controls: OrbitControlsImpl,
) {
  const toPos = new THREE.Vector3(300, 300, 300);
  const toTarget = new THREE.Vector3(0, 0, 0);
  animateTo(tween, camera, controls, toPos, toTarget);
}

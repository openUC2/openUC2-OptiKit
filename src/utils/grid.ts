import * as THREE from 'three';

// Grid configuration
export const GRID_SIZE = {
  X: 50, // 50mm
  Y: 50, // 50mm
  Z: 55, // 55mm
} as const;

// Convert world coordinates to grid coordinates
export function worldToGrid(worldPos: THREE.Vector3): [number, number, number] {
  return [
    Math.round(worldPos.x / GRID_SIZE.X),
    Math.round(worldPos.y / GRID_SIZE.Y),
    Math.round(worldPos.z / GRID_SIZE.Z),
  ];
}

// Convert grid coordinates to world coordinates
export function gridToWorld(gridPos: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(
    gridPos[0] * GRID_SIZE.X,
    gridPos[1] * GRID_SIZE.Y,
    gridPos[2] * GRID_SIZE.Z
  );
}

// Snap a world position to the nearest grid point
export function snapToGrid(worldPos: THREE.Vector3): THREE.Vector3 {
  const gridPos = worldToGrid(worldPos);
  return gridToWorld(gridPos);
}

// Check if a grid position is occupied
export function isGridPositionOccupied(
  gridPos: [number, number, number],
  placedCubes: Array<{ position: [number, number, number] }>,
  excludeId?: string
): boolean {
  return placedCubes.some((cube) => {
    if (excludeId && 'id' in cube && cube.id === excludeId) return false;
    const cubeGridPos = worldToGrid(new THREE.Vector3(...cube.position));
    return (
      cubeGridPos[0] === gridPos[0] &&
      cubeGridPos[1] === gridPos[1] &&
      cubeGridPos[2] === gridPos[2]
    );
  });
}

// Get the nearest available grid position
export function getNearestAvailableGridPosition(
  targetPos: THREE.Vector3,
  placedCubes: Array<{ position: [number, number, number] }>,
  excludeId?: string
): THREE.Vector3 {
  const targetGridPos = worldToGrid(targetPos);

  // If the target position is available, use it
  if (!isGridPositionOccupied(targetGridPos, placedCubes, excludeId)) {
    return gridToWorld(targetGridPos);
  }

  // Search in expanding rings around the target position
  for (let radius = 1; radius <= 10; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check positions on the edge of the current radius
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== radius) {
            continue;
          }

          const testPos: [number, number, number] = [
            targetGridPos[0] + dx,
            targetGridPos[1] + dy,
            targetGridPos[2] + dz,
          ];

          if (!isGridPositionOccupied(testPos, placedCubes, excludeId)) {
            return gridToWorld(testPos);
          }
        }
      }
    }
  }

  // If no position found, return the snapped target position anyway
  return gridToWorld(targetGridPos);
}

// Create grid lines for visualization
export function createGridLines(size = 10): THREE.Object3D {
  const group = new THREE.Group();

  // Create grid lines for XY plane
  const gridXY = new THREE.GridHelper(
    size * GRID_SIZE.X,
    size,
    0x444444,
    0x222222
  );
  gridXY.rotateX(Math.PI / 2);
  group.add(gridXY);

  // Create grid lines for XZ plane
  const gridXZ = new THREE.GridHelper(
    size * GRID_SIZE.X,
    size,
    0x444444,
    0x222222
  );
  group.add(gridXZ);

  // Create vertical lines for Z axis
  const material = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (let x = -size / 2; x <= size / 2; x++) {
    for (let y = -size / 2; y <= size / 2; y++) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x * GRID_SIZE.X, y * GRID_SIZE.Y, 0),
        new THREE.Vector3(x * GRID_SIZE.X, y * GRID_SIZE.Y, size * GRID_SIZE.Z),
      ]);
      const line = new THREE.Line(geometry, material);
      group.add(line);
    }
  }

  return group;
}

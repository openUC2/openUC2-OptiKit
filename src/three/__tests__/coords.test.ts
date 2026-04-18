/**
 * Manual coordinate helper tests.
 * Run with: node --loader ts-node/esm src/three/__tests__/coords.test.ts
 * Or import in the browser console to verify assertions.
 *
 * No test runner required — assertions use console.assert.
 */

import { moduleWorldPosition, snapGridXZ, snapLayerY, snapRotation } from '../coords';
import type { PlacedModule } from '../../types';

function assert(condition: boolean, message: string) {
  console.assert(condition, `FAIL: ${message}`);
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`PASS: ${message}`);
}

// --- moduleWorldPosition ---
// Module at grid (x:2, y:3), layer:1 → [2*50, 1*55+5, 3*50] = [100, 60, 150]
const m: PlacedModule = {
  id: 'test-1',
  moduleId: 'cube-1x1',
  position: { x: 2, y: 3 },
  rotation: 0,
  layer: 1,
};
const [wx, wy, wz] = moduleWorldPosition(m);
assert(wx === 100, `moduleWorldPosition x: expected 100, got ${wx}`);
assert(wy === 60,  `moduleWorldPosition y: expected 60, got ${wy}`);
assert(wz === 150, `moduleWorldPosition z: expected 150, got ${wz}`);

// Origin module: (x:0, y:0), layer:0 → [0, 5, 0]
const m0: PlacedModule = { ...m, id: 'test-2', position: { x: 0, y: 0 }, layer: 0 };
const [ox, oy, oz] = moduleWorldPosition(m0);
assert(ox === 0, `origin x`);
assert(oy === 5, `origin y (baseplate offset)`);
assert(oz === 0, `origin z`);

// --- snapGridXZ ---
const snapped = snapGridXZ(110, 145);
assert(snapped.x === 2, `snapGridXZ x: expected 2, got ${snapped.x}`);
assert(snapped.y === 3, `snapGridXZ y: expected 3, got ${snapped.y}`);

// --- snapLayerY ---
assert(snapLayerY(60) === 1,  `snapLayerY(60) = 1`);
assert(snapLayerY(5)  === 0,  `snapLayerY(5) = 0`);
assert(snapLayerY(-99) === 0, `snapLayerY clamped to 0`);

// --- snapRotation ---
assert(snapRotation(0)   === 0,   `snapRotation(0)`);
assert(snapRotation(91)  === 90,  `snapRotation(91) -> 90`);
assert(snapRotation(360) === 0,   `snapRotation(360) wraps to 0`);
assert(snapRotation(-10) === 0,   `snapRotation(-10) -> 0`);
assert(snapRotation(270) === 270, `snapRotation(270)`);
assert(snapRotation(359) === 0,   `snapRotation(359) -> 0 (nearest to 360)`);

console.log('All coords assertions passed.');

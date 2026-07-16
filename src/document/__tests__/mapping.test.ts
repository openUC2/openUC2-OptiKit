/**
 * Pose mapping between the legacy store model and the document frame,
 * exercised in both directions (WP-11 acceptance).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PlacedModule } from '../../types';
import {
  DOC_PARAMS_KEY,
  docRotationMatrix,
  docYawFromStoreYaw,
  getDocParams,
  gridPoseOf,
  joinWorldPosition,
  splitDocYaw,
  splitWorldPosition,
  storeYawFromDocYaw,
  worldPoseOf,
} from '../mapping';
import { decomposeRot24, ROT24_TABLE, rot24Matrix } from '../rot24';
import { UC2_GRID_MM } from '../types';

function placed(over: Partial<PlacedModule> = {}): PlacedModule {
  return {
    id: 'p1',
    moduleId: 'lens-pos-1x1',
    position: { x: 0, y: 0 },
    rotation: 0,
    layer: 0,
    ...over,
  };
}

describe('grid pitch', () => {
  it('is 50/50/55 mm', () => {
    expect(UC2_GRID_MM).toEqual([50, 50, 55]);
  });
});

describe('store → document positions', () => {
  it('maps cell (2, 3, layer 1) to mm with y negated and z up', () => {
    const pose = worldPoseOf(placed({ position: { x: 2, y: 3 }, layer: 1 }));
    expect(pose.positionMm).toEqual([100, -150, 55]);
  });

  it('applies continuous offsets from params.__doc', () => {
    const pose = worldPoseOf(
      placed({
        position: { x: 1, y: 0 },
        params: { [DOC_PARAMS_KEY]: { offsetMm: [1.5, -2, 3] } },
      }),
    );
    expect(pose.positionMm).toEqual([51.5, -2, 3]);
  });

  it('exposes the grid pose with cell and residual separated', () => {
    const g = gridPoseOf(
      placed({
        position: { x: 4, y: -2 },
        layer: 2,
        params: { [DOC_PARAMS_KEY]: { offsetMm: [0, 0, 1.85] } },
      }),
    );
    expect(g.cell).toEqual([4, 2, 2]);
    expect(g.offsetMm).toEqual([0, 0, 1.85]);
  });
});

describe('document → store positions (cubify split)', () => {
  it('splits an on-grid position with zero residual', () => {
    const p = splitWorldPosition([100, -150, 110]);
    expect(p.position).toEqual({ x: 2, y: 3 });
    expect(p.layer).toBe(2);
    expect(p.offsetMm).toEqual([0, 0, 0]);
  });

  it('splits an off-grid position into nearest cell + residual', () => {
    const p = splitWorldPosition([51.5, -2, 3]);
    expect(p.position).toEqual({ x: 1, y: 0 });
    expect(p.layer).toBe(0);
    expect(p.offsetMm[0]).toBeCloseTo(1.5);
    expect(p.offsetMm[1]).toBeCloseTo(-2);
    expect(p.offsetMm[2]).toBeCloseTo(3);
  });

  it('round-trips split → join exactly', () => {
    for (const pos of [
      [0, 0, 0],
      [100, -150, 110],
      [37.2, 88.8, -12.4],
      [-49.9, 25.01, 27.5],
    ] as const) {
      expect(joinWorldPosition(splitWorldPosition([...pos] as [number, number, number]))).toEqual([
        ...pos,
      ]);
    }
  });
});

describe('yaw mapping', () => {
  it('negates between store and document conventions', () => {
    expect(docYawFromStoreYaw(90)).toBe(270);
    expect(storeYawFromDocYaw(270)).toBe(90);
    expect(docYawFromStoreYaw(0)).toBe(0);
  });

  it('splitDocYaw with snap lands on 90° steps with no residual', () => {
    expect(splitDocYaw(275, true)).toEqual({ rotation: 90, freeYawDeg: 0 });
  });

  it('splitDocYaw without snap keeps the exact yaw as snapped + residual', () => {
    const { rotation, freeYawDeg } = splitDocYaw(283, false);
    expect(rotation).toBe(90);
    expect(freeYawDeg).toBeCloseTo(-13); // store yaw 77 = 90 - 13
    // Recompose: document yaw = -(rotation + freeYawDeg) mod 360
    expect(docYawFromStoreYaw(rotation + freeYawDeg)).toBeCloseTo(283);
  });
});

describe('rotation matrices and rot24', () => {
  it('identity pose decomposes to (+z, +x) with zero residual', () => {
    const g = gridPoseOf(placed());
    expect(g.rot24).toEqual({ z: '+z', x: '+x' });
    expect(g.residualYawDeg).toBeCloseTo(0);
  });

  it('all 24 table entries are proper rotations and unique', () => {
    expect(ROT24_TABLE).toHaveLength(24);
    const seen = new Set<string>();
    for (const { name, matrix } of ROT24_TABLE) {
      expect(matrix.determinant()).toBeCloseTo(1);
      const key = matrix.elements.map(v => Math.round(v)).join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      // Round-trip: decomposing the matrix itself returns the same name.
      const dec = decomposeRot24(matrix);
      expect(dec.rot24).toEqual(name);
      expect(dec.offsetDeg.x).toBeCloseTo(0);
      expect(dec.offsetDeg.y).toBeCloseTo(0);
      expect(dec.offsetDeg.z).toBeCloseTo(0);
    }
  });

  it('store yaw 90 decomposes to a pure rot24 (no residual)', () => {
    const dec = decomposeRot24(docRotationMatrix(placed({ rotation: 90 })));
    expect(dec.rot24.z).toBe('+z'); // yaw never tips the part over
    expect(Math.abs(dec.offsetDeg.z)).toBeLessThan(1e-6);
  });

  it('every 90° euler combination lands exactly on one of the 24', () => {
    for (const rotation of [0, 90, 180, 270]) {
      for (const tiltRotation of [0, 90, 180, 270]) {
        for (const topRotation of [0, 90, 180, 270]) {
          const dec = decomposeRot24(
            docRotationMatrix(placed({ rotation, tiltRotation, topRotation })),
          );
          expect(Math.abs(dec.offsetDeg.x)).toBeLessThan(1e-6);
          expect(Math.abs(dec.offsetDeg.y)).toBeLessThan(1e-6);
          expect(Math.abs(dec.offsetDeg.z)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('free yaw shows up as residual z rotation, R = R24·ΔR', () => {
    const m = placed({ rotation: 90, params: { [DOC_PARAMS_KEY]: { freeYawDeg: 10 } } });
    const full = docRotationMatrix(m);
    const dec = decomposeRot24(full);
    const recomposed = rot24Matrix(dec.rot24).multiply(dec.residual);
    for (let i = 0; i < 16; i++) {
      expect(recomposed.elements[i]).toBeCloseTo(full.elements[i]);
    }
    // Total residual angle is 10°, expressed in the part's local frame.
    const q = new THREE.Quaternion().setFromRotationMatrix(dec.residual);
    expect(2 * Math.acos(Math.min(1, Math.abs(q.w))) * (180 / Math.PI)).toBeCloseTo(10, 4);
  });

  it('worldPose yaw reflects snapped rotation plus free residual', () => {
    const m = placed({ rotation: 90, params: { [DOC_PARAMS_KEY]: { freeYawDeg: 10 } } });
    expect(worldPoseOf(m).yawDeg).toBeCloseTo(260); // -(90+10) mod 360
  });
});

describe('offset-deg residual triple (WP-28)', () => {
  it('migrates legacy freeYawDeg on read (offsetDeg.z = -freeYawDeg)', () => {
    const m = placed({ params: { [DOC_PARAMS_KEY]: { freeYawDeg: 10 } } });
    expect(getDocParams(m).offsetDeg).toEqual({ x: 0, y: 0, z: -10 });
    // An explicit offsetDeg wins over a stale legacy value.
    const m2 = placed({
      params: { [DOC_PARAMS_KEY]: { freeYawDeg: 10, offsetDeg: { x: 1, y: 2, z: 3 } } },
    });
    expect(getDocParams(m2).offsetDeg).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('x/y tilts round-trip exactly through gridPoseOf (R = R24·ΔR)', () => {
    const offsetDeg = { x: 2, y: -0.75, z: -13 };
    const m = placed({ rotation: 90, params: { [DOC_PARAMS_KEY]: { offsetDeg } } });
    const g = gridPoseOf(m);
    expect(g.rot24.z).toBe('+z');
    expect(g.offsetDeg.x).toBeCloseTo(2, 6);
    expect(g.offsetDeg.y).toBeCloseTo(-0.75, 6);
    expect(g.offsetDeg.z).toBeCloseTo(-13, 6);
    expect(g.residualYawDeg).toBeCloseTo(-13, 6);
  });

  it('residual on a TIPPED part is exact (the pre-WP-28 approximation case)', () => {
    // Lay the part on its side (tilt 90° → local z along a horizontal axis),
    // then apply a residual yaw about its LOCAL z. Decomposition must return
    // the same rot24 and the same local residual — no global-yaw smearing.
    const tipped = placed({ tiltRotation: 90 });
    const base = gridPoseOf(tipped).rot24;
    expect(base.z === '+z' || base.z === '-z').toBe(false);
    const m = placed({
      tiltRotation: 90,
      params: { [DOC_PARAMS_KEY]: { offsetDeg: { x: 0, y: 0, z: 5 } } },
    });
    const g = gridPoseOf(m);
    expect(g.rot24).toEqual(base);
    expect(g.offsetDeg.x).toBeCloseTo(0, 6);
    expect(g.offsetDeg.y).toBeCloseTo(0, 6);
    expect(g.offsetDeg.z).toBeCloseTo(5, 6);
  });
});

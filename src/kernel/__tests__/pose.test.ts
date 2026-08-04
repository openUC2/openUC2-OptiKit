/**
 * The DOF-composed pose feeding the tier-2 drag fast path: translations
 * compose along the record-local axis rotated to world — the same
 * `apply_dof_values` semantics the backend applies at settle, so the preview
 * delta and the settled scene agree.
 */

import { describe, expect, it } from 'vitest';
import type { WorldPose } from '../pose';
import { poseDelta, poseWithDofTranslations, samePose } from '../pose';

// DEFAULT_LIB_ROT {z:'+x', x:'-z'} as a quaternion: +90° about world Y
// (record +z → world +x, record +x → world −z).
const LIB_ROT: WorldPose['rotation'] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

describe('poseWithDofTranslations', () => {
  it('composes a translation dof along the record axis, rotated to world', () => {
    const pose: WorldPose = { positionMm: [10, 20, 30], rotation: LIB_ROT };
    const composed = poseWithDofTranslations(
      pose,
      [{ name: 'dz', value: 5 }],
      [{ name: 'dz', axis: 'z', kind: 'translation' }],
    );
    // Record-local +z points along world +x under the default library rotation.
    expect(composed.positionMm[0]).toBeCloseTo(15, 12);
    expect(composed.positionMm[1]).toBeCloseTo(20, 12);
    expect(composed.positionMm[2]).toBeCloseTo(30, 12);
    expect(composed.rotation).toBe(pose.rotation);
  });

  it('a dof drag yields the pure world translation delta', () => {
    const bindings = [{ name: 'dz', axis: 'z' as const, kind: 'translation' }];
    const pose: WorldPose = { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const before = poseWithDofTranslations(pose, [{ name: 'dz', value: 1 }], bindings);
    const after = poseWithDofTranslations(pose, [{ name: 'dz', value: 3.5 }], bindings);
    const delta = poseDelta(before, after);
    expect(delta[0]).toBeCloseTo(0, 12);
    expect(delta[1]).toBeCloseTo(0, 12);
    expect(delta[2]).toBeCloseTo(2.5, 12); // identity rotation: record z = world z
    expect(delta.slice(3)).toEqual([0, 0, 0, 1]);
  });

  it('rotation-kind, unknown, and absent dofs leave the pose untouched', () => {
    const pose: WorldPose = { positionMm: [1, 2, 3], rotation: [0, 0, 0, 1] };
    expect(
      poseWithDofTranslations(pose, [{ name: 'tilt', value: 4 }],
        [{ name: 'tilt', axis: 'x', kind: 'rotation' }]),
    ).toBe(pose);
    expect(
      poseWithDofTranslations(pose, [{ name: 'ghost', value: 4 }],
        [{ name: 'dz', axis: 'z', kind: 'translation' }]),
    ).toBe(pose);
    expect(samePose(pose, poseWithDofTranslations(pose, [], undefined))).toBe(true);
  });
});

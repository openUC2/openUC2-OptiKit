/**
 * WP-54: share links — design files → deflate+base64url → design files.
 * CompressionStream is native (Node 18+/all evergreen browsers).
 */

import { describe, expect, it } from 'vitest';
import { INLINE_LIMIT, decodeShareParam, encodeShareParam } from '../shareLink';

const FILES = {
  'optikit-design.yml': [
    'optikit-version: v0.0.0-alpha.1',
    'design: {name: shared, version: 0.1.0}',
    'components:',
    '  laser:',
    '    type: primitive',
    '    primitive: {type: glb, model: openuc2.cube.laser_488nm}',
    '    pose:',
    '      rotation: {type: grid, grid: {z: +x, x: -z}}',
    '      translation: {offset-grid: {x: 2}}',
  ].join('\n'),
};

describe('share link round trip', () => {
  it('encodes and decodes the file map losslessly', async () => {
    const param = await encodeShareParam(FILES);
    // base64url: no +, /, = — safe in a query string without escaping.
    expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = await decodeShareParam(param);
    expect(decoded).toEqual(FILES);
  });

  it('compresses a typical design well under the inline limit', async () => {
    const param = await encodeShareParam(FILES);
    expect(param.length).toBeLessThan(INLINE_LIMIT);
  });

  it('rejects a corrupt payload', async () => {
    await expect(decodeShareParam('not-a-real-payload')).rejects.toThrow();
  });

  it('rejects a payload that is not a file map', async () => {
    const bogus = await encodeShareParam(
      // an array disguised as files — decode must refuse
      ['x'] as unknown as Record<string, string>,
    );
    await expect(decodeShareParam(bogus)).rejects.toThrow(/file map/);
  });
});

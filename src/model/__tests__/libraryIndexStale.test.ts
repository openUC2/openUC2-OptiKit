/**
 * WP-128: the "your service is older than your app" probe.
 *
 * Rounds 18 and 19 both ended with fixes that appeared not to work: the
 * frontend was current, the long-running dev service on :8000 was not, and
 * an index built before the frame contract loses ports-frame, mesh-frame and
 * the mirror aperture WITHOUT any error. The UI needs to be able to say so.
 */

import { describe, expect, it } from 'vitest';
import { indexPredatesFrameContract } from '../libraryIndex';
import type { IndexModule } from '../libraryIndex';

const mod = (over: Partial<IndexModule> = {}): IndexModule =>
  ({ id: 'user.cube.x', ports: [], ...over }) as IndexModule;

describe('indexPredatesFrameContract', () => {
  it('flags an index whose modules carry no ports_frame at all', () => {
    expect(indexPredatesFrameContract({ modules: [mod(), mod({ id: 'y' })] })).toBe(true);
  });

  it('stays quiet once the service stamps the field', () => {
    expect(
      indexPredatesFrameContract({ modules: [mod({ ports_frame: 'record' }), mod({ id: 'y' })] }),
    ).toBe(false);
  });

  it('says nothing about an empty or missing index — that is a different problem', () => {
    expect(indexPredatesFrameContract({ modules: [] })).toBe(false);
    expect(indexPredatesFrameContract(null)).toBe(false);
    expect(indexPredatesFrameContract(undefined)).toBe(false);
  });
});

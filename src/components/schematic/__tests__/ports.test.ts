/**
 * Schematic port/axis derivation from the retained source design (feedback
 * round 1: imported parts rendered with the wrong orientation because pins
 * and glyphs assumed the +x palette convention instead of the real
 * optics.ports).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DocPart } from '../../../document';
import { useSourceDesignStore } from '../../../document/sourceDesignStore';
import { opticalAxisOf, portsOf, resolvePortRef } from '../ports';

const FLUO_YAML = readFileSync(
  join(__dirname, '..', '..', '..', 'model', 'dsn', '__tests__', 'fixtures', 'fluo-scope.dsn.yml'),
  'utf8',
);

function makePart(key: string, over: Partial<DocPart> = {}): DocPart {
  return {
    id: `p-${key}`,
    ref: key,
    category: 'other',
    libraryRef: `glb-${key}`,
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1] },
    gridPose: { cell: [0, 0, 0], offsetMm: [0, 0, 0], rot24: { z: '+z', x: '+x' }, residualYawDeg: 0 },
    dofs: [],
    params: {},
    ...over,
  } as DocPart;
}

beforeEach(() => {
  useSourceDesignStore.getState().setSource(FLUO_YAML, {
    'p-laser': 'laser',
    'p-dichroic': 'dichroic',
    'p-objective': 'objective',
    'p-camera': 'camera',
  });
});

describe('portsOf with a retained source design', () => {
  it('places the objective pins on its real ±z axis with datum offsets', () => {
    const ports = portsOf(makePart('objective'));
    const byName = Object.fromEntries(ports.map(p => [p.name, p]));
    expect(byName.front.localDir).toEqual([0, 0, -1]);
    expect(byName.front.localMm).toEqual([0, 0, -22]); // optical frame + stand-off
    expect(byName.back.localDir).toEqual([0, 0, 1]);
    expect(byName.back.localMm).toEqual([0, 0, 27]); // exit frame z=5 + stand-off
    expect(byName.front.kind).toBe('input');
    expect(byName.back.kind).toBe('output');
  });

  it('exposes the dichroic fold ports on their own axes', () => {
    const dirs = Object.fromEntries(
      portsOf(makePart('dichroic')).map(p => [p.name, p.localDir]),
    );
    expect(dirs.front).toEqual([-1, 0, 0]);
    expect(dirs.reflected).toEqual([0, 0, -1]);
    expect(dirs.transmitted).toEqual([0, 0, 1]);
  });
});

describe('opticalAxisOf', () => {
  it('derives the beam axis from the real ports (vertical stack = +z)', () => {
    expect(opticalAxisOf(makePart('objective'))).toEqual([0, 0, 1]); // −front
    expect(opticalAxisOf(makePart('laser'))).toEqual([0, 0, 1]); // out
    expect(opticalAxisOf(makePart('camera'))).toEqual([0, 0, 1]); // −sensor
    expect(opticalAxisOf(makePart('dichroic'))).toEqual([1, 0, 0]); // −front(−x)
  });

  it('falls back to the +x palette convention without a source', () => {
    useSourceDesignStore.getState().clear();
    expect(opticalAxisOf(makePart('anything'))).toEqual([1, 0, 0]);
  });
});

describe('resolvePortRef', () => {
  it('anchors traversal refs (front>back) at the entry port', () => {
    const part = makePart('objective', {
      worldPose: { positionMm: [0, 0, 50], rotation: [0, 0, 0, 1] },
    });
    expect(resolvePortRef([part], 'p-objective.front>back')).toEqual([0, 0, 28]);
    expect(resolvePortRef([part], 'p-objective.back')).toEqual([0, 0, 77]);
  });
});

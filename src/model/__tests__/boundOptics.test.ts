/**
 * WP-114 — the component and the template must agree about where the optic
 * sits, and a clicked datum must record the fold.
 *
 * Field report: publishing from the cube wizard produced
 *   E_POSE_MISMATCH — template user.tpl.X holds frame 'front' but component
 *   user.mirror.X declares no such datum frame
 * and the published mirror rendered unfolded in the assembly. Both came from
 * the same place: the datum-derived optics were built and then thrown away.
 */

import { describe, expect, it } from 'vitest';
import { bindToRecords, withBoundOptics, type BindDatum } from '../bindRecord';
import { defaultDraft, draftToRecord } from '../componentRecord';

const clickedMirror: BindDatum = {
  id: 'datum-1',
  name: 'front',
  kind: 'reflective',
  // clicked on the 45° face: normal halfway between +x and +z
  pointMm: [3.2, -5.06, 3.2],
  direction: [Math.SQRT1_2, 0, Math.SQRT1_2],
  areaDiameterMm: 25,
};

const bind = (datums: BindDatum[]) =>
  bindToRecords({
    namespace: 'user',
    name: 'mirr-test',
    category: 'mirror',
    templateClass: 'fixed',
    meshFile: 'cube.glb',
    meshTransform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
    datums,
    existingComponent: null,
    wholeModule: true,
  });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('a CLICKED mirror datum records the fold (WP-114)', () => {
  it('emits both beam endpoints, not a single port', () => {
    const ports = ((bind([clickedMirror]).component as Json).optics as Json).ports as Json;
    // Before: only `front`, so nothing said the beam turned.
    expect(Object.keys(ports).sort()).toEqual(['front', 'reflected']);
    expect(ports.reflected['after-surface']).toBe(0);
  });

  it('declares the template insert frame the datum sits at', () => {
    const template = bind([clickedMirror]).template as Json;
    expect(template.provenance).toBe('whole-module');
    // Empty `frames` is what made verify-t1's OK vacuous (W_NO_INSERT_FRAME).
    expect(Object.keys(template.frames ?? {})).toContain('front');
  });
});

describe('withBoundOptics (WP-114)', () => {
  it('gives the component the SAME frames the template declares', () => {
    const draft = defaultDraft('mirror');
    draft.name = 'mirr-test';
    const bound = bind([clickedMirror]);
    const merged = withBoundOptics(
      draftToRecord(draft) as unknown as Record<string, unknown>,
      bound,
    ) as Json;

    const componentFrames = Object.keys(merged.optics.frames);
    const templateFrames = Object.keys((bound.template as Json).frames);
    for (const name of templateFrames) {
      // verify_t1 walks the template's frames and demands the component
      // declare each one — this is the exact assertion it makes.
      expect(componentFrames).toContain(name);
    }
    expect(merged.optics.frames.front).toEqual((bound.template as Json).frames.front);
  });

  it('keeps the draft prescription — the datums say WHERE, not WHAT', () => {
    const draft = defaultDraft('mirror');
    draft.name = 'mirr-test';
    draft.surfaces[0].material = 'N-BK7';
    const merged = withBoundOptics(
      draftToRecord(draft) as unknown as Record<string, unknown>,
      bind([clickedMirror]),
    ) as Json;
    expect(merged.optics.fragment.surfaces).toHaveLength(2);
    expect(merged.optics.fragment.surfaces[0].material_post.name).toBe('N-BK7');
    expect(merged.category).toBe('mirror');
  });

  it('leaves a draft with no datums exactly as authored', () => {
    const draft = defaultDraft('lens');
    draft.name = 'plain-lens';
    const record = draftToRecord(draft) as unknown as Record<string, unknown>;
    expect(withBoundOptics(record, bind([]))).toEqual(record);
  });

  it('does not touch a pair bound to an EXISTING library component', () => {
    const draft = defaultDraft('mirror');
    draft.name = 'mirr-test';
    const record = draftToRecord(draft) as unknown as Record<string, unknown>;
    const bound = bindToRecords({
      namespace: 'user',
      name: 'mirr-test',
      category: 'mirror',
      templateClass: 'fixed',
      meshFile: 'cube.glb',
      meshTransform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
      datums: [clickedMirror],
      existingComponent: { id: 'openuc2.mirror.flat', version: '1.0.0' },
      wholeModule: true,
    });
    expect(bound.component).toBeNull();
    expect(withBoundOptics(record, bound)).toEqual(record);
  });
});

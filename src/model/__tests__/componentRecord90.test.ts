/** WP-90: per-category authoring — substrates, rectangular apertures, the
 * `mechanics:` reference, spectral bands. */

import { describe, expect, it } from 'vitest';
import {
  defaultDraft,
  draftFromRecord,
  draftToRecord,
  recordFromYaml,
  recordToYaml,
  validateDraft,
} from '../componentRecord';

function roundTrip(draft: ReturnType<typeof defaultDraft>) {
  return draftFromRecord(recordFromYaml(recordToYaml(draftToRecord(draft))));
}

describe('WP-90 mirror substrate', () => {
  it('a mirror seeds a substrate, not a bare reflective flat', () => {
    const draft = defaultDraft('mirror');
    expect(draft.surfaces).toHaveLength(2);
    expect(draft.surfaces[0].reflective).toBe(true);
    expect(draft.surfaces[0].thicknessMm).toBeGreaterThan(0);
    expect(draft.surfaces[0].material).toBe('N-BK7');
    expect(draft.surfaces[1].thicknessMm).toBeNull();
    expect(validateDraft({ ...draft, name: 'fold' })).toEqual([]);
  });
});

describe('WP-90 rectangular apertures', () => {
  it('serializes as Optiland RectangularAperture and reopens', () => {
    const draft = defaultDraft('mirror');
    draft.name = 'fold-rect';
    draft.surfaces[0].apertureRectMm = [36, 25];
    const record = draftToRecord(draft) as unknown as {
      optics: { fragment: { surfaces: Record<string, unknown>[] } };
    };
    expect(record.optics.fragment.surfaces[0].aperture).toEqual({
      type: 'RectangularAperture',
      x_min: -18,
      x_max: 18,
      y_min: -12.5,
      y_max: 12.5,
    });
    const reopened = roundTrip(draft);
    expect(reopened.surfaces[0].apertureRectMm).toEqual([36, 25]);
    expect(validateDraft(draft)).toEqual([]);
  });

  it('rejects a degenerate rectangle', () => {
    const draft = defaultDraft('mirror');
    draft.name = 'bad';
    draft.surfaces[0].apertureRectMm = [0, 10];
    expect(validateDraft(draft).some(e => /rectangular aperture/.test(e))).toBe(true);
  });
});

describe('WP-90/WP-74 response bands', () => {
  it('a dichroic writes its reflect band on the coated surface', () => {
    const draft = defaultDraft('dichroic');
    draft.name = 'lp505';
    draft.responseBandUm = [null, 0.505];
    const record = draftToRecord(draft) as unknown as {
      optics: { fragment: { surfaces: { response?: unknown }[] } };
    };
    const responses = record.optics.fragment.surfaces.map(s => s.response);
    expect(responses.filter(Boolean)).toHaveLength(1);
    expect(responses[0]).toEqual({ kind: 'dichroic', 'reflect-bands-um': [[null, 0.505]] });
    expect(roundTrip(draft).responseBandUm).toEqual([null, 0.505]);
  });

  it('a filter writes an absorptive transmit band', () => {
    const draft = defaultDraft('filter');
    draft.name = 'bp525';
    draft.responseBandUm = [0.5, 0.55];
    const record = draftToRecord(draft) as unknown as {
      optics: { fragment: { surfaces: { response?: unknown }[] } };
    };
    expect(record.optics.fragment.surfaces[0].response).toEqual({
      kind: 'absorptive',
      'transmit-bands-um': [[0.5, 0.55]],
    });
  });

  it('rejects an inverted band', () => {
    const draft = defaultDraft('dichroic');
    draft.name = 'bad';
    draft.responseBandUm = [0.6, 0.5];
    expect(validateDraft(draft).some(e => /response band/.test(e))).toBe(true);
  });
});

describe('WP-90 frame clear aperture', () => {
  it('round-trips clear-aperture-mm (the editor used to drop it)', () => {
    const draft = defaultDraft('lens');
    draft.name = 'apertured';
    draft.frames = [{ name: 'optical', zMm: 0, clearApertureMm: 22.86 }];
    const record = draftToRecord(draft) as unknown as {
      optics: { frames: Record<string, Record<string, unknown>> };
    };
    expect(record.optics.frames.optical['clear-aperture-mm']).toBe(22.86);
    expect(roundTrip(draft).frames[0].clearApertureMm).toBe(22.86);
  });
});

describe('WP-90 mechanics reference', () => {
  it('a component can name its housing template directly', () => {
    const draft = defaultDraft('source');
    draft.name = 'laser-488';
    draft.mechanicsTemplate = 'user.tpl.laser_488_housing';
    const record = draftToRecord(draft) as unknown as { mechanics?: { template: string } };
    expect(record.mechanics).toEqual({ template: 'user.tpl.laser_488_housing' });
    expect(roundTrip(draft).mechanicsTemplate).toBe('user.tpl.laser_488_housing');
  });

  it('omits the block when no reference is set', () => {
    const draft = defaultDraft('lens');
    draft.name = 'plain';
    const record = draftToRecord(draft) as unknown as { mechanics?: unknown };
    expect(record.mechanics).toBeUndefined();
  });
});

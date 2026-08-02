/**
 * WP-112 — the source-side optics a housed device needs: beam diameter and
 * power are TYPED SourceSpec fields (declared in optikit-core), and they
 * must survive the draft → record → draft round trip.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultDraft,
  draftFromRecord,
  draftToRecord,
  validateDraft,
} from '../componentRecord';

describe('source beam diameter + power (WP-112)', () => {
  it('serializes into the source block and round-trips', () => {
    const draft = defaultDraft('source');
    draft.name = 'omicron-488';
    draft.sourceWavelengthsUm = [0.488];
    draft.sourceDivergenceDeg = 0.06;
    draft.sourceBeamDiameterMm = 0.7;
    draft.sourcePowerMw = 60;
    const record = draftToRecord(draft) as unknown as {
      source?: { beam_diameter_mm?: number; power_mw?: number };
    };
    expect(record.source?.beam_diameter_mm).toBe(0.7);
    expect(record.source?.power_mw).toBe(60);

    const reopened = draftFromRecord(draftToRecord(draft));
    expect(reopened.sourceBeamDiameterMm).toBe(0.7);
    expect(reopened.sourcePowerMw).toBe(60);
  });

  it('omits the fields when undeclared (no folklore nulls in the YAML)', () => {
    const draft = defaultDraft('source');
    draft.name = 'plain';
    const record = draftToRecord(draft) as unknown as { source?: Record<string, unknown> };
    expect('beam_diameter_mm' in (record.source ?? {})).toBe(false);
    expect('power_mw' in (record.source ?? {})).toBe(false);
  });

  it('rejects non-positive values when declared', () => {
    const draft = defaultDraft('source');
    draft.name = 'bad';
    draft.sourceBeamDiameterMm = 0;
    draft.sourcePowerMw = -5;
    const errors = validateDraft(draft);
    expect(errors.some(e => e.includes('beam diameter'))).toBe(true);
    expect(errors.some(e => e.includes('power'))).toBe(true);
  });
});

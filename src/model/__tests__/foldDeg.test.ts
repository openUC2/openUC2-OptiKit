/**
 * WP-107: the parts editor derives a record's beam fold the same way the
 * schematic canvas does — from the ports — so the two previews of one record
 * agree by construction instead of by coincidence.
 *
 * Before this, `GlyphPreview` passed no fold at all, `SchematicGlyph` fell
 * back to `foldDeg ?? 180`, and `plateAngle(180)` is a zero rotation: every
 * mirror in the editor drew as a disc square to the beam, which is the one
 * thing a fold mirror never is.
 */

import { describe, expect, it } from 'vitest';
import { defaultDraft, foldDegOfDraft, type RecordDraft } from '../componentRecord';

const withPorts = (draft: RecordDraft, ports: [string, string][]): RecordDraft => ({
  ...draft,
  ports: ports.map(([name, direction]) => ({
    name,
    frame: 'optical',
    direction,
    afterSurface: null,
  })),
});

describe('foldDegOfDraft', () => {
  it('a 45° fold mirror folds the beam by 90°', () => {
    const draft = withPorts(defaultDraft('mirror'), [['front', '-z'], ['reflected', '+x']]);
    expect(foldDegOfDraft(draft)).toBeCloseTo(90, 6);
  });

  it('the fold is unsigned — a mirror folding the other way still reads 90°', () => {
    // The glyph draws its exit arm toward +y and the canvas re-orients it, so
    // the magnitude is what the preview needs.
    const draft = withPorts(defaultDraft('mirror'), [['front', '-z'], ['reflected', '-x']]);
    expect(foldDegOfDraft(draft)).toBeCloseTo(90, 6);
  });

  it('a retro mirror folds by 180°', () => {
    // An OUTPUT port's direction is the beam's exit TRAVEL, while an input
    // port's is the face it presents — so `front: -z` means the beam travels
    // +z into the part, and a retro sends it back out along -z.
    const draft = withPorts(defaultDraft('mirror'), [['front', '-z'], ['reflected', '-z']]);
    expect(foldDegOfDraft(draft)).toBeCloseTo(180, 6);
  });

  it('a straight-through lens has no fold', () => {
    const draft = withPorts(defaultDraft('lens'), [['front', '-z'], ['back', '+z']]);
    expect(foldDegOfDraft(draft)).toBeNull();
  });

  it('falls back to the mount angle when only an entry port is declared', () => {
    // θ=45 → 90 (a right-angle fold), θ=30 → 120, θ=0 → 180 (retro) — the
    // same relation `derivedReflectedDir` encodes.
    const base = withPorts(defaultDraft('mirror'), [['front', '-z']]);
    expect(foldDegOfDraft({ ...base, mirrorAngleDeg: 45 })).toBeCloseTo(90, 6);
    expect(foldDegOfDraft({ ...base, mirrorAngleDeg: 30 })).toBeCloseTo(120, 6);
    expect(foldDegOfDraft({ ...base, mirrorAngleDeg: 0 })).toBeCloseTo(180, 6);
  });

  it('ports win over the mount angle when both are present', () => {
    const draft = withPorts(defaultDraft('mirror'), [['front', '-z'], ['reflected', '+x']]);
    // A record claiming θ=10 but wired as a right-angle fold folds by 90°.
    expect(foldDegOfDraft({ ...draft, mirrorAngleDeg: 10 })).toBeCloseTo(90, 6);
  });

  it("a lens with no mount angle and no exit port has no fold to invent", () => {
    const draft = withPorts(defaultDraft('lens'), [['front', '-z']]);
    expect(foldDegOfDraft(draft)).toBeNull();
  });

  it('the shipped mirror default already folds at 90°', () => {
    // defaultDraft('mirror') sets mirrorAngleDeg 45 and a reflected port —
    // the editor's own starting point must preview correctly.
    expect(foldDegOfDraft(defaultDraft('mirror'))).toBeCloseTo(90, 6);
  });
});

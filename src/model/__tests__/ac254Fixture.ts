/**
 * The WP-14 acceptance draft: Thorlabs AC254-050-A from datasheet values
 * (R1 33.34 / R2 −22.28 / R3 −291.07 mm, CT 9.0 + 2.5 mm, N-BAF10 + N-SF10,
 * Ø25.4 mm). Shared between the unit tests and the fixture generator so the
 * committed YAML is exactly what the editor's download button produces.
 */

import { defaultDraft, type RecordDraft } from '../componentRecord';

export function ac254Draft(): RecordDraft {
  const draft = defaultDraft('lens');
  draft.namespace = 'user';
  draft.name = 'ac254-050-a';
  draft.version = '0.1.0';
  draft.description = 'Thorlabs AC254-050-A f=50 mm Ø25.4 mm achromatic doublet (datasheet values)';
  draft.vendorName = 'Thorlabs';
  draft.vendorMpn = 'AC254-050-A';
  draft.surfaces = [
    { radiusMm: 33.34, thicknessMm: 9.0, material: 'N-BAF10', semiApertureMm: 12.7, conic: 0, isStop: true, reflective: false },
    { radiusMm: -22.28, thicknessMm: 2.5, material: 'N-SF10', semiApertureMm: 12.7, conic: 0, isStop: false, reflective: false },
    { radiusMm: -291.07, thicknessMm: null, material: '', semiApertureMm: 12.7, conic: 0, isStop: false, reflective: false },
  ];
  draft.frames = [
    { name: 'optical', zMm: 0 },
    { name: 'exit', zMm: 11.5 },
    { name: 'mount', zMm: 5.75 },
  ];
  draft.ports = [
    { name: 'front', frame: 'optical', direction: '-z', afterSurface: null },
    { name: 'back', frame: 'exit', direction: '+z', afterSurface: 2 },
  ];
  return draft;
}

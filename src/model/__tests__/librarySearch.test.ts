/**
 * WP-106: one search predicate and one label derivation, shared by the parts
 * editor and the schematic palette.
 *
 * The parts editor had no search at all; the schematic's matched
 * `module.name` and nothing else, so "thorlabs", "AC254" and "525" — the
 * things people actually type — found nothing in either place.
 */

import { describe, expect, it } from 'vitest';
import { displayNameOf, matchesQuery, slugOf } from '../librarySearch';

const FLAT_45 = {
  id: 'openuc2.mirror.flat_45',
  name: 'flat 45',
  description: 'Flat first-surface mirror mounted at 45°',
  category: 'mirror',
  tags: ['mirror', 'mirror/flat'],
};

const AC254 = {
  id: 'thorlabs.lens.ac254-050-a',
  name: 'ac254 050 a',
  description: 'AC254-050-A POSITIVE VISIBLE ACHROMATS: Infinite 50',
  category: 'lens',
  vendorName: 'Thorlabs',
  mpn: 'AC254-050-A',
};

const FILTER = {
  id: 'openuc2.filter.emission_525',
  name: 'emission 525',
  description: 'Band-pass emission filter (510-560 nm) in a 1x1 cube',
  category: 'filter',
};

describe('matchesQuery', () => {
  it('an empty query matches everything', () => {
    expect(matchesQuery('', FLAT_45)).toBe(true);
    expect(matchesQuery('   ', FLAT_45)).toBe(true);
  });

  it('finds a part by its vendor and part number — the schematic could not', () => {
    expect(matchesQuery('thorlabs', AC254)).toBe(true);
    expect(matchesQuery('AC254', AC254)).toBe(true);
    expect(matchesQuery('thorlabs', FLAT_45)).toBe(false);
  });

  it('treats dots, underscores and dashes as spaces, both ways round', () => {
    // The user types with spaces; the id has underscores.
    expect(matchesQuery('flat 45', FLAT_45)).toBe(true);
    // …or the other way: they paste the id and the name has spaces.
    expect(matchesQuery('flat_45', FLAT_45)).toBe(true);
    expect(matchesQuery('ac254 050', AC254)).toBe(true);
    expect(matchesQuery('ac254-050-a', AC254)).toBe(true);
  });

  it('finds a filter by a wavelength that only appears in its description', () => {
    expect(matchesQuery('525', FILTER)).toBe(true);
    expect(matchesQuery('510', FILTER)).toBe(true);
  });

  it('ANDs the terms, so a second word narrows', () => {
    expect(matchesQuery('mirror flat', FLAT_45)).toBe(true);
    expect(matchesQuery('mirror lens', FLAT_45)).toBe(false);
  });

  it('matches on category and tags too', () => {
    expect(matchesQuery('mirror', FLAT_45)).toBe(true);
    expect(matchesQuery('lens', AC254)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesQuery('THORLABS', AC254)).toBe(true);
  });
});

describe('displayNameOf / slugOf', () => {
  it('derives a readable name from the id slug', () => {
    expect(displayNameOf('openuc2.mirror.flat_45')).toBe('Flat 45');
    expect(displayNameOf('openuc2.detector.camera_basic')).toBe('Camera Basic');
  });

  it('leaves tokens that carry meaning alone', () => {
    // 1x1 must not become "1X1", 488nm must not become "488Nm".
    expect(displayNameOf('openuc2.cube.mirror_1x1')).toBe('Mirror 1x1');
    expect(displayNameOf('openuc2.cube.laser_488nm')).toBe('Laser 488nm');
  });

  it('prefers an explicit title when a record ever carries one', () => {
    expect(displayNameOf('openuc2.mirror.flat_45', '45° fold mirror')).toBe('45° fold mirror');
    expect(displayNameOf('openuc2.mirror.flat_45', '  ')).toBe('Flat 45');
  });

  it('collapses repeated separators — the one way the five copies differed', () => {
    expect(slugOf('user.lens.my__part')).toBe('my part');
  });

  it('derived names DO collide, which is why the id is never hidden', () => {
    // Both of these are real ids in the library.
    expect(displayNameOf('openuc2.cube.flat_45')).toBe(displayNameOf('openuc2.mirror.flat_45'));
  });
});

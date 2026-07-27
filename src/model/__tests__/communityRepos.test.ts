/**
 * WP-58: mounting community libraries from GitHub.
 *
 * The rule that matters: a community repo can ADD parts but never silently
 * override a curated `openuc2.*` one. Shadowing is reported, not applied.
 */

import { describe, expect, it } from 'vitest';
import { mergeRepoIndexes, parseRepoUrl, rawUrl } from '../communityRepos';
import type { MountedRepo } from '../communityRepos';
import type { IndexModule, LibraryIndex } from '../libraryIndex';

const mod = (id: string): IndexModule =>
  ({
    id, version: '0.1.0', kind: 'cube_module', description: '', tags: [],
    category: 'lens', thumbnail: null, footprint_grid: [1, 1, 1], review: false,
    component: { ref: 'x@^0.1', resolved: null, vendor: null, efl_mm: null },
    template: { ref: 't@^0.1', resolved: null, class: 'fixed', actuatable: false },
    ports: [], electronics: null,
  }) as IndexModule;

const repo = (slug: string, modules: IndexModule[]): MountedRepo => ({
  url: `https://github.com/${slug}`,
  slug,
  ref: 'main',
  loading: false,
  error: null,
  index: {
    schema: 'optikit-library-index/0.1',
    count: modules.length,
    modules,
    components: [],
    groups: [],
  } as unknown as LibraryIndex,
});

describe('parseRepoUrl', () => {
  it('accepts the forms people actually paste', () => {
    for (const raw of [
      'https://github.com/openUC2/optikit-community-template',
      'https://github.com/openUC2/optikit-community-template/',
      'https://github.com/openUC2/optikit-community-template.git',
      'http://www.github.com/openUC2/optikit-community-template',
      '  https://github.com/openUC2/optikit-community-template  ',
    ]) {
      expect(parseRepoUrl(raw)?.slug).toBe('openUC2/optikit-community-template');
    }
  });

  it('rejects anything that is not a GitHub repo', () => {
    for (const raw of [
      'https://gitlab.com/a/b',
      'https://github.com/openUC2',
      'not a url',
      'javascript:alert(1)',
      '',
    ]) {
      expect(parseRepoUrl(raw)).toBeNull();
    }
  });

  it('builds the raw URL the index is actually fetched from', () => {
    const r = parseRepoUrl('https://github.com/me/parts', 'v1.2')!;
    expect(rawUrl(r, 'library-index.json')).toBe(
      'https://raw.githubusercontent.com/me/parts/v1.2/library-index.json',
    );
  });
});

describe('mergeRepoIndexes', () => {
  it('adds community parts alongside the builtin ones', () => {
    const merged = mergeRepoIndexes(
      [mod('openuc2.cube.mirror_1x1')],
      [],
      [repo('me/parts', [mod('user.cube.my_lens')])],
    );
    expect(merged.modules.map(m => m.id).sort()).toEqual([
      'openuc2.cube.mirror_1x1',
      'user.cube.my_lens',
    ]);
    expect(merged.shadowed).toEqual([]);
  });

  it('badges community parts with the repo they came from', () => {
    const merged = mergeRepoIndexes([], [], [repo('me/parts', [mod('user.cube.a')])]);
    expect((merged.modules[0] as { repo?: string }).repo).toBe('me/parts');
  });

  it('never lets a community repo override a curated id — and says so', () => {
    const merged = mergeRepoIndexes(
      [mod('openuc2.cube.mirror_1x1')],
      [],
      [repo('evil/parts', [mod('openuc2.cube.mirror_1x1')])],
    );
    // Exactly one module survives, and it is the builtin (no repo badge).
    expect(merged.modules).toHaveLength(1);
    expect((merged.modules[0] as { repo?: string }).repo).toBeUndefined();
    // The attempt is surfaced rather than dropped in silence.
    expect(merged.shadowed).toEqual([
      { slug: 'evil/parts', id: 'openuc2.cube.mirror_1x1' },
    ]);
  });

  it('first repo mounted wins between two community repos', () => {
    const merged = mergeRepoIndexes(
      [],
      [],
      [repo('a/parts', [mod('user.cube.x')]), repo('b/parts', [mod('user.cube.x')])],
    );
    expect(merged.modules).toHaveLength(1);
    expect((merged.modules[0] as { repo?: string }).repo).toBe('a/parts');
    expect(merged.shadowed).toEqual([{ slug: 'b/parts', id: 'user.cube.x' }]);
  });

  it('a repo that failed to load contributes nothing and breaks nothing', () => {
    const broken: MountedRepo = {
      url: 'https://github.com/me/dead', slug: 'me/dead', ref: 'main',
      index: null, error: '404', loading: false,
    };
    const merged = mergeRepoIndexes([mod('openuc2.cube.a')], [], [broken]);
    expect(merged.modules.map(m => m.id)).toEqual(['openuc2.cube.a']);
  });
});

/**
 * WP-102: writing an edited record into the shared library must be an EDIT,
 * not a replacement.
 *
 * This is not hypothetical. A "write into ../optikit-core/library" from the
 * parts editor replaced openuc2.mirror.flat_45's curated
 * `tags: [mirror, mirror/flat, mirror/single-sided]` with `[authored]`, and on
 * other records destroyed `docs`, `review`, `price: 50.0` and `glb-url` —
 * because `draftToRecord` authors a record from scratch and the backend does a
 * verbatim write.
 */

import { describe, expect, it } from 'vitest';
import {
  changedRecordKeys,
  mergeIntoRecord,
  mergeYamlRecord,
} from '../componentRecord';
import type { ComponentRecord } from '../dsn/generated/library-component';

const PUBLISHED = {
  kind: 'optical_component',
  id: 'openuc2.mirror.flat_45',
  version: '1.0.0',
  category: 'mirror',
  description: 'Flat first-surface mirror mounted at 45°',
  tags: ['mirror', 'mirror/flat', 'mirror/single-sided'],
  docs: ['docs/mirror.md'],
  review: ['confirm the coating'],
  mechanics: { template: 'openuc2.tpl.mirror_mount_1x1' },
  optics: {
    passthrough: false,
    frames: { optical: { 'z-mm': 0 } },
    ports: { front: { frame: 'optical', direction: '-z' } },
  },
  // A key a newer schema added that this frontend knows nothing about.
  future_field: { anything: 42 },
} as unknown as ComponentRecord;

/** What `draftToRecord` produces: authored from scratch, tags hardcoded. */
const AUTHORED = {
  kind: 'optical_component',
  id: 'openuc2.mirror.flat_45',
  version: '1.0.0',
  category: 'mirror',
  description: 'Flat first-surface mirror mounted at 45°',
  tags: ['authored'],
  vendor: { name: '', mpn: '', url: '' },
  optics: {
    frames: { optical: { 'z-mm': 0 } },
    ports: {
      front: { frame: 'optical', direction: '-z' },
      reflected: { frame: 'optical', direction: '+x', 'after-surface': 0 },
    },
  },
} as unknown as ComponentRecord;

describe('mergeIntoRecord (WP-102)', () => {
  it('never lets the form clobber curation it has no field for', () => {
    const out = mergeIntoRecord(PUBLISHED, AUTHORED) as unknown as Record<string, unknown>;
    expect(out.tags).toEqual(['mirror', 'mirror/flat', 'mirror/single-sided']);
    expect(out.docs).toEqual(['docs/mirror.md']);
    expect(out.review).toEqual(['confirm the coating']);
    expect(out.mechanics).toEqual({ template: 'openuc2.tpl.mirror_mount_1x1' });
    // Unknown keys survive too — the schema is extra="allow" by design.
    expect(out.future_field).toEqual({ anything: 42 });
  });

  it('the authored optics DO win — that is what the editor is for', () => {
    const out = mergeIntoRecord(PUBLISHED, AUTHORED);
    const optics = out.optics as { ports: Record<string, unknown>; passthrough?: boolean };
    expect(Object.keys(optics.ports)).toEqual(['front', 'reflected']);
    // …while an optics sub-key the form has no field for is kept.
    expect(optics.passthrough).toBe(false);
  });

  it('a brand-new record keeps its authored tags', () => {
    const out = mergeIntoRecord(null, AUTHORED) as unknown as Record<string, unknown>;
    expect(out.tags).toEqual(['authored']);
  });

  it('an edit still lands — this is a merge, not a freeze', () => {
    const edited = { ...AUTHORED, description: 'now with a real coating spec' } as ComponentRecord;
    const out = mergeIntoRecord(PUBLISHED, edited);
    expect(out.description).toBe('now with a real coating spec');
  });

  it('names the fields a write would change, so the confirm step can show them', () => {
    const merged = mergeIntoRecord(PUBLISHED, AUTHORED);
    const changed = changedRecordKeys(PUBLISHED, merged);
    expect(changed).toContain('optics'); // the reflected port was added
    expect(changed).toContain('vendor'); // the form always emits one
    // The whole point: curation is NOT in the change list.
    expect(changed).not.toContain('tags');
    expect(changed).not.toContain('docs');
    expect(changed).not.toContain('review');
    expect(changed).not.toContain('mechanics');
    expect(changed).not.toContain('future_field');
  });
});

describe('mergeYamlRecord (WP-102) — the template and module halves', () => {
  const BASE_TEMPLATE = `kind: mechanical_template
id: openuc2.tpl.mirror_1x1
version: 0.1.0
class: fixed
description: the curated cube
tags: [cube, insert/mirror]
docs: [docs/print.md]
glb-url: https://example.invalid/upstream.glb
envelope: {x-mm: 50, y-mm: 50, z-mm: 55}
`;

  const AUTHORED_TEMPLATE = `kind: mechanical_template
id: openuc2.tpl.mirror_1x1
version: 0.1.0
class: fixed
description: mount for openuc2.mirror.mirror_1x1 (bound from ASS_-_2004.glb)
tags: [bound]
envelope: {x-mm: 50, y-mm: 50, z-mm: 50}
glb: ASS_-_2004.glb
`;

  it('keeps glb-url, docs and the curated tags while taking the new mesh', () => {
    const out = mergeYamlRecord(BASE_TEMPLATE, AUTHORED_TEMPLATE);
    expect(out).toContain('glb-url: https://example.invalid/upstream.glb');
    expect(out).toContain('docs:');
    expect(out).toContain('insert/mirror');
    expect(out).not.toContain('- bound');
    // the authored half still wins where the form owns it
    expect(out).toContain('glb: ASS_-_2004.glb');
    expect(out).toContain('bound from ASS_-_2004.glb');
  });

  it('a record that does not exist yet is written as authored', () => {
    expect(mergeYamlRecord(null, AUTHORED_TEMPLATE)).toBe(AUTHORED_TEMPLATE);
  });

  it('unparseable YAML on disk does not block the write', () => {
    expect(mergeYamlRecord(': [not yaml', AUTHORED_TEMPLATE)).toBe(AUTHORED_TEMPLATE);
  });

  it('preserves a module price the bind flow never knew about', () => {
    const base = `kind: cube_module
id: openuc2.cube.mirror_45
version: 0.1.0
price: 50.0
docs: [docs/assembly.md]
component: openuc2.mirror.flat_45@^1
template: openuc2.tpl.mirror_mount_1x1@^0.1
`;
    const authored = `kind: cube_module
id: openuc2.cube.mirror_45
version: 0.1.0
component: openuc2.mirror.flat_45@^1
template: openuc2.tpl.mirror_1x1@^0.1
`;
    const out = mergeYamlRecord(base, authored);
    expect(out).toContain('price: 50');
    expect(out).toContain('docs:');
    expect(out).toContain('template: openuc2.tpl.mirror_1x1@^0.1');
  });
});

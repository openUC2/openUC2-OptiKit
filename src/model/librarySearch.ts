/**
 * WP-106 — one way to search the library, and one way to name a record.
 *
 * Two problems this file solves, both of them "the same thing implemented
 * differently in each panel":
 *
 * 1. SEARCH. The parts editor had none at all — only category chips — while
 *    the schematic palette matched `module.name` and nothing else, so typing
 *    "thorlabs" or "AC254" found nothing there either. One predicate, used by
 *    both, matching everything a person might reasonably type.
 *
 * 2. NAMES. `shortName` existed in five copies, and the surfaces that skipped
 *    it printed raw dotted ids as the headline. Records genuinely have no
 *    human name field — `RecordBase` is id/version/description/tags/docs/
 *    thumbnail/review — so a label has to be derived from the id slug.
 *
 * The id is never HIDDEN, only demoted: derived names genuinely collide in the
 * real library (`openuc2.cube.flat_45` and `openuc2.mirror.flat_45` both
 * derive to "flat 45", as do laser_488/laser_488nm and mirror_1x1/mirror_45),
 * so the monospace id stays on every row as the disambiguator.
 *
 * Zero imports on purpose: this is consumed by the palette, the parts editor,
 * the BOM and the community pages, and it must not drag three.js or zustand
 * into any of them.
 */

/** Lower-case, and treat `.`, `_` and `-` as spaces — so "flat 45" finds
 * `flat_45` and "ac254 050" finds `ac254-050-a`. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The fields a search looks at. Everything optional — callers pass what they have. */
export interface SearchableFields {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  vendorName?: string | null;
  mpn?: string | null;
  tags?: string[] | null;
}

/**
 * True when every whitespace-separated term appears somewhere in the record.
 * AND across terms (so "thorlabs lens" narrows), substring within a term.
 * An empty query matches everything.
 */
export function matchesQuery(query: string, fields: SearchableFields): boolean {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(
    [
      fields.id,
      fields.name,
      fields.description,
      fields.category,
      fields.vendorName,
      fields.mpn,
      ...(fields.tags ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
  return terms.every(term => haystack.includes(term));
}

/**
 * The last segment of a dotted id, with separators as spaces:
 * `openuc2.mirror.flat_45` → `flat 45`. This is the derivation five copies of
 * `shortName` were each doing slightly differently.
 */
export function slugOf(id: string): string {
  return (id.split('.').pop() ?? id).replace(/[_-]+/g, ' ');
}

/**
 * A record's human label. Title-cased from the id slug, unless the record
 * carries an explicit `title` (a schema addition this is ready for but does
 * not require).
 *
 * Deliberately NOT the description: curated descriptions are good prose
 * ("Band-pass emission filter (510-560 nm) in a 1x1 cube") but importer-
 * generated ones are junk ("AC254-050-A AC254-050-A POSITIVE VISIBLE
 * ACHROMATS: Infinite 50"), so the description is the SECOND line, never the
 * headline.
 */
export function displayNameOf(id: string, title?: string | null): string {
  if (title && title.trim()) return title.trim();
  return slugOf(id)
    .split(' ')
    .map(word =>
      // Keep tokens that are already meaningful as-is: 1x1, 45, 488nm, AC254.
      /\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

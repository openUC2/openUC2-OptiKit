/**
 * Locale-tolerant decimal parsing (WP-92). Number fields accept a comma as
 * the decimal separator — "0,15" and "0.15" are the same value — because a
 * German keyboard's numpad types the comma. Values always round-trip as
 * floats (dot-separated) in records and requests; the comma exists only at
 * the input boundary.
 */

/**
 * Parse user-typed text as a float, accepting "," as the decimal separator.
 * Returns null for anything that is not a complete number ("", "-", "1,2,3",
 * "abc"). Trailing-dot intermediates ("1.") parse as their prefix, matching
 * Number()'s behavior, so live-updating fields feel continuous while typing.
 */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  // A second separator means the text was never a plain decimal ("1,2,3").
  if (normalized.includes(',')) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

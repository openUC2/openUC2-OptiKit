/**
 * WP-130 — say WHICH FRAME an axis letter belongs to, everywhere it is shown.
 *
 * Every direction in this app is frame-relative, and until now nothing on
 * screen said which frame. The viewport triads printed three.js's own letters
 * (y up) while every panel string printed document / record / cube letters
 * (z up), so the cube's pin axis read "z" in Inventor, "z" in the template
 * and "Y" in the viewport — the single ambiguity behind four rounds of
 * "the orientation is wrong" reports. See DSN-CONTRACT.md §4b/§4c.
 *
 *   F1 document  z up, the 50/50/55 grid
 *   F2 record    +z = the optical axis, front vertex at the origin
 *   F3 cube      z = the cube's PIN axis, origin at the cube centre
 *   F4 viewer    y up — a rendering, never a stored value, and never named
 *                in text: that is exactly the confusion this file exists for.
 */

/** The frames a user-visible direction can be expressed in (never F4). */
export type AxisFrame = 'doc' | 'record' | 'cube' | 'part';

const FRAME_WORD: Record<AxisFrame, string> = {
  doc: 'document',
  record: 'record',
  cube: 'cube',
  part: 'part',
};

/**
 * Axis labels for a three.js gizmo that is drawing DOCUMENT (or cube) space.
 * three (x, y, z) = doc (x, z, −y): the viewer's y IS the document's z, and
 * the viewer's z points along document −y. Pair with axis colours reordered
 * to `['#e0533d', '#2c8fff', '#7cc142']` — drei binds `axisColors[1]` to the
 * y head, so relabelling alone would leave the green head reading "z".
 */
export const DOC_AXIS_LABELS: [string, string, string] = ['x', 'z', '−y'];

/**
 * A direction with its frame named: `axisText('-z', 'cube')` → `"−z (cube)"`.
 *
 * Accepts the schema's literals and the vector form WP-39 allows (a pose more
 * than `AXIS_SNAP_WARN_DEG` off-axis emits a 3-vector, not a letter).
 */
export function axisText(
  direction: string | readonly number[] | null | undefined,
  frame: AxisFrame,
): string {
  return `${axisLabel(direction)} (${FRAME_WORD[frame]})`;
}

/** The direction alone, typographically tidied — no frame suffix. */
export function axisLabel(direction: string | readonly number[] | null | undefined): string {
  if (direction == null) return '—';
  if (Array.isArray(direction) || ArrayBuffer.isView(direction)) {
    const v = Array.from(direction as readonly number[]);
    return `[${v.map(n => (Math.round(n * 1e3) / 1e3 || 0).toFixed(3)).join(', ')}]`;
  }
  const s = String(direction).trim();
  // U+2212 MINUS reads as a sign rather than a hyphen at label sizes.
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/**
 * The sentence a binder / inspector uses for one mounted port. The frame is
 * part of the sentence, not a footnote: "front faces +x (cube)".
 */
export function portFacesText(
  portName: string,
  direction: string | readonly number[] | null | undefined,
  frame: AxisFrame,
): string {
  return `${portName} faces ${axisText(direction, frame)}`;
}

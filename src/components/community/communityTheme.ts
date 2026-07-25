/**
 * Community-page design tokens, lifted from the OptiKit Platform design
 * (Claude Design, July 2026): teal accent on near-black ink, Space Grotesk
 * display over IBM Plex Sans body, IBM Plex Mono for kickers/part codes.
 * Scoped to the community surfaces (landing / explore / design page) — the
 * editors keep the WP-24 brand shell until a full reskin is decided.
 */

export const C = {
  teal: '#12B5B0',
  tealDark: '#0A7A77',
  tealBright: '#6EE7A8',
  ink: '#0A1418',
  inkRaised: '#0E1A1F',
  inkBorder: '#1E323A',
  paper: '#F2F6F7',
  paperEdge: '#E2E8EA',
  tealWash: '#E4F6F5',
  textOnInk: '#DCEFEE',
  mutedOnInk: '#8FB9BD',
  text: '#1E323A',
  muted: '#5A6B72',
  faint: '#7A8B91',
  yellow: '#FFD166',
  blue: '#5B8CFF',
} as const;

export const FONT = {
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

/** The mono all-caps kicker line the design uses above every section. */
export const kickerSx = {
  fontFamily: FONT.mono,
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: C.teal,
  fontWeight: 600,
};

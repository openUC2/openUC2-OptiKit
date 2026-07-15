/**
 * openUC2 design tokens — the single source of truth for brand values
 * (WP-24). Colors, fonts and logo usage follow the openUC2 brand guide
 * (openuc2_brandguide.pdf) strictly:
 *
 *   Blue      #023773  main brand colour
 *   Green     #85b918  secondary colour
 *   Turquoise #1f9c7c  third colour
 *   Light grey#FAF9F9  body colour
 *   Grey      #999999  body colour
 *
 * Typography: Stolzl (Bold = logo, Regular = heading/subheading/CTA,
 * Thin = tagline/body). The webfont files are commercial and not bundled;
 * drop the licensed .woff2 files into public/brand/fonts/ (see the README
 * there) and they are picked up automatically — until then the stack falls
 * back to close system faces.
 *
 * Everything visual should derive from these tokens; do not hardcode brand
 * hexes elsewhere.
 */

export const BRAND = {
  blue: '#023773',
  green: '#85b918',
  turquoise: '#1f9c7c',
  lightGrey: '#FAF9F9',
  grey: '#999999',
} as const;

/** Shades derived from the five normative colours (not in the guide). */
export const DERIVED = {
  blueDark: '#012849',
  blueLight: '#3d6fae', // readable "primary" tint for dark surfaces
  greenDark: '#6a950e',
  turquoiseDark: '#177a61',
  /** Dark editor surfaces: desaturated navy derived from the brand blue. */
  darkBg: '#0d1520',
  darkPaper: '#151f2d',
  darkTextPrimary: '#e8ebf0',
  darkTextSecondary: '#a6b0bd',
  lightTextPrimary: '#1c2b3a',
} as const;

export const FONT_STACK =
  "'Stolzl', 'Stolzl Book', system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const RADIUS = { sm: 6, md: 8 } as const;

/** Base spacing unit in px (MUI theme.spacing(1)). */
export const SPACING = 7;

/** Public URL of a brand asset, respecting the vite base path. */
export const brandAsset = (file: string): string =>
  `${import.meta.env.BASE_URL}brand/${file}`;

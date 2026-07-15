# Stolzl webfonts (not bundled)

The openUC2 brand typeface is **Stolzl** (see `openuc2_brandguide.pdf`).
It is a commercial font, so the files are not committed. To activate it,
drop the licensed files here as:

- `Stolzl-Thin.woff2` (weight 300 — tagline/headline/body)
- `Stolzl-Regular.woff2` (weight 400 — heading/subheading/CTA)
- `Stolzl-Bold.woff2` (weight 700 — logo/emphasis)

The `@font-face` slots in `src/styles/fonts.css` pick them up automatically;
until then the UI falls back to the system stack in `src/theme/tokens.ts`.

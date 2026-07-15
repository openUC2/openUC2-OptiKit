# Visual-regression reference set (WP-24)

One full-page screenshot per route, captured at 1440×900 with headless Chrome
against the dev server. Regenerate after any design-system change and review
the diff:

```sh
npm run dev            # or point the script at a deployed URL
npm run vr             # → node scripts/visual-regression.mjs [base-url]
```

Notes:

- Shots use a fresh browser profile, so first-run overlays (schematic
  affordance legend, grid-builder tutorial, startup dialogs) are part of the
  reference on purpose — they are themed surfaces too.
- The 3D scenes render via SwiftShader in headless mode; geometry may differ
  slightly from a GPU render but colors/chrome are what this set tracks.
- The design token source of truth is `src/theme/tokens.ts` (brand guide:
  `openuc2_brandguide.pdf` in the repo root).

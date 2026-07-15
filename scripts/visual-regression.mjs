/**
 * Visual-regression screenshot set (WP-24). Captures every route into
 * DOCS/visual-regression/ so design-system changes review as an image diff.
 *
 * Uses puppeteer (already a devDependency, same as the thumbnail script).
 * A plain `chrome --screenshot` shoots at the `load` event — before the
 * lazy-loaded editor chunks mount — so this waits for the app to settle.
 *
 * Usage:  node scripts/visual-regression.mjs [base-url]
 * Default base-url: http://localhost:5173
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'DOCS', 'visual-regression');
const SETTLE_MS = 9000; // lazy chunks + module catalog + R3F mount

const ROUTES = [
  ['schematic', '/configurator/schematic'],
  ['grid', '/configurator/grid'],
  ['assembly', '/configurator/assembly'],
  ['components', '/configurator/components'],
  ['bind', '/configurator/bind'],
  ['frame', '/configurator/frame'],
  ['setups', '/configurator/setups'],
  ['editor3d', '/configurator/3d'],
];

mkdirSync(OUT, { recursive: true });

// A fresh profile per run: first-run overlays (legend, tutorial) are part of
// the reference set on purpose — they are themed surfaces too.
const browser = await puppeteer.launch({
  headless: true,
  args: ['--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();

for (const [name, route] of ROUTES) {
  process.stdout.write(`→ ${name}  (${route})\n`);
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

await browser.close();
process.stdout.write(`done → ${OUT}\n`);

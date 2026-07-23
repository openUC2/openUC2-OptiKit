import { defineConfig } from '@playwright/test';

// EMB-B smoke: the built app must serve the vendored oc-wasm kernel under the
// /configurator/ base. Runs against `npm run preview`, so build first:
// `npm run build && npm run test:e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4173/configurator/',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/configurator/',
    reuseExistingServer: !process.env.CI,
  },
});

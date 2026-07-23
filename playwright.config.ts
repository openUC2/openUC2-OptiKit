import { defineConfig } from '@playwright/test';

// EMB-B smoke: the built app must serve the vendored oc-wasm kernel under the
// /configurator/ base. Runs against `npm run preview`, so build first:
// `npm run build && npm run test:e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:4173/configurator/',
  },
  webServer: [
    {
      command: 'npm run preview',
      url: 'http://localhost:4173/configurator/',
      reuseExistingServer: !process.env.CI,
    },
    // The first-success acceptance test runs against the dev server: the
    // optikit-core service's default CORS admits :5173 (spec 18.1).
    {
      command: 'npm run dev',
      url: 'http://localhost:5173/configurator/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

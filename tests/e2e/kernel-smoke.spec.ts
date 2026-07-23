import { expect, test } from '@playwright/test';

/**
 * EMB-B exit criterion: the production build serves the oc-wasm kernel under
 * the /configurator/ base — the wasm request succeeds (no 404) and the worker
 * initializes it (main.tsx boots the kernel when ?kernel=1 is present).
 */
test('vendored kernel wasm loads under /configurator/', async ({ page }) => {
  const wasmResponses: number[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.wasm')) wasmResponses.push(response.status());
  });

  await page.goto('./?kernel=1');
  await page.waitForFunction(
    () => (window as any).__ocKernelReady === true || (window as any).__ocKernelError,
    undefined,
    { timeout: 30_000 },
  );

  expect(await page.evaluate(() => (window as any).__ocKernelError)).toBeUndefined();
  expect(await page.evaluate(() => (window as any).__ocKernelReady)).toBe(true);
  expect(wasmResponses.length).toBeGreaterThan(0);
  for (const status of wasmResponses) expect(status).toBe(200);
});

import { expect, test } from '@playwright/test';

/**
 * EMB-D acceptance: the first-success scenario of integration spec 18.1,
 * against a live optikit-core service (`uv run optikit-core serve`, :8000).
 * Skips when the service is unreachable — run it locally or in a CI job that
 * launches the pinned service.
 *
 * Placements drive the real app stores (exposed on window.__stores for tests);
 * results are asserted from the simulation store the overlays render from.
 */

const DEV_URL = 'http://localhost:5173/configurator/';
const SERVICE_URL = process.env.OPTIKIT_CORE_URL ?? 'http://127.0.0.1:8000';

async function serviceUp(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICE_URL}/v1/library/index`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Cheap fingerprint of the segment buffer, computed in the page. */
const FINGERPRINT = `(() => {
  const s = (window).__stores.sim.getState().kernel;
  const buf = s.segments ?? new Float32Array(0);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return { requestId: s.requestId, segments: buf.length / 11, sum: Math.round(sum * 1e3) / 1e3 };
})()`;

test('first success: place, trace, drag, delete (spec 18.1)', async ({ page }) => {
  test.skip(!(await serviceUp()), 'optikit-core service not running on :8000');
  test.setTimeout(120_000);

  await page.goto(DEV_URL);

  // Modules CSV loaded and the three mapped slugs available.
  await page.waitForFunction(() => {
    const stores = (window as any).__stores;
    if (!stores) return false;
    const ids = new Set(stores.app.getState().modules.map((m: any) => m.id));
    return ['laser-488nm', 'lens-pos-1x1', 'camera-usb-daheng'].every(id => ids.has(id));
  });

  // Place laser -> lens -> camera on one row, beam east (+x, rotation 0).
  await page.evaluate(() => {
    const app = (window as any).__stores.app.getState();
    app.placeModule('laser-488nm', { x: 2, y: 3 }, 0);
    app.placeModule('lens-pos-1x1', { x: 4, y: 3 }, 0);
    app.placeModule('camera-usb-daheng', { x: 6, y: 3 }, 0);
  });

  // Rays appear without further action (kernel engine is on by default).
  await page.waitForFunction(() => {
    const k = (window as any).__stores.sim.getState().kernel;
    return k.requestId > 0 && k.segments && k.segments.length > 0;
  }, undefined, { timeout: 60_000 });

  const first = await page.evaluate(FINGERPRINT);
  expect(first.segments).toBeGreaterThan(0);
  expect(Number.isInteger(first.segments)).toBe(true); // buffer is 11-float aligned
  const kernelState = await page.evaluate(() => {
    const k = (window as any).__stores.sim.getState().kernel;
    return { serviceError: k.serviceError, findings: k.findings, engine: (window as any).__stores.sim.getState().engine };
  });
  expect(kernelState.engine).toBe('kernel');
  expect(kernelState.serviceError).toBeNull();

  // The rays must actually be DRAWN, not merely present in the store: count
  // the Konva line nodes on the 2D ray layer. Asserting only store state let a
  // "traced but invisible" regression through once already.
  const drawn = await page.evaluate(() => {
    const stage = (window as any).Konva?.stages?.[0];
    if (!stage) return null;
    return stage.getLayers().reduce((max: number, l: any) => Math.max(max, l.find('Line').length), 0);
  });
  expect(drawn).toBeGreaterThanOrEqual(first.segments);

  // Drag the lens one cell east: the trace re-runs and the picture changes.
  await page.evaluate(() => {
    const app = (window as any).__stores.app.getState();
    const lens = app.placedModules.find((m: any) => m.moduleId === 'lens-pos-1x1');
    app.moveModule(lens.id, { x: 5, y: 3 });
  });
  await page.waitForFunction(
    prev => (window as any).__stores.sim.getState().kernel.requestId > prev,
    first.requestId,
    { timeout: 60_000 },
  );
  const moved = await page.evaluate(FINGERPRINT);
  expect(moved.segments).toBeGreaterThan(0);
  expect(moved.sum).not.toBe(first.sum); // the focus visibly moved

  // Delete the camera: the laser keeps emitting through the lens into open
  // space, E_NO_TARGET renders as a finding, and the readouts are empty.
  await page.evaluate(() => {
    const app = (window as any).__stores.app.getState();
    const camera = app.placedModules.find((m: any) => m.moduleId === 'camera-usb-daheng');
    app.removeModule(camera.id);
  });
  await page.waitForFunction(
    prev => (window as any).__stores.sim.getState().kernel.requestId > prev,
    moved.requestId,
    { timeout: 60_000 },
  );
  const afterDelete = await page.evaluate(() => {
    const sim = (window as any).__stores.sim.getState();
    return {
      segments: (sim.kernel.segments ?? []).length / 11,
      findingCodes: sim.kernel.findings.map((f: any) => f.code),
      detectorReadings: sim.detectorReadings.length,
    };
  });
  expect(afterDelete.segments).toBeGreaterThan(0); // rays continue into open space
  expect(afterDelete.findingCodes).toContain('E_NO_TARGET');
  expect(afterDelete.detectorReadings).toBe(0);
});

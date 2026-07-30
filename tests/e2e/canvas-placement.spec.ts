import { expect, test } from '@playwright/test';

/**
 * Drop-placement regression: a module dropped ANYWHERE inside a grid cell
 * must land in that cell. The old path snapped the pointer to the nearest
 * grid corner before flooring, which shifted drops in a cell's lower-right
 * three-quarters into the neighbouring cell (and stacked modules on top of
 * each other, since placement has no collision check — burying earlier
 * modules beyond selection). Needs only the dev server, not optikit-core.
 */

const DEV_URL = 'http://localhost:5173/configurator/';

test('a drop anywhere in a cell places the module in that cell', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('optikit-visited', 'true');
    localStorage.setItem('optikit-tutorial-completed', 'true');
  });
  await page.goto(DEV_URL);
  await page.waitForFunction(() => {
    const stores = (window as any).__stores;
    return stores && stores.app.getState().modules.some((m: any) => m.id === 'laser-488nm');
  });

  const info = await page.evaluate(() => {
    const app = (window as any).__stores.app.getState();
    const stage = (window as any).Konva.stages[0];
    const box = stage.container().getBoundingClientRect();
    return {
      cellSize: app.grid.cellSize,
      zoom: app.viewport.zoom,
      pan: app.viewport.pan,
      box: { left: box.left, top: box.top },
    };
  });

  // Four spots inside cell (5,5): near each corner and dead center.
  for (const [ox, oy] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9], [0.9, 0.1]]) {
    await page.evaluate(() => {
      const app = (window as any).__stores.app.getState();
      app.placedModules.forEach((m: any) => app.removeModule(m.id));
    });
    const x = info.box.left + info.pan.x + (5 + ox) * info.cellSize * info.zoom;
    const y = info.box.top + info.pan.y + (5 + oy) * info.cellSize * info.zoom;
    await page.evaluate(([px, py]) => {
      const stage = (window as any).Konva.stages[0];
      const wrapper = stage.container().parentElement as HTMLElement;
      const dt = new DataTransfer();
      dt.setData('moduleId', 'laser-488nm');
      wrapper.dispatchEvent(new DragEvent('drop', { bubbles: true, clientX: px, clientY: py, dataTransfer: dt }));
    }, [x, y]);
    await expect
      .poll(() => page.evaluate(() => (window as any).__stores.app.getState().placedModules[0]?.position))
      .toEqual({ x: 5, y: 5 });
  }
});

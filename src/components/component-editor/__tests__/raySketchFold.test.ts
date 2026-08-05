/**
 * WP-126 — the ray sketch folds the same way as the glyph preview beside it.
 *
 * The glyph's canonical exit arm points UP on screen (foldDeg toward +y,
 * unsigned — foldDeg.test.ts). The sketch's SVG maps engine +y DOWN, so the
 * beam must leave the plate toward engine −y. WP-107 matched the sketch to
 * the schematic's engine default instead, which mirrored it against the
 * glyph it sits next to — round 19: "the ray sketch renders a different
 * axis than what the glyph shows".
 *
 * These tests run the REAL engine over the exact elements RaySketch builds,
 * so a sign change in either place breaks loudly.
 */

import { describe, expect, it } from 'vitest';
import { runSimulation } from '../../../simulation/SimulationEngine';
import type { OpticalElement } from '../../../types';

const CONFIG = {
  enabled: true,
  autoRun: true,
  maxRays: 3,
  maxBounces: 8,
  wavelength: 532,
  showRays: true,
  showDetectorReadings: false,
  showPhysicalIcons: false,
  rayBrightness: 1,
  rayColorMode: 'wavelength' as const,
  gridToSimScale: 50,
};

const beam = (): OpticalElement => ({
  id: 'beam',
  moduleInstanceId: 'beam',
  type: 'laser',
  position: { x: -60, y: 0 },
  rotation: 0,
  params: { wavelength: 532, rayCount: 1, beamDiameter: 1, power: 100 },
});

/** Direction of the ray segment AFTER the element at x≈0. */
function exitDirOf(element: OpticalElement): { x: number; y: number } {
  const rays = runSimulation([beam(), element], CONFIG).rays;
  const seg = rays
    .flatMap(r => r.segments)
    .find(s => s.start.x > -1 && Math.abs(s.end.x - s.start.x) < Math.abs(s.end.y - s.start.y) + 100 && (s.start.x !== -60 || s.end.x < 1));
  const folded = rays.flatMap(r => r.segments).filter(s => s.start.x > -5);
  const last = folded[folded.length - 1] ?? seg;
  if (!last) throw new Error('no segment after the element');
  const dx = last.end.x - last.start.x;
  const dy = last.end.y - last.start.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

describe('the sketch folds up-screen, like the glyph', () => {
  it("a 45° mirror (the sketch's angle = 90 − mount) sends the beam to engine −y", () => {
    const dir = exitDirOf({
      id: 'draft-element',
      moduleInstanceId: 'draft',
      position: { x: 0, y: 0 },
      rotation: 0,
      type: 'mirror',
      params: { aperture: 25, angle: 90 - 45, reflectivity: 1 },
    });
    expect(dir.y).toBeLessThan(-0.9); // −y = UP in the sketch's SVG
  });

  it('a normal-incidence mirror (mount 0 → angle 90) retro-reflects', () => {
    const dir = exitDirOf({
      id: 'draft-element',
      moduleInstanceId: 'draft',
      position: { x: 0, y: 0 },
      rotation: 0,
      type: 'mirror',
      params: { aperture: 25, angle: 90, reflectivity: 1 },
    });
    expect(dir.x).toBeLessThan(-0.9);
    expect(Math.abs(dir.y)).toBeLessThan(0.1);
  });

  it('the beamsplitter at its 45 default also folds up-screen', () => {
    const rays = runSimulation(
      [
        beam(),
        {
          id: 'draft-element',
          moduleInstanceId: 'draft',
          position: { x: 0, y: 0 },
          rotation: 0,
          type: 'beamsplitter',
          params: { aperture: 25, splitRatio: 0.5, angle: 45 },
        },
      ],
      CONFIG,
    ).rays;
    const vertical = rays
      .flatMap(r => r.segments)
      .filter(s => Math.abs(s.end.y - s.start.y) > Math.abs(s.end.x - s.start.x));
    expect(vertical.length).toBeGreaterThan(0);
    for (const s of vertical) expect(s.end.y).toBeLessThan(s.start.y);
  });
});

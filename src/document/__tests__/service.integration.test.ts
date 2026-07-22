/**
 * EMB-C integration tests against a running optikit-core service.
 *
 * Start the service with `uv run optikit-core serve` (spec §18.1) or point
 * OPTIKIT_SERVICE_URL somewhere else. When no service is reachable the suite
 * skips — CI launches the pinned public optikit-core service before running.
 */

import { describe, expect, it } from 'vitest';

import { CoreClient } from '../../api/coreClient';
import { optikitToThree } from '../frames';
import { GRID_MM } from '../../constants/grid';
import { moduleWorldPosition } from '../../three/coords';
import { buildDesign } from '../designBuilder';
import { optikitIdFor, RECORDS, threeModuleRow } from './helpers';

const BASE_URL = process.env.OPTIKIT_SERVICE_URL ?? 'http://127.0.0.1:8000';

async function serviceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/v1/library/index`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const available = await serviceAvailable();
const client = new CoreClient({ baseUrl: BASE_URL });

/** Rotate a vector by an [x, y, z, w] quaternion (kernel transform layout). */
function quatApply(q: number[], v: [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const u: [number, number, number] = [x, y, z];
  const cross = (a: number[], b: number[]): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const uxv = cross(u, v);
  const t = cross(u, [uxv[0] + w * v[0], uxv[1] + w * v[1], uxv[2] + w * v[2]]);
  return [v[0] + 2 * t[0], v[1] + 2 * t[1], v[2] + 2 * t[2]];
}

describe.skipIf(!available)('optikit-core service integration', () => {
  it('serves the library records the fixtures were vendored from (drift guard)', async () => {
    for (const [id, fixture] of RECORDS) {
      const served = await client.componentRecord(id);
      expect(served.category, id).toBe(fixture.category);
      expect(served.optics, id).toEqual(fixture.optics);
    }
  });

  it('caches records against the index hash', async () => {
    const index1 = await client.libraryIndex();
    const a = await client.componentRecord('openuc2.source.laser_488');
    const index2 = await client.libraryIndex();
    const b = await client.componentRecord('openuc2.source.laser_488');
    expect(index2.hash).toBe(index1.hash);
    expect(b).toBe(a); // same object: served from cache, not refetched
  });

  it('generated three-module row validates with zero errors', async () => {
    const { yaml } = buildDesign(threeModuleRow(), optikitIdFor, RECORDS);
    const result = await client.validate(yaml);
    const errors = result.findings.filter((f) => f.severity === 'error');
    expect(errors, JSON.stringify(errors)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('round-trips placement → design → /v1/flatten → three.js at 1e-9 mm', async () => {
    const placements = threeModuleRow();
    const { yaml } = buildDesign(placements, optikitIdFor, RECORDS);
    const { report } = await client.flatten(yaml);

    for (const placement of placements) {
      const entry = report.find((e) => e.id === `${placement.moduleId}-${placement.id}`);
      expect(entry, placement.moduleId).toBeDefined();
      const three = optikitToThree(entry!.position);
      // The component origin sits on the optical axis: x/z from the grid
      // cell, y at layer·55 + 30 (Rays3D convention).
      const [cx, cy, cz] = moduleWorldPosition(placement);
      const expected = [cx, placement.layer * GRID_MM.yLayer + 30, cz];
      expect(cy).toBe(placement.layer * GRID_MM.yLayer + GRID_MM.baseplate);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(three[i] - expected[i]), `axis ${i}`).toBeLessThan(1e-9);
      }
    }
  });

  // One fixture per 90° yaw step: the emitted Source3 must launch the beam
  // along the same grid direction the 2D tracer uses (east/south/west/north).
  const YAW_BEAMS: [number, [number, number, number]][] = [
    [0, [1, 0, 0]],
    [90, [0, 1, 0]],
    [180, [-1, 0, 0]],
    [270, [0, -1, 0]],
  ];
  it.each(YAW_BEAMS)('yaw %d° launches the beam along the matching axis', async (yaw, beamW) => {
    const [laser] = threeModuleRow();
    const { yaml } = buildDesign([{ ...laser, rotation: yaw }], optikitIdFor, RECORDS);
    const response = await fetch(`${BASE_URL}/v1/scene3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'optikit-design.yml': yaml } }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      scene: { sources: { transform: { rot_xyzw: number[] } }[] };
      findings: { code: string }[];
    };
    // Decision 6.14: the unconnected laser still emits; E_NO_TARGET is a
    // finding beside the scene, not a construction error.
    expect(data.scene.sources).toHaveLength(1);
    expect(data.findings.map((f) => f.code)).toContain('E_NO_TARGET');
    const dir = quatApply(data.scene.sources[0].transform.rot_xyzw, [1, 0, 0]);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(dir[i] - beamW[i]), `axis ${i}`).toBeLessThan(1e-9);
    }
  });
});

it('reports whether the integration suite ran', () => {
  if (!available) {
    console.warn(
      `optikit-core service not reachable at ${BASE_URL} — integration tests skipped. ` +
        'Start it with: uv run optikit-core serve',
    );
  }
  expect(true).toBe(true);
});

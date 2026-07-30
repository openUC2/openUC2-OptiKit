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
import { optikitIdFor, optikitRefFor, placed, RECORDS, threeModuleRow } from './helpers';

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

/** True when the service's dialect accepts the dichroic record (WP-74
 * `response` blocks + the importer's quoted `'.inf'` radii). Probed with the
 * record itself so the dichroic tests skip against a stale process — one
 * running pre-merge code or an older branch commit — instead of failing. */
async function serviceHasCurrentDialect(): Promise<boolean> {
  if (!available) return false;
  try {
    const { buildDesign } = await import('../designBuilder');
    const { optikitRefFor, placed, RECORDS } = await import('./helpers');
    const { yaml } = buildDesign(
      [placed('filter-dichroic', 'probe', 0, 0)],
      optikitRefFor,
      RECORDS,
    );
    const response = await fetch(`${BASE_URL}/v1/scene3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'optikit-design.yml': yaml } }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const merged = await serviceHasCurrentDialect();

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

  // The mirror-mount fix, proven through all three repos: the x:90 mount puts
  // the flat_45 fold in-plane, so a laser row folds south at the mirror and
  // lands on a camera one column down — traced by the real oc-wasm kernel.
  // Without the mount every yaw sent the fold to world −Z (into the table).
  it('laser → mirror → camera: the kernel traces the in-plane fold', async () => {
    const placements = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('mirror-1x1', 'b2', 2, 0),
      placed('camera-usb-daheng', 'c3', 2, 2, { rotation: 90 }),
    ];
    const { yaml, unmapped } = buildDesign(placements, optikitRefFor, RECORDS);
    expect(unmapped).toEqual([]);
    const response = await fetch(`${BASE_URL}/v1/scene3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'optikit-design.yml': yaml } }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      scene: unknown;
      findings: { code: string }[];
    };
    // The fold reaches the camera, so path inference finds a target.
    expect(data.findings.map((f) => f.code)).not.toContain('E_NO_TARGET');

    const { readFileSync } = await import('node:fs');
    const { default: init, Canvas } = await import('oc-wasm');
    const { KernelCore } = await import('../../kernel/kernelCore');
    const { SEGMENT_FLOATS } = await import('../../kernel/messages');
    const wasm = new URL('../../../node_modules/oc-wasm/oc_wasm_bg.wasm', import.meta.url);
    await init({ module_or_path: readFileSync(wasm) });
    const core = new KernelCore(new Canvas());
    const loaded = core.handle({ id: 1, type: 'loadScene', sceneJson: JSON.stringify(data.scene) });
    expect(loaded.type).toBe('sceneLoaded');
    const traced = core.handle({ id: 2, type: 'traceWorld' });
    expect(traced.type).toBe('segments');
    if (traced.type !== 'segments') return;

    // Mirror cube at grid (2,0) = world (100, 0); camera at (2,2) = (100, 100).
    // At least one segment must leave the mirror travelling +Y (grid south),
    // and the folded beam must reach the camera's cell.
    let foldedReachY = -Infinity;
    let folded = false;
    for (let i = 0; i + SEGMENT_FLOATS <= traced.buffer.length; i += SEGMENT_FLOATS) {
      const [ax, ay, , bx, by, bz] = traced.buffer.subarray(i, i + SEGMENT_FLOATS);
      const [dx, dy] = [bx - ax, by - ay];
      const south = dy > 0.99 * Math.hypot(dx, dy, bz - traced.buffer[i + 2]);
      if (south && Math.abs(ax - 100) < 5) {
        folded = true;
        foldedReachY = Math.max(foldedReachY, by);
      }
      // The pinned defect sent the fold to world −Z (down): no segment may
      // dive below the table.
      expect(bz).toBeGreaterThan(-27.5);
    }
    expect(folded, 'a segment leaves the mirror travelling grid south').toBe(true);
    // The camera record recesses its sensor 10 mm behind the part center, so
    // the folded beam terminates on the detector plane at y = 100 − 10 = 90.
    expect(foldedReachY, 'the folded beam ends on the camera sensor plane').toBeCloseTo(90, 6);
  });
});

// The dichroic/beamsplitter records author WP-74 response blocks and quoted
// '.inf' radii, which only the post-merge service dialect accepts.
describe.skipIf(!merged)('optikit-core service integration (merged service)', () => {
  it('laser → dichroic → camera: both arms trace, the fold lands on the sensor', async () => {
    const placements = [
      placed('laser-488nm', 'a1', 0, 0),
      placed('filter-dichroic', 'b2', 2, 0),
      placed('camera-usb-daheng', 'c3', 2, 2, { rotation: 90 }),
    ];
    const { yaml, unmapped } = buildDesign(placements, optikitRefFor, RECORDS);
    expect(unmapped).toEqual([]);
    const response = await fetch(`${BASE_URL}/v1/scene3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'optikit-design.yml': yaml } }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      scene: unknown;
      findings: { code: string }[];
      warnings: string[];
    };
    expect(data.findings.map((f) => f.code)).not.toContain('E_NO_TARGET');
    // The kernel is wavelength-blind: the dichroic is an explicit 50/50 split.
    expect(data.warnings.join('\n')).toContain('W_DICHROIC_SPLIT');

    const { readFileSync } = await import('node:fs');
    const { default: init, Canvas } = await import('oc-wasm');
    const { KernelCore } = await import('../../kernel/kernelCore');
    const { SEGMENT_FLOATS } = await import('../../kernel/messages');
    const wasm = new URL('../../../node_modules/oc-wasm/oc_wasm_bg.wasm', import.meta.url);
    await init({ module_or_path: readFileSync(wasm) });
    const core = new KernelCore(new Canvas());
    expect(core.handle({ id: 1, type: 'loadScene', sceneJson: JSON.stringify(data.scene) }).type)
      .toBe('sceneLoaded');
    const traced = core.handle({ id: 2, type: 'traceWorld' });
    expect(traced.type).toBe('segments');
    if (traced.type !== 'segments') return;

    // Dichroic at grid (2,0) = world (100, 0); camera at (2,2), sensor y = 90.
    let foldedReachY = -Infinity;
    let transmittedReachX = -Infinity;
    for (let i = 0; i + SEGMENT_FLOATS <= traced.buffer.length; i += SEGMENT_FLOATS) {
      const [ax, ay, az, bx, by, bz] = traced.buffer.subarray(i, i + SEGMENT_FLOATS);
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      if (by - ay > 0.99 * len && Math.abs(ax - 100) < 5) {
        foldedReachY = Math.max(foldedReachY, by);
      }
      if (bx - ax > 0.99 * len && ax > 99) {
        transmittedReachX = Math.max(transmittedReachX, bx);
      }
      expect(bz).toBeGreaterThan(-27.5);
    }
    expect(foldedReachY, 'the reflected arm ends on the camera sensor plane').toBeCloseTo(90, 6);
    expect(transmittedReachX, 'the transmitted arm continues east').toBeGreaterThan(110);
  });
});

it('reports whether the integration suite ran', () => {
  if (!available) {
    console.warn(
      `optikit-core service not reachable at ${BASE_URL} — integration tests skipped. ` +
        'Start it with: uv run optikit-core serve',
    );
  } else if (!merged) {
    console.warn(
      `service at ${BASE_URL} rejects the dichroic record — its process predates the ` +
        'current kit-canvas-scene3-export dialect. Restart: uv run optikit-core serve',
    );
  }
  expect(true).toBe(true);
});

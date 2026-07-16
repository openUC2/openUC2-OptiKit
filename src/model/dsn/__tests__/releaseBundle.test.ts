/**
 * WP-18: the release bundle — BOM classification, assembly notes, lockfile
 * pins, and the ±Infinity JSON contract. The end-to-end reproducibility
 * check lives in optikit-core (`rebuild`); here we pin what the export writes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { DocPart, DocSnapshot } from '../../../document';
import { useSourceDesignStore } from '../../../document/sourceDesignStore';
import { buildServiceDesign } from '../serviceExport';
import {
  buildAssemblyNotes,
  buildBom,
  bomCsv,
  buildReleaseBundle,
  sha256Hex,
  stringifyFinite,
} from '../releaseBundle';

const FLUO_YAML = readFileSync(join(__dirname, 'fixtures', 'fluo-scope.dsn.yml'), 'utf8');

function makePart(key: string, over: Partial<DocPart> = {}): DocPart {
  return {
    id: `p-${key}`,
    ref: key,
    category: 'other',
    libraryRef: `glb-${key}`,
    worldPose: { positionMm: [0, 0, 0], rotation: [0, 0, 0, 1] },
    gridPose: { cell: [0, 0, 0], offsetMm: [0, 0, 0], rot24: { z: '+z', x: '+x' }, offsetDeg: { x: 0, y: 0, z: 0 }, residualYawDeg: 0 },
    dofs: [],
    params: {},
    ...over,
  } as DocPart;
}

function fluoSnapshot(): DocSnapshot {
  return {
    parts: [
      makePart('laser'),
      makePart('excitation-filter'),
      makePart('dichroic'),
      makePart('objective', {
        dofs: [{ name: 'dz', range: null, unit: 'mm', value: 1.85 }],
      }),
      makePart('tube-lens'),
      makePart('camera'),
    ],
    paths: [
      {
        name: 'emission',
        chain: [
          'p-objective.front>back',
          'p-dichroic.reflected>transmitted',
          'p-tube-lens.front>back',
          'p-camera.sensor',
        ],
      },
    ],
    meta: { name: 'fluo-scope', description: '' },
  };
}

beforeEach(() => {
  useSourceDesignStore.getState().setSource(
    FLUO_YAML,
    Object.fromEntries(
      ['laser', 'excitation-filter', 'dichroic', 'objective', 'tube-lens', 'camera'].map(
        k => [`p-${k}`, k],
      ),
    ),
  );
});

describe('stringifyFinite', () => {
  it('writes ±Infinity as ±1e999 literals (the service wire contract)', () => {
    const text = stringifyFinite({ r: Infinity, n: -Infinity, x: 1.5 }, 0);
    expect(text).toContain('1e999');
    expect(text).toContain('-1e999');
    expect(text).not.toContain('null');
    // Round trip on the JS side overflows back.
    expect(JSON.parse(text).r).toBe(Infinity);
  });
});

describe('BOM', () => {
  it('classifies by model prefix and carries the Thorlabs vendor/MPN', () => {
    const { design } = buildServiceDesign(fluoSnapshot());
    const rows = buildBom(design);
    const buy = rows.filter(r => r.type === 'BUY');
    const sub = rows.filter(r => r.type === 'SUB');
    expect(buy.length).toBeGreaterThanOrEqual(3); // laser, filter, dichroic, camera
    // WP-18 acceptance: the Thorlabs lens appears with its MPN.
    const thorlabsLens = sub.find(r => r.mpn === 'AC254-050-A');
    expect(thorlabsLens).toBeDefined();
    expect(thorlabsLens!.vendor).toBe('Thorlabs');
    expect(thorlabsLens!.qty).toBe(2); // objective + tube-lens share the model
    expect(thorlabsLens!.components.sort()).toEqual(['objective', 'tube-lens']);
    // Locations never appear in a BOM.
    expect(rows.some(r => r.components.includes('sample'))).toBe(false);
  });

  it('escapes CSV fields with commas', () => {
    const csv = bomCsv([
      { type: 'BUY', model: 'BUY - Laser, 488nm', qty: 1, vendor: '', mpn: '', components: ['a'] },
    ]);
    expect(csv).toContain('"BUY - Laser, 488nm"');
  });
});

describe('assembly notes', () => {
  it('lists the T2 insert target and the purchased optics', () => {
    const { design } = buildServiceDesign(fluoSnapshot());
    const notes = buildAssemblyNotes(design, fluoSnapshot());
    expect(notes).toContain('**objective** insert (dz, range [-7.5, 7.5] mm)');
    expect(notes).toContain('**+1.85 mm**');
    expect(notes).toContain('## Purchased optics');
  });
});

describe('buildReleaseBundle', () => {
  it('bundles design + optics + BOM + notes and pins them in the lock', async () => {
    const compile = async () => ({
      paths: {
        emission: {
          optic: { version: 1.0, surface_group: { surfaces: [{ geometry: { radius: Infinity } }] } },
          manifest: [{ surface_index: 0 }],
          warnings: [],
        },
      },
    });
    const bundle = await buildReleaseBundle(fluoSnapshot(), { compile, glb: false });
    const names = Object.keys(bundle.files).sort();
    expect(names).toEqual([
      'BOM.csv',
      'assembly-notes.md',
      'optic.emission.json',
      'optic.emission.manifest.json',
      'optikit-design.yml',
      'optikit-lock.yml',
    ]);
    expect(bundle.files['optic.emission.json']).toContain('1e999');

    const lock = parse(bundle.files['optikit-lock.yml'] as string) as {
      schema: string;
      paths: string[];
      sha256: Record<string, string>;
    };
    expect(lock.schema).toBe('optikit-lock/v0');
    expect(lock.paths).toEqual(['emission']);
    // Every non-lock file is pinned, and the pins verify.
    for (const name of names.filter(n => n !== 'optikit-lock.yml')) {
      expect(lock.sha256[name]).toBe(await sha256Hex(bundle.files[name] as string));
    }
  });
});

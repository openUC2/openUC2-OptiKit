/**
 * Bench step 1: emit optikit-design.yml per bench scene via the production
 * designBuilder (EMB-C), exactly as kernelSim would. Step 2
 * (src/bench/gen_scenes.py, run in the optikit-core venv) materializes these
 * into Scene3 JSON for the kernel lanes.
 *
 * Run: npx vitest run src/bench/emit-designs.test.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildDesign } from '../document/designBuilder';
import { RECORDS, optikitRefFor } from '../document/__tests__/helpers';
import { allScenes } from './scenes';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'designs');

describe('bench design emitter', () => {
  it('every bench scene maps fully and its design is written', () => {
    mkdirSync(OUT, { recursive: true });
    for (const scene of allScenes()) {
      const built = buildDesign(scene.placements, optikitRefFor, RECORDS);
      expect(built.unmapped, `${scene.name} has unmapped placements`).toEqual([]);
      expect(built.mapped.length).toBe(scene.placements.length);
      writeFileSync(join(OUT, `${scene.name}.yml`), built.yaml, 'utf8');
    }
  });
});

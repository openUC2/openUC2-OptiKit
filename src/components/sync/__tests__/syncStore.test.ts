/**
 * WP-17: sync-discipline bookkeeping — the two-sided fingerprints and the
 * chip-state derivation, plus the back-annotate-to-source action.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { DocPart, DocSnapshot } from '../../../document';
import { useSourceDesignStore } from '../../../document/sourceDesignStore';
import { backAnnotateSource } from '../../../model/dsn/serviceExport';
import {
  assemblyFingerprint,
  schematicFingerprint,
  syncStatusOf,
} from '../syncStore';

const FLUO_YAML = readFileSync(
  join(__dirname, '..', '..', '..', 'model', 'dsn', '__tests__', 'fixtures', 'fluo-scope.dsn.yml'),
  'utf8',
);

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

function snap(parts: DocPart[], paths: DocSnapshot['paths'] = []): DocSnapshot {
  return { parts, paths, meta: { name: 't', description: '' } };
}

describe('fingerprints', () => {
  it('a 5 mm move changes ONLY the schematic fingerprint', () => {
    const before = snap([makePart('lens')]);
    const after = snap([
      makePart('lens', { worldPose: { positionMm: [5, 0, 0], rotation: [0, 0, 0, 1] } }),
    ]);
    expect(schematicFingerprint(after)).not.toBe(schematicFingerprint(before));
    expect(assemblyFingerprint(after)).toBe(assemblyFingerprint(before));
  });

  it('a DOF change changes ONLY the assembly fingerprint', () => {
    const before = snap([makePart('objective')]);
    const after = snap([
      makePart('objective', { dofs: [{ name: 'dz', range: null, unit: 'mm', value: 3.0 }] }),
    ]);
    expect(assemblyFingerprint(after)).not.toBe(assemblyFingerprint(before));
    expect(schematicFingerprint(after)).toBe(schematicFingerprint(before));
  });

  it('re-chaining a path changes the schematic fingerprint', () => {
    const parts = [makePart('a'), makePart('b')];
    const before = snap(parts, [{ name: 'p', chain: ['p-a.out', 'p-b.sensor'] }]);
    const after = snap(parts, [{ name: 'p', chain: ['p-b.out', 'p-a.sensor'] }]);
    expect(schematicFingerprint(after)).not.toBe(schematicFingerprint(before));
  });
});

describe('syncStatusOf', () => {
  const base = snap([makePart('lens')]);
  const stamps = {
    schematicHash: schematicFingerprint(base),
    assemblyHash: assemblyFingerprint(base),
    at: '2026-07-15T00:00:00',
    action: 'cubify' as const,
  };

  it('walks the whole state machine', () => {
    expect(syncStatusOf(null, base)).toBe('unbuilt');
    expect(syncStatusOf(stamps, base)).toBe('in-sync');

    const moved = snap([
      makePart('lens', { worldPose: { positionMm: [5, 0, 0], rotation: [0, 0, 0, 1] } }),
    ]);
    expect(syncStatusOf(stamps, moved)).toBe('schematic-ahead');

    const dofChanged = snap([
      makePart('lens', { dofs: [{ name: 'dz', range: null, unit: 'mm', value: 1 }] }),
    ]);
    expect(syncStatusOf(stamps, dofChanged)).toBe('assembly-ahead');

    const both = snap([
      makePart('lens', {
        worldPose: { positionMm: [5, 0, 0], rotation: [0, 0, 0, 1] },
        dofs: [{ name: 'dz', range: null, unit: 'mm', value: 1 }],
      }),
    ]);
    expect(syncStatusOf(stamps, both)).toBe('diverged');
  });
});

describe('backAnnotateSource', () => {
  it('writes live DOF values + provenance into the retained YAML', () => {
    useSourceDesignStore.getState().setSource(FLUO_YAML, { 'p-objective': 'objective' });
    const written = backAnnotateSource(
      snap([
        makePart('objective', { dofs: [{ name: 'dz', range: null, unit: 'mm', value: 4.25 }] }),
      ]),
    );
    expect(written).toBe(1);
    const updated = parse(useSourceDesignStore.getState().yamlText!) as {
      instantiation: { dof_values: Record<string, number> };
      provenance: { optimized_by: string; run: string };
      components: Record<string, unknown>;
    };
    expect(updated.instantiation.dof_values['objective.dz']).toBe(4.25);
    expect(updated.provenance.optimized_by).toBe('assembly-editor');
    // The rest of the source survives (optics blocks, location components).
    expect(updated.components.sample).toBeDefined();
  });

  it('returns null without a retained source', () => {
    useSourceDesignStore.getState().clear();
    expect(backAnnotateSource(snap([makePart('x')]))).toBeNull();
  });
});

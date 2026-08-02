/**
 * WP-111 — the one-part design the numbers road hands the service.
 *
 * `/v1/generate`'s T2 branch requires `files` + `component` — a PLACED
 * design — and the wizard has no design. This synthesizes one in the SAME
 * shape `serviceFiles()` emits (one component, the inline fragment, the pose,
 * `instantiation.dof_values`) and names its single key. Deliberately in the
 * FRONTEND, not by loosening the endpoint: the design IS the contract the
 * bridge wants, and a params-only side door would be a second way to
 * describe the same thing (the two would drift).
 *
 * The probe variant adds a synthetic source and detector one cell before
 * and after the optic so `/v1/optimize` can trace a real path — that is the
 * "find the best position" button, with the vertex offset as the free
 * variable and RMS spot at the exit face as the merit.
 */

import type { ComponentRecord } from '../../../model/dsn/generated/library-component';
import { DESIGN_DECL_FILE, serializeDesign, type DsnFiles } from '../../../model/dsn/io';
import type { DesignDecl } from '../../../model/dsn/generated/design-decl';

export interface OnePartOptions {
  /** Front-vertex offset from the CUBE ORIGIN along the optical axis, mm. */
  vertexOffsetMm: number;
  holdClass: 'fixed' | 'adaptive' | 'generative';
  /** T2: declared travel along the beam. */
  dzRangeMm: [number, number];
}

type Json = Record<string, unknown>;

const KEY_FALLBACK = 'optic';

/** The design key of the record's single component. */
export function onePartKey(record: ComponentRecord): string {
  const last = record.id.split('.').pop() ?? KEY_FALLBACK;
  return last.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || KEY_FALLBACK;
}

/** Identity grid rotation: the record's local frame IS the document frame,
 * so the optical axis (local +z) runs along document +z and the record's
 * vertex offset maps 1:1 onto the generator's part frame. */
const IDENTITY_ROTATION = { type: 'grid', grid: { z: '+z', x: '+x' } };

function opticSpec(record: ComponentRecord, opts: OnePartOptions): Json {
  const rec = record as unknown as Json;
  const adaptive = opts.holdClass === 'adaptive';
  return {
    type: 'primitive',
    primitive: { type: 'glb', model: record.id },
    category: record.category,
    // The record's optics block verbatim — fragment, frames, ports. This is
    // the prescription the insert is parameterized from (E_NO_OPTICS if the
    // fragment is missing, which the wizard's step 1 guarantees against).
    optics: rec.optics,
    pose: {
      rotation: IDENTITY_ROTATION,
      translation: {
        'offset-grid': { x: 0, y: 0, z: 0 },
        // T3 folds the intra-cube δ from the pose (pose_params_from_component)
        // — the cavity is carved where the optic ACTUALLY sits. T2 carries
        // the same number as the dz dof value instead; giving it both would
        // double-count for any consumer that sums them.
        ...(!adaptive && opts.vertexOffsetMm !== 0
          ? { 'offset-mm': { z: opts.vertexOffsetMm } }
          : {}),
      },
    },
    ...(adaptive
      ? {
          dof: [
            {
              name: 'dz',
              kind: 'translation',
              axis: 'z',
              range: [...opts.dzRangeMm],
              unit: 'mm',
              actuatable: true,
            },
          ],
        }
      : {}),
  };
}

/** The `{files}` body + component key for `/v1/generate` (T2 and T3). */
export function onePartDesignFiles(
  record: ComponentRecord,
  opts: OnePartOptions,
): { files: DsnFiles; component: string } {
  const key = onePartKey(record);
  const design: Json = {
    design: {
      name: `${key}-wizard`,
      description: `one-part design for the ${record.id} insert build (WP-111 wizard)`,
    },
    components: { [key]: opticSpec(record, opts) },
    ...(opts.holdClass === 'adaptive'
      ? { instantiation: { dof_values: { [`${key}.dz`]: opts.vertexOffsetMm } } }
      : {}),
  };
  return {
    files: { [DESIGN_DECL_FILE]: serializeDesign(design as unknown as DesignDecl) },
    component: key,
  };
}

/** One cell before/after the optic (z pitch 55 mm), so the optimizer has a
 * real path to trace: source.out → optic.front>back → probe-sensor.sensor. */
export function probeDesignFiles(
  record: ComponentRecord,
  opts: OnePartOptions,
  wavelengthUm = 0.532,
): { files: DsnFiles; path: string; dofKey: string } {
  const key = onePartKey(record);
  const optic = opticSpec(record, {
    ...opts,
    // The probe always varies dz — that IS the free variable — so the optic
    // carries the dof regardless of how it will eventually be held.
    holdClass: 'adaptive',
    dzRangeMm: [-27.5, 27.5],
  });
  const design: Json = {
    design: {
      name: `${key}-probe`,
      description: `probe design for the "find the best position" step (WP-111)`,
    },
    components: {
      'probe-source': {
        type: 'primitive',
        category: 'source',
        source: { wavelengths_um: [wavelengthUm], divergence_deg: 0 },
        optics: {
          frames: { optical: { 'z-mm': 0 } },
          ports: { out: { frame: 'optical', direction: '+z' } },
        },
        pose: {
          rotation: IDENTITY_ROTATION,
          translation: { 'offset-grid': { x: 0, y: 0, z: -1 } },
        },
      },
      [key]: optic,
      'probe-sensor': {
        type: 'primitive',
        category: 'detector',
        optics: {
          frames: { optical: { 'z-mm': 0 } },
          ports: { sensor: { frame: 'optical', direction: '-z' } },
        },
        pose: {
          rotation: IDENTITY_ROTATION,
          translation: { 'offset-grid': { x: 0, y: 0, z: 1 } },
        },
      },
    },
    instantiation: { dof_values: { [`${key}.dz`]: opts.vertexOffsetMm } },
    paths: {
      probe: {
        simulation: {
          wavelengths: { wavelengths: [{ value: wavelengthUm, is_primary: true }] },
        },
        chain: ['probe-source.out', `${key}.front>back`, 'probe-sensor.sensor'],
      },
    },
  };
  return {
    files: { [DESIGN_DECL_FILE]: serializeDesign(design as unknown as DesignDecl) },
    path: 'probe',
    dofKey: `${key}.dz`,
  };
}

/**
 * The `optikit-fx.json` changeset for the no-bridge fallback — the SAME
 * document `optikit-core annotate fx` emits (schema optikit-fx/v0): the dz
 * the insert should be set to, applied on the Inventor machine with
 * apply_fx_params.py. The wizard knows every value, so no service round
 * trip is needed to produce it.
 */
export function fxChangesetJson(
  record: ComponentRecord,
  templateId: string | null,
  opts: OnePartOptions,
): string {
  return JSON.stringify(
    {
      schema: 'optikit-fx/v0',
      changes: [
        {
          component: onePartKey(record),
          'template-id': templateId,
          parameter: 'dz',
          'value-mm': opts.vertexOffsetMm,
        },
      ],
    },
    null,
    2,
  );
}

/** WP-111.5: the trio the numbers road publishes after an accepted T2 build
 * — the component (prescription), the EXISTING master-insert template id
 * (referenced, not rewritten), and the module binding the two. */
export function t2ModuleRecord(
  record: ComponentRecord,
  templateId: string,
  templateVersion: string,
): Json {
  const slug = onePartKey(record).replace(/-/g, '_');
  const minor = (v: string) => `^${v.split('.').slice(0, 2).join('.')}`;
  return {
    kind: 'cube_module',
    id: `user.cube.${slug}_t2`,
    version: '0.1.0',
    description: `${record.id} in the ${templateId} master insert (wizard T2 build)`,
    tags: ['generated', 'wizard'],
    component: `${record.id}@${minor(record.version)}`,
    template: `${templateId}@${minor(templateVersion || '0.1.0')}`,
    footprint_grid: [1, 1, 1],
  };
}

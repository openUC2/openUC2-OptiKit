/**
 * WP-61 "put it in a cube": the record trio-minus-one materialized when a
 * generated T3 holder is accepted. The optical component already exists in
 * the registry (that is what made the part UNBOUND), so accepting emits only
 *
 *   templates/<id>/template.yml   class: generative, generator + the EXACT
 *                                 params of the accepted run (same sha256 key
 *                                 → regenerating is a cache hit)
 *   modules/<id>/module.yml       binds component@range + template@range
 *
 * plus the generated union STEP/GLB as the template's mesh assets. Pure
 * functions, exercised by unit tests; the records must validate in
 * optikit-core (`library validate`) — the shapes mirror the committed
 * `openuc2.tpl.holder_ac254_050_a` record and bindRecord's proven builders.
 */

import { stringify } from 'yaml';

/** WP-62 guard rail, verbatim from the work package: a prescription-derived
 * cavity must be human-verified before printing. */
export const PRESCRIPTION_REVIEW_NOTE =
  'cavity derived from the optical prescription — verify against the physical optic before printing';

export interface HolderMaterializeInput {
  /** The unbound optical component the holder wraps. */
  componentId: string;
  /** Its published version ("0.1.0"), or null → ref range ^0.1. */
  componentVersion: string | null;
  /** Record ports (name + direction) → the template's optical_ports. */
  ports: { name: string; direction: string }[];
  /** Generator script path, e.g. "generators/boolean_holder_1x1.py". */
  generator: string;
  /** The CANONICAL params of the accepted run (from the run's meta) — NOT the
   * request params, so the written template regenerates as a cache hit. */
  params: Record<string, unknown>;
  /** True when the cut body came from the prescription, not a vendor STEP. */
  derivedFromPrescription: boolean;
  /** Which union assets the run actually produced — the record must never
   * declare a file it does not ship (the WP-58 hygiene rule). */
  assets: { step: boolean; glb: boolean };
}

export interface HolderRecords {
  templateId: string;
  moduleId: string;
  template: Record<string, unknown>;
  module: Record<string, unknown>;
}

function slug(componentId: string): string {
  const last = componentId.split('.').pop() ?? componentId;
  return last.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

export function holderRecords(input: HolderMaterializeInput): HolderRecords {
  const s = slug(input.componentId);
  const templateId = `user.tpl.holder_${s}`;
  const moduleId = `user.cube.${s}_t3`;

  const template: Record<string, unknown> = {
    kind: 'mechanical_template',
    id: templateId,
    version: '0.1.0',
    class: 'generative',
    description: `Printable boolean holder for ${input.componentId} (two halves, generated at the placed pose)`,
    tags: ['holder', 'generated'],
    envelope: { 'x-mm': 50, 'y-mm': 50, 'z-mm': 50 },
    generator: { script: input.generator, params: input.params },
    // Union STEP = mechanical source of truth; union GLB = render copy —
    // shipped as template assets so the assembly renders the generated mesh.
    ...(input.assets.step ? { step: 'model.step' } : {}),
    ...(input.assets.glb ? { glb: 'model.glb' } : {}),
    optical_ports: Object.fromEntries(
      input.ports.map(p => [p.name, { frame: 'optical', direction: p.direction }]),
    ),
    footprint_grid: [1, 1, 1],
  };
  if (input.derivedFromPrescription) {
    template.review = [PRESCRIPTION_REVIEW_NOTE];
  }

  const componentRef = input.componentVersion
    ? `${input.componentId}@^${input.componentVersion.split('.').slice(0, 2).join('.')}`
    : `${input.componentId}@^0.1`;
  const module: Record<string, unknown> = {
    kind: 'cube_module',
    id: moduleId,
    version: '0.1.0',
    description: `${input.componentId} in a generated T3 holder`,
    tags: ['generated'],
    component: componentRef,
    template: `${templateId}@^0.1`,
    footprint_grid: [1, 1, 1],
  };

  return { templateId, moduleId, template, module };
}

/**
 * File map for both exits (download zip / dev write), library-PR layout —
 * the same convention as bindRecord's recordsToFiles.
 */
export function holderFiles(
  records: HolderRecords,
  assets: { step?: Uint8Array | null; glb?: Uint8Array | null } = {},
): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {
    [`templates/${records.templateId}/template.yml`]: stringify(records.template, {
      indent: 2,
      lineWidth: 100,
      aliasDuplicateObjects: false,
    }),
    [`modules/${records.moduleId}/module.yml`]: stringify(records.module, {
      indent: 2,
      lineWidth: 100,
      aliasDuplicateObjects: false,
    }),
  };
  if (assets.step) files[`templates/${records.templateId}/model.step`] = assets.step;
  if (assets.glb) files[`templates/${records.templateId}/model.glb`] = assets.glb;
  return files;
}

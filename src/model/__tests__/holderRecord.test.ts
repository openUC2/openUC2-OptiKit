/**
 * WP-61: the records materialized when a generated holder is accepted.
 * Shapes mirror the committed openuc2.tpl.holder_ac254_050_a record and must
 * keep validating in optikit-core (`library validate`).
 */

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  PRESCRIPTION_REVIEW_NOTE,
  holderFiles,
  holderRecords,
} from '../holderRecord';

const INPUT = {
  componentId: 'thorlabs.lens.ac254-050-a',
  componentVersion: '0.1.0',
  ports: [
    { name: 'front', direction: '-z' },
    { name: 'back', direction: '+z' },
  ],
  generator: 'generators/boolean_holder_1x1.py',
  params: {
    part_prescription: { component: 'thorlabs.lens.ac254-050-a' },
    clearance_mm: 0.15,
    split_plane: 'xz',
  },
  derivedFromPrescription: true,
  assets: { step: true, glb: true },
};

describe('holderRecords', () => {
  it('materializes a generative template carrying the run params verbatim', () => {
    const { template, templateId } = holderRecords(INPUT);
    expect(templateId).toBe('user.tpl.holder_ac254_050_a');
    expect(template.kind).toBe('mechanical_template');
    expect(template.class).toBe('generative');
    expect(template.generator).toEqual({
      script: 'generators/boolean_holder_1x1.py',
      params: INPUT.params,
    });
    expect(template.optical_ports).toEqual({
      front: { frame: 'optical', direction: '-z' },
      back: { frame: 'optical', direction: '+z' },
    });
    // WP-62 guard rail: prescription-derived cavities are review-flagged.
    expect(template.review).toEqual([PRESCRIPTION_REVIEW_NOTE]);
  });

  it('binds component@range + template@range in the module', () => {
    const { module, moduleId } = holderRecords(INPUT);
    expect(moduleId).toBe('user.cube.ac254_050_a_t3');
    expect(module.component).toBe('thorlabs.lens.ac254-050-a@^0.1');
    expect(module.template).toBe('user.tpl.holder_ac254_050_a@^0.1');
    expect(module.footprint_grid).toEqual([1, 1, 1]);
  });

  it('omits the review flag when the cut body was a vendor STEP', () => {
    const { template } = holderRecords({ ...INPUT, derivedFromPrescription: false });
    expect(template.review).toBeUndefined();
  });

  it('never declares an asset the run did not produce (WP-58 hygiene)', () => {
    const { template } = holderRecords({ ...INPUT, assets: { step: false, glb: false } });
    expect(template.step).toBeUndefined();
    expect(template.glb).toBeUndefined();
  });
});

describe('holderFiles', () => {
  it('lays out the library-PR file map with the mesh assets', () => {
    const records = holderRecords(INPUT);
    const glb = new Uint8Array([1, 2, 3]);
    const files = holderFiles(records, { glb, step: null });
    expect(Object.keys(files).sort()).toEqual([
      'modules/user.cube.ac254_050_a_t3/module.yml',
      'templates/user.tpl.holder_ac254_050_a/model.glb',
      'templates/user.tpl.holder_ac254_050_a/template.yml',
    ]);
    expect(files['templates/user.tpl.holder_ac254_050_a/model.glb']).toBe(glb);
    // The YAML round-trips (what /v1/library/save parses).
    const parsed = parse(
      files['templates/user.tpl.holder_ac254_050_a/template.yml'] as string,
    );
    expect(parsed.id).toBe('user.tpl.holder_ac254_050_a');
    expect(parsed.generator.params.clearance_mm).toBe(0.15);
  });
});

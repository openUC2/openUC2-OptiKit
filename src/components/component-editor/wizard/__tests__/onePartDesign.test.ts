/**
 * WP-111 — the synthesized one-part design IS the service contract: one
 * component under its key, the inline fragment, the pose, and
 * instantiation.dof_values. These tests pin the shape; the cross-repo check
 * (does optikit-core's DesignDecl parse it?) runs in CI via the service
 * tests and was verified by hand against `optikit_core.schema.check`.
 */

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { defaultDraft, draftToRecord } from '../../../../model/componentRecord';
import {
  fxChangesetJson,
  onePartDesignFiles,
  onePartKey,
  probeDesignFiles,
  t2ModuleRecord,
} from '../onePartDesign';

const record = () => {
  const draft = defaultDraft('lens');
  draft.name = 'wiz-lens-50';
  return draftToRecord(draft);
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('onePartDesignFiles (WP-111.4)', () => {
  it('emits one component with the inline fragment and the T2 dz value', () => {
    const { files, component } = onePartDesignFiles(record(), {
      vertexOffsetMm: 3.2,
      holdClass: 'adaptive',
      dzRangeMm: [-5, 5],
    });
    expect(component).toBe('wiz-lens-50');
    const design = parse(files['optikit-design.yml'] as string) as Json;
    const comp = design.components['wiz-lens-50'];
    expect(comp.optics.fragment.surfaces.length).toBeGreaterThan(0);
    expect(comp.dof[0]).toMatchObject({ name: 'dz', axis: 'z', range: [-5, 5] });
    // The T2 branch reads the position from dof_values, not from the pose.
    expect(design.instantiation.dof_values['wiz-lens-50.dz']).toBe(3.2);
    expect(comp.pose.translation['offset-mm']).toBeUndefined();
  });

  it('a fixed/T3 build carries the position as the pose δ instead', () => {
    const { files } = onePartDesignFiles(record(), {
      vertexOffsetMm: -2.5,
      holdClass: 'generative',
      dzRangeMm: [-5, 5],
    });
    const design = parse(files['optikit-design.yml'] as string) as Json;
    const comp = design.components[onePartKey(record())];
    expect(comp.pose.translation['offset-mm']).toEqual({ z: -2.5 });
    expect(comp.dof).toBeUndefined();
    expect(design.instantiation).toBeUndefined();
  });
});

describe('probeDesignFiles (WP-111.2)', () => {
  it('places source → optic → sensor one cell apart with a traceable path', () => {
    const { files, path, dofKey } = probeDesignFiles(
      record(),
      { vertexOffsetMm: 0, holdClass: 'fixed', dzRangeMm: [-5, 5] },
      0.488,
    );
    expect(path).toBe('probe');
    expect(dofKey).toBe('wiz-lens-50.dz');
    const design = parse(files['optikit-design.yml'] as string) as Json;
    expect(design.components['probe-source'].source.wavelengths_um).toEqual([0.488]);
    expect(design.components['probe-source'].pose.translation['offset-grid'].z).toBe(-1);
    expect(design.components['probe-sensor'].pose.translation['offset-grid'].z).toBe(1);
    expect(design.paths.probe.chain).toEqual([
      'probe-source.out',
      'wiz-lens-50.front>back',
      'probe-sensor.sensor',
    ]);
    // The probe always varies dz — the free variable of "find the best position".
    expect(design.components['wiz-lens-50'].dof[0].range).toEqual([-27.5, 27.5]);
  });
});

describe('the fallbacks', () => {
  it('fx changeset is the optikit-fx/v0 document, no service needed', () => {
    const json = JSON.parse(
      fxChangesetJson(record(), 'openuc2.tpl.lens_insert_25mm', {
        vertexOffsetMm: 4.1,
        holdClass: 'adaptive',
        dzRangeMm: [-7.5, 7.5],
      }),
    ) as Json;
    expect(json.schema).toBe('optikit-fx/v0');
    expect(json.changes[0]).toMatchObject({
      parameter: 'dz',
      'value-mm': 4.1,
      'template-id': 'openuc2.tpl.lens_insert_25mm',
    });
  });

  it('the accepted module binds the prescription to the master insert', () => {
    const module = t2ModuleRecord(record(), 'openuc2.tpl.lens_insert_25mm', '1.0.0');
    expect(module.id).toBe('user.cube.wiz_lens_50_t2');
    expect(module.component).toBe('user.lens.wiz-lens-50@^0.1');
    expect(module.template).toBe('openuc2.tpl.lens_insert_25mm@^1.0');
  });
});

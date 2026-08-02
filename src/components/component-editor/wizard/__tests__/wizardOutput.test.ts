/**
 * WP-110 — what the wizard's terminal step will write, per road state.
 *
 * The wizard adds no second way to author records: buildWizardOutput must
 * produce exactly what the mechanics tab's exits produce for the same bind
 * state, and degrade to a component-only save when no mechanics exist yet.
 */

import { describe, expect, it, vi } from 'vitest';

const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
  removeItem: (k: string) => void memStore.delete(k),
});

const { buildWizardOutput } = await import('../wizardOutput');
const { usePartWizard } = await import('../wizardStore');
const { useBindStore } = await import('../../../bind/bindStore');
const { defaultDraft, draftToRecord } = await import('../../../../model/componentRecord');

import type { WizardBindState } from '../wizardOutput';

const emptyBind = (over: Partial<WizardBindState> = {}): WizardBindState => ({
  glbBytes: null,
  stepBytes: null,
  meshFile: '',
  transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
  datums: [],
  templateClass: 'fixed',
  wholeModule: false,
  housingOnly: false,
  meshSizeMm: null,
  ...over,
});

const namedDraft = () => {
  const draft = defaultDraft('lens');
  draft.name = 'wizard-lens';
  return draft;
};

const datum = {
  id: 'datum-1',
  name: 'front',
  kind: 'front' as const,
  pointMm: [0, 0, 0] as [number, number, number],
  direction: [0, 0, -1] as [number, number, number],
  areaDiameterMm: null,
};

describe('buildWizardOutput (WP-110)', () => {
  it('refuses without a validated record', () => {
    const out = buildWizardOutput('numbers', defaultDraft('lens'), null, emptyBind());
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.ids).toEqual([]);
  });

  it('degrades to a component-only save when no mechanics exist', () => {
    const draft = namedDraft();
    const record = draftToRecord(draft);
    const out = buildWizardOutput('numbers', draft, record, emptyBind());
    expect(out.componentOnly).toBe(true);
    expect(out.ids).toEqual(['user.lens.wizard-lens']);
    expect(Object.keys(out.files)).toEqual([
      'components/user.lens.wizard-lens/component.yml',
    ]);
  });

  it('a housing road writes component + template, NO module (footprint_grid null)', () => {
    const draft = namedDraft();
    const record = draftToRecord(draft);
    const out = buildWizardOutput(
      'device',
      draft,
      record,
      emptyBind({
        glbBytes: new Uint8Array([1, 2, 3]),
        meshFile: 'km05.glb',
        datums: [datum],
        housingOnly: true,
        meshSizeMm: [30, 40, 50],
      }),
    );
    expect(out.componentOnly).toBe(false);
    expect(out.errors).toEqual([]);
    expect(out.ids).toHaveLength(2);
    const paths = Object.keys(out.files);
    expect(paths.some(p => p.startsWith('components/'))).toBe(true);
    expect(paths.some(p => p.startsWith('templates/'))).toBe(true);
    expect(paths.some(p => p.startsWith('modules/'))).toBe(false);
    // The housing template's footprint_grid must be null — that null is what
    // makes it a HOUSING (how optikit-core sorts housings from modules).
    const templatePath = paths.find(p => p.endsWith('template.yml'))!;
    expect(String(out.files[templatePath])).toMatch(/footprint_grid: null/);
  });

  it('a whole-cube road writes the full trio', () => {
    const draft = namedDraft();
    const record = draftToRecord(draft);
    const out = buildWizardOutput(
      'cube',
      draft,
      record,
      emptyBind({
        glbBytes: new Uint8Array([1, 2, 3]),
        meshFile: 'cube.glb',
        datums: [datum],
        wholeModule: true,
        meshSizeMm: [50, 50, 55],
      }),
    );
    expect(out.ids).toHaveLength(3);
    expect(Object.keys(out.files).some(p => p.startsWith('modules/'))).toBe(true);
  });
});

describe('usePartWizard persistence (WP-110.3)', () => {
  it('start → snapshot → restore round-trips the bind state', () => {
    const draft = namedDraft();
    usePartWizard.getState().start('device', draft);
    useBindStore.setState({
      meshFile: 'laser.glb',
      transform: { positionMm: [1, 2, 3], rotationDeg: [0, 90, 0] },
      datums: [datum],
      housingOnly: true,
      templateClass: 'fixed',
    });
    usePartWizard.getState().snapshotBind();
    // A "reload": the live bind store is cleared, the snapshot survives.
    useBindStore.getState().clear();
    expect(useBindStore.getState().datums).toEqual([]);
    usePartWizard.getState().restoreBind();
    const bind = useBindStore.getState();
    expect(bind.meshFile).toBe('laser.glb');
    expect(bind.transform.positionMm).toEqual([1, 2, 3]);
    expect(bind.datums).toHaveLength(1);
    expect(bind.housingOnly).toBe(true);
    // The persisted blob went through the localStorage stub.
    expect(memStore.get('optikit-parts-wizard')).toContain('wizard-lens');
    usePartWizard.getState().clear();
    expect(usePartWizard.getState().road).toBeNull();
  });
});

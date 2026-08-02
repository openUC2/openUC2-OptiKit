/**
 * WP-110 — the three roads, as data the PartWizard shell renders.
 *
 * Each step MOUNTS the existing panels (via roadSteps.tsx) with the
 * irrelevant controls hidden — no second copy of the surfaces table, no
 * second datum editor. The wizard's own additions are the help paragraphs
 * and the refuse-to-advance sentences: guidance is the deliverable, the
 * machinery already exists.
 *
 * Deepened by the follow-up packages: WP-112 (device road guidance),
 * WP-113 (cube road verify-t1), WP-111 (numbers road placement + bridge).
 */

import type { TemplateClass } from '../../../document';
import { defaultDraft } from '../../../model/componentRecord';
import { useBindStore } from '../../bind/bindStore';
import {
  CubeMesh,
  DeviceAlign,
  DeviceMechanics,
  DeviceOptics,
  NumbersBuildIt,
  NumbersHowIsItHeld,
  NumbersWhatIsIt,
  NumbersWhereDoesItSit,
} from './roadSteps';
import { usePartWizard, type RoadId } from './wizardStore';
import type { RoadDef, WizardCtx } from './wizardTypes';

const firstBlockingError = (ctx: WizardCtx): string | null => {
  if (!ctx.draft.name) {
    return 'name the part (the id slug) — every record the wizard writes is filed under it';
  }
  if (ctx.errors.length > 0) return ctx.errors[0];
  return null;
};

// ── the roads ────────────────────────────────────────────────────────────────

export const ROADS: Record<RoadId, RoadDef> = {
  numbers: {
    id: 'numbers',
    title: 'an optic in a cube — from its numbers',
    seed: () => defaultDraft('lens'),
    applyBindDefaults: () => {
      useBindStore.getState().clear();
      useBindStore.setState({ templateClass: 'generative' });
    },
    steps: [
      {
        key: 'what',
        label: 'what is it',
        help:
          'Pick the category and type the numbers from the datasheet — for a lens: diameter, ' +
          'the two radii, centre thickness, glass. The surfaces are the truth: the ports (how ' +
          'a beam enters and leaves) are derived from them and shown below, read-only.',
        Body: NumbersWhatIsIt,
        blocked: ctx => firstBlockingError(ctx),
      },
      {
        key: 'where',
        label: 'where does it sit',
        help:
          'One number matters: the offset of the optic’s front vertex from the CUBE ORIGIN ' +
          'along the optical axis. The default (0 — front vertex at the cube centre) is what ' +
          'every generated holder assumes today; change it if the design needs the focal plane ' +
          'somewhere specific.',
        Body: NumbersWhereDoesItSit,
      },
      {
        key: 'held',
        label: 'how is it held',
        help:
          'Two answers, named by their consequence: fixed in place, or adjustable along the ' +
          'beam. You never have to know the letters — the records will say T1 or T2 for you.',
        Body: NumbersHowIsItHeld,
      },
      {
        key: 'build',
        label: 'build it',
        help:
          'The service builds the physical insert around your prescription. Today that is the ' +
          'printable two-half holder (T3); the Inventor-machined insert arrives with the ' +
          'bridge (WP-111) and will use the position you chose two steps ago.',
        Body: NumbersBuildIt,
      },
    ],
    anatomy: (ctx, output) => ({
      mount: 'cube',
      templateClass: usePartWizard.getState().holdClass as TemplateClass,
      templateId: output.ids[1] ?? null,
      moduleId: output.ids[2] ?? null,
    }),
    resultNote: (ctx, output) =>
      output.componentOnly
        ? 'So far this is the optical component record alone — the holder dialog on the ' +
          '“build it” step writes the cube (template + module) when you accept a generated insert.'
        : 'A full trio: the prescription (component), the insert that holds it (template), and ' +
          'the cube module that places it on the 50 mm grid.',
  },

  device: {
    id: 'device',
    title: 'a device in its own housing — from a CAD file',
    seed: () => defaultDraft('source'),
    applyBindDefaults: () => {
      useBindStore.getState().clear();
      useBindStore.setState({ housingOnly: true, wholeModule: false, templateClass: 'fixed' });
    },
    steps: [
      {
        key: 'mechanics',
        label: 'the mechanics',
        help:
          'Drop the STEP (or GLB) of the device — a kinematic mount, a laser body, a camera. ' +
          'The measured bounding box appears immediately: it is the first thing that tells you ' +
          'the file is the one you meant.',
        Body: DeviceMechanics,
        blocked: (_ctx, bind) =>
          bind.glbBytes
            ? null
            : 'load the device’s STEP or GLB first — the “load STP / GLB” button above the viewport',
      },
      {
        key: 'optics',
        label: 'the optics',
        help:
          'What does this device do to light? Pick the category and fill the fields that ' +
          'category actually needs — a source’s emission lines and divergence, a lens’s radii, ' +
          'a mirror’s mount angle. This is the same form the expert tabs use.',
        Body: DeviceOptics,
        blocked: ctx => firstBlockingError(ctx),
      },
      {
        key: 'align',
        label: 'align the optics to the mechanics',
        help:
          'This step makes it ONE part instead of two unrelated files. A datum is the point on ' +
          'the part the optical model is measured from. Switch the viewport to datum mode and ' +
          'click the face where the optics live — a mirror’s reflective plane, a lens’s front ' +
          'vertex, a laser’s emission aperture — then confirm the beam direction on the datum row.',
        Body: DeviceAlign,
        blocked: (ctx, bind) =>
          bind.datums.length > 0
            ? null
            : 'no datum yet — the part has mechanics and optics, but nothing says where on the ' +
              'mesh the optics live. Switch the viewport to datum mode and click the optical surface.',
      },
    ],
    anatomy: (_ctx, output) => ({
      mount: output.componentOnly ? 'bare' : 'housed',
      templateClass: 'fixed',
      templateId: output.ids[1] ?? null,
      moduleId: null,
    }),
    resultNote: () =>
      'A HOUSING, not a cube: the template’s footprint_grid is null, which is exactly what ' +
      'lets it place freely on the schematic with its real mesh. It is not yet buildable into ' +
      'a cube — “wrap it in a cube” is a later, deliberate step (generate a T3 holder around ' +
      'it, or the Inventor round trip).',
  },

  cube: {
    id: 'cube',
    title: 'an Inventor cube you already have',
    seed: () => defaultDraft('mirror'),
    applyBindDefaults: () => {
      useBindStore.getState().clear();
      useBindStore.setState({ wholeModule: true, housingOnly: false, templateClass: 'fixed' });
    },
    steps: [
      {
        key: 'mesh',
        label: 'the cube',
        help:
          'Drop the Inventor export (STEP or GLB) of the WHOLE cube — cube body, insert, optic, ' +
          'screws, one file. It should measure one 50 × 50 × 55 mm cell; if the measured box ' +
          'disagrees, it is the wrong file or the wrong units, and finding out here beats ' +
          'finding out when it renders on its side.',
        Body: CubeMesh,
        blocked: (_ctx, bind) =>
          bind.glbBytes ? null : 'load the cube’s STEP or GLB first',
      },
      {
        key: 'datums',
        label: 'the datums',
        help:
          'Where inside the cube does the optic act? If the export is marker-stamped (the ' +
          'Inventor naming contract), the datum frames can be extracted automatically — ' +
          'otherwise switch to datum mode and click the optical surface, exactly like the ' +
          'housing road. The optic-placement mode (the gizmo) can also drop a primitive on a face.',
        Body: DeviceAlign,
        blocked: (_ctx, bind) =>
          bind.datums.length > 0
            ? null
            : 'no datum or placed optic yet — click the optical surface in datum mode, or add ' +
              'an optic and place it on its face',
      },
      {
        key: 'optics',
        label: 'the optics',
        help:
          'What is inside this cube — the same per-category form as the other roads. The ' +
          'record you author here is what simulation traces when the module is placed.',
        Body: DeviceOptics,
        blocked: ctx => firstBlockingError(ctx),
      },
    ],
    anatomy: (_ctx, output) => ({
      mount: output.ids[2] ? 'cube' : 'bare',
      templateClass: 'fixed',
      templateId: output.ids[1] ?? null,
      moduleId: output.ids[2] ?? null,
    }),
    resultNote: () =>
      'A T1 module — fixed, no knobs, the state most curated cubes are in. The template ' +
      'carries provenance: whole-module and the real measured envelope, so the assembly ' +
      'renders the actual Inventor mesh.',
  },
};

/**
 * Part-binding model (WP-19): datums authored on a mechanical part become
 * library records.
 *
 * A `BindDatum` is a point + direction (+ optional circular area) in the
 * CUBE frame — the part mesh has already been placed relative to the cube
 * origin, so datum coordinates are final. The mapping:
 *
 * - each datum → one `optics.frames` entry (full x/y/z-mm offset);
 * - each datum → one `optics.ports` entry; schema-v0 port directions are
 *   axis-aligned (`+x` … `-z`), so the authored direction snaps to the
 *   nearest principal axis, warning when the deviation is real;
 * - the mesh placement transform → the template's `mesh-offset` extra;
 * - the records bind into component + template + module, mirroring the
 *   WP-8/WP-9 importer conventions so all roads into the library look alike.
 */

import { stringify } from 'yaml';
import type { Vec3 } from '../document';

export type DatumKind = 'source' | 'sensor' | 'reflective' | 'front' | 'back' | 'custom';

export interface BindDatum {
  id: string;
  name: string;
  kind: DatumKind;
  /** Cube-frame position, mm (the mesh is already placed). */
  pointMm: Vec3;
  /** Unit direction the beam travels at this datum (cube frame). */
  direction: Vec3;
  /** Clear-aperture disc diameter, when meaningful. */
  areaDiameterMm: number | null;
}

export interface MeshTransform {
  positionMm: Vec3;
  rotationDeg: Vec3; // extrinsic ZXY, matching the schema's offset-deg
}

export interface BindInput {
  namespace: string;
  name: string; // id slug
  category: string; // lens | mirror | source | detector | …
  templateClass: 'fixed' | 'adaptive' | 'generative';
  meshFile: string; // e.g. "laser-housing.step" (source of truth)
  meshTransform: MeshTransform;
  datums: BindDatum[];
  description?: string;
}

export interface BoundRecords {
  component: Record<string, unknown>;
  template: Record<string, unknown>;
  module: Record<string, unknown>;
  warnings: string[];
}

const AXES: [string, Vec3][] = [
  ['+x', [1, 0, 0]], ['-x', [-1, 0, 0]],
  ['+y', [0, 1, 0]], ['-y', [0, -1, 0]],
  ['+z', [0, 0, 1]], ['-z', [0, 0, -1]],
];

/** Off-axis tolerance before the snap gets warned about (degrees). */
export const AXIS_SNAP_WARN_DEG = 2.0;

export function snapToAxis(direction: Vec3): {
  axis: string;
  vec: Vec3;
  deviationDeg: number;
} {
  const len = Math.hypot(...direction) || 1;
  const unit: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len];
  let best: { axis: string; vec: Vec3; dot: number } = { axis: '+z', vec: [0, 0, 1], dot: -2 };
  for (const [axis, vec] of AXES) {
    const dot = unit[0] * vec[0] + unit[1] * vec[1] + unit[2] * vec[2];
    if (dot > best.dot) best = { axis, vec, dot };
  }
  const deviationDeg = (Math.acos(Math.min(1, best.dot)) * 180) / Math.PI;
  return { axis: best.axis, vec: best.vec, deviationDeg };
}

/** Default port name for a datum kind (overridable via the datum's name). */
export function defaultPortName(kind: DatumKind, index: number): string {
  switch (kind) {
    case 'source': return 'out';
    case 'sensor': return 'sensor';
    case 'reflective': return 'front';
    case 'front': return 'front';
    case 'back': return 'back';
    default: return `port-${index}`;
  }
}

const round3 = (v: number) => Math.round(v * 1e3) / 1e3;

export function bindToRecords(input: BindInput): BoundRecords {
  const warnings: string[] = [];
  const componentId = `${input.namespace}.${input.category}.${input.name}`;
  const templateId = `${input.namespace}.tpl.${input.name}`;
  const moduleId = `${input.namespace}.cube.${input.name}`;

  const frames: Record<string, unknown> = { optical: { 'z-mm': 0.0 } };
  const ports: Record<string, unknown> = {};
  input.datums.forEach((datum, i) => {
    const snap = snapToAxis(datum.direction);
    if (snap.deviationDeg > AXIS_SNAP_WARN_DEG) {
      warnings.push(
        `datum '${datum.name}' points ${snap.deviationDeg.toFixed(1)}° off the ${snap.axis} ` +
          'axis — schema-v0 ports are axis-aligned; the residual needs offset-deg ' +
          'on the placed component',
      );
    }
    // One name serves as both the frame and the port; 'optical' is reserved
    // for the part origin, and empty names fall back to the kind default.
    let name = datum.name || defaultPortName(datum.kind, i);
    if (name === 'optical' || name in frames) name = `${name}-${i}`;
    const frame: Record<string, number> = {};
    if (datum.pointMm[0]) frame['x-mm'] = round3(datum.pointMm[0]);
    if (datum.pointMm[1]) frame['y-mm'] = round3(datum.pointMm[1]);
    frame['z-mm'] = round3(datum.pointMm[2]);
    frames[name] = frame;
    ports[name] = { frame: name, direction: snap.axis };
  });
  if (input.datums.length === 0) {
    warnings.push('no datums authored — the record has no ports; chaining will not work');
  }

  const component: Record<string, unknown> = {
    kind: 'optical_component',
    id: componentId,
    version: '0.1.0',
    category: input.category,
    description: input.description ?? `${input.name} (bound in the part-binding workbench)`,
    tags: ['bound'],
    optics: { frames, ports },
  };
  // Reflective parts carry a minimal flat-fold fragment (WP-8 convention).
  if (input.datums.some(d => d.kind === 'reflective')) {
    (component.optics as Record<string, unknown>).fragment = {
      surfaces: [
        {
          type: 'standard',
          geometry: { type: 'StandardGeometry', radius: Infinity, conic: 0 },
          interaction_model: { type: 'refractive_reflective', is_reflective: true },
        },
      ],
    };
  }

  const t = input.meshTransform;
  const template: Record<string, unknown> = {
    kind: 'mechanical_template',
    id: templateId,
    version: '0.1.0',
    class: input.templateClass,
    description: `mount for ${componentId} (bound from ${input.meshFile})`,
    tags: ['bound'],
    envelope: { 'x-mm': 50, 'y-mm': 50, 'z-mm': 50 },
    // STEP = mechanical source of truth; GLB = derived render copy.
    step: input.meshFile,
    glb: input.meshFile.replace(/\.(step|stp)$/i, '.glb'),
    'mesh-offset': {
      'x-mm': round3(t.positionMm[0]),
      'y-mm': round3(t.positionMm[1]),
      'z-mm': round3(t.positionMm[2]),
      'rot-deg': { x: round3(t.rotationDeg[0]), y: round3(t.rotationDeg[1]), z: round3(t.rotationDeg[2]) },
    },
    optical_ports: Object.fromEntries(
      Object.entries(ports).map(([name, port]) => [name, port]),
    ),
    footprint_grid: [1, 1, 1],
  };

  const module: Record<string, unknown> = {
    kind: 'cube_module',
    id: moduleId,
    version: '0.1.0',
    description: `${input.name} in a 1x1 cube (bound)`,
    tags: ['bound'],
    component: `${componentId}@^0.1`,
    template: `${templateId}@^0.1`,
    footprint_grid: [1, 1, 1],
  };

  return { component, template, module, warnings };
}

/** ±Infinity → .inf survives the yaml stringifier via a replacer pass. */
function yamlText(record: Record<string, unknown>): string {
  return stringify(record, { indent: 2, lineWidth: 100, aliasDuplicateObjects: false });
}

/** File map for the "Download records" zip (library-PR layout). */
export function recordsToFiles(records: BoundRecords): Record<string, string> {
  const componentId = records.component.id as string;
  const templateId = records.template.id as string;
  const moduleId = records.module.id as string;
  return {
    [`components/${componentId}/component.yml`]: yamlText(records.component),
    [`templates/${templateId}/template.yml`]: yamlText(records.template),
    [`modules/${moduleId}/module.yml`]: yamlText(records.module),
  };
}

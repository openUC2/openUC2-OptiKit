/**
 * Schematic port derivation, in priority order:
 *
 * 1. The imported source design's real `optics.ports` (via the retained
 *    document) — exact datum positions and beam directions in the part's
 *    LOCAL axes, so a vertical emission stack renders vertical pins.
 * 2. The module's 2D simulation model, where one exists (palette parts).
 * 3. Default front/back pins on the conventional +x optical axis.
 *
 * Local coordinates here are DOCUMENT-frame local: z = up.
 * (The 2D sim frame has y pointing "south", hence the y sign flip.)
 */

import { MODULE_SIMULATION_MODELS } from '../../types';
import type { DocPart, PortRef, Vec3 } from '../../document';
import { makePortRef, rotateDocVec, sourcePortsOf } from '../../document';

export interface SchematicPort {
  name: string;
  ref: PortRef;
  /** Position in part-local document coordinates, mm. */
  localMm: Vec3;
  /** Unit direction in part-local document coordinates. */
  localDir: Vec3;
  kind: 'input' | 'output' | 'bidirectional';
}

const HALF = 25; // default pin distance from part center, mm
/** Visual stand-off of a pin from its datum point along the beam direction. */
const PIN_OFFSET = 22;

const AXIS_VECTORS: Record<string, Vec3> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

/** Ports whose beam ENTERS the part (everything else is treated as exit). */
const INPUT_PORT_NAMES = /^(front|sensor|in|plane)$/;

export function portsOf(part: DocPart): SchematicPort[] {
  // 1 — real ports from the imported design.
  const source = sourcePortsOf(part.id);
  if (source && source.length > 0) {
    return source.map(p => {
      const dir = AXIS_VECTORS[p.direction] ?? [1, 0, 0];
      return {
        name: p.name,
        ref: makePortRef(part.id, p.name),
        localMm: [
          p.positionMm[0] + dir[0] * PIN_OFFSET,
          p.positionMm[1] + dir[1] * PIN_OFFSET,
          p.positionMm[2] + dir[2] * PIN_OFFSET,
        ],
        localDir: dir,
        kind: INPUT_PORT_NAMES.test(p.name) ? 'input' : 'output',
      };
    });
  }

  // 2 — the 2D simulation model.
  const sim = MODULE_SIMULATION_MODELS[part.libraryRef];
  if (sim?.ports && sim.ports.length > 0) {
    return sim.ports.map(p => {
      const rad = (p.direction * Math.PI) / 180;
      return {
        name: p.id,
        ref: makePortRef(part.id, p.id),
        localMm: [p.position.x, -p.position.y, 0],
        localDir: [Math.cos(rad), -Math.sin(rad), 0],
        kind: p.type,
      };
    });
  }
  // 3 — conventional fallbacks on the +x axis.
  if (part.category === 'source') {
    return [
      {
        name: 'out',
        ref: makePortRef(part.id, 'out'),
        localMm: [HALF, 0, 0],
        localDir: [1, 0, 0],
        kind: 'output',
      },
    ];
  }
  if (part.category === 'detector') {
    return [
      {
        name: 'sensor',
        ref: makePortRef(part.id, 'sensor'),
        localMm: [-HALF, 0, 0],
        localDir: [-1, 0, 0],
        kind: 'input',
      },
    ];
  }
  return [
    {
      name: 'front',
      ref: makePortRef(part.id, 'front'),
      localMm: [-HALF, 0, 0],
      localDir: [-1, 0, 0],
      kind: 'input',
    },
    {
      name: 'back',
      ref: makePortRef(part.id, 'back'),
      localMm: [HALF, 0, 0],
      localDir: [1, 0, 0],
      kind: 'output',
    },
  ];
}

/**
 * The part's optical axis in LOCAL document coordinates — the direction the
 * beam travels through it. Derived from the real ports when available
 * (entry ports point against the beam, so they are negated); the palette
 * convention (+x) otherwise. Glyphs are authored with +x as the optical
 * axis, so the scene rotates them onto this vector.
 */
export function opticalAxisOf(part: DocPart): Vec3 {
  const source = sourcePortsOf(part.id);
  if (source && source.length > 0) {
    const pick =
      source.find(p => p.name === 'front') ??
      source.find(p => INPUT_PORT_NAMES.test(p.name)) ??
      source.find(p => p.name === 'out') ??
      source[0];
    const dir = AXIS_VECTORS[pick.direction] ?? [1, 0, 0];
    const sign = INPUT_PORT_NAMES.test(pick.name) ? -1 : 1;
    // `|| 0` folds JavaScript's -0 back to 0.
    return [dir[0] * sign || 0, dir[1] * sign || 0, dir[2] * sign || 0];
  }
  return [1, 0, 0];
}

/** Absolute document-frame position of a port. */
export function portWorldMm(part: DocPart, port: SchematicPort): Vec3 {
  const rotated = rotateDocVec(part.worldPose.rotation, port.localMm);
  return [
    part.worldPose.positionMm[0] + rotated[0],
    part.worldPose.positionMm[1] + rotated[1],
    part.worldPose.positionMm[2] + rotated[2],
  ];
}

/** Resolve a PortRef to its world position, if the part and port still exist. */
export function resolvePortRef(parts: DocPart[], ref: PortRef): Vec3 | null {
  const dot = ref.lastIndexOf('.');
  const partId = ref.slice(0, dot);
  const portName = ref.slice(dot + 1);
  const part = parts.find(p => p.id === partId);
  if (!part) return null;
  const ports = portsOf(part);
  // Imported chains carry traversals ("front>back") — anchor at the entry port.
  const port =
    ports.find(p => p.name === portName) ??
    ports.find(p => p.name === portName.split('>')[0]);
  return port ? portWorldMm(part, port) : null;
}

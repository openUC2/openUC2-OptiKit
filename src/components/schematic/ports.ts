/**
 * Schematic port derivation. Until library records carry real `optics.ports`
 * (WP-12/WP-7 data), ports come from the module's 2D simulation model where one
 * exists, else default front/back pins on the part's optical axis (+x local).
 *
 * Local coordinates here are DOCUMENT-frame local: x = optical axis, z = up.
 * (The 2D sim frame has y pointing "south", hence the y sign flip.)
 */

import { MODULE_SIMULATION_MODELS } from '../../types';
import type { DocPart, PortRef, Vec3 } from '../../document';
import { makePortRef, rotateDocVec } from '../../document';

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

export function portsOf(part: DocPart): SchematicPort[] {
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
  const port = portsOf(part).find(p => p.name === portName);
  return port ? portWorldMm(part, port) : null;
}

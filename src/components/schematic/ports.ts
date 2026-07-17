/**
 * Schematic port derivation — ONE convention (WP-29):
 *
 * 1. The imported source design's real `optics.ports` (via the retained
 *    document) — exact datum positions and beam directions in the part's
 *    LOCAL axes.
 * 2. Otherwise the record-style port catalog for palette parts
 *    (`src/document/portCatalog.ts`) — same `SourcePort` shape, so glyph
 *    orientation, pin placement and beam routing all flow through the same
 *    code below. The legacy palette-only +x fallback is gone.
 *
 * Local coordinates here are DOCUMENT-frame local: z = up.
 */

import * as THREE from 'three';
import type { DocPart, PortRef, Vec3 } from '../../document';
import { libraryEntryOf, makePortRef, rotateDocVec, sourcePortsOf } from '../../document';
import { catalogPortsOf } from '../../document/portCatalog';
import type { PortDirection, SourcePort } from '../../document/sourceDesignStore';

export interface SchematicPort {
  name: string;
  ref: PortRef;
  /** Position in part-local document coordinates, mm. */
  localMm: Vec3;
  /** Unit direction in part-local document coordinates. */
  localDir: Vec3;
  kind: 'input' | 'output' | 'bidirectional';
}

/** Visual stand-off of a pin from its datum point along the beam direction. */
const PIN_OFFSET = 22;

const AXIS_VECTORS: Record<string, Vec3> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0],
  '+y': [0, 1, 0], '-y': [0, -1, 0],
  '+z': [0, 0, 1], '-z': [0, 0, -1],
};

/** Resolve a port direction — axis literal OR continuous unit vector (WP-39)
 * — to a unit Vec3 in part-local document axes. */
export function dirVecOf(direction: PortDirection): Vec3 {
  if (Array.isArray(direction)) {
    const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
    return [direction[0] / len, direction[1] / len, direction[2] / len];
  }
  return AXIS_VECTORS[direction] ?? [1, 0, 0];
}

/** Ports whose beam ENTERS the part (everything else is treated as exit). */
const INPUT_PORT_NAMES = /^(front|sensor|in|plane)$/;

/**
 * The part's ports in record shape: the retained source design when the part
 * was imported, the palette catalog otherwise. Never empty.
 */
export function recordPortsOf(part: DocPart): SourcePort[] {
  const source = sourcePortsOf(part.id);
  if (source && source.length > 0) return source;
  return catalogPortsOf(part.libraryRef, part.category);
}

export function portsOf(part: DocPart): SchematicPort[] {
  return recordPortsOf(part).map(p => {
    const dir = dirVecOf(p.direction);
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

function beamDirOf(port: SourcePort): Vec3 {
  const dir = dirVecOf(port.direction);
  // Entry ports face against the beam; negate to get the travel direction.
  const sign = INPUT_PORT_NAMES.test(port.name) ? -1 : 1;
  // `|| 0` folds JavaScript's -0 back to 0.
  return [dir[0] * sign || 0, dir[1] * sign || 0, dir[2] * sign || 0];
}

function entryPortOf(ports: SourcePort[]): SourcePort {
  return (
    ports.find(p => p.name === 'front') ??
    ports.find(p => INPUT_PORT_NAMES.test(p.name)) ??
    ports.find(p => p.name === 'out') ??
    ports[0]
  );
}

/**
 * The part's optical axis in LOCAL document coordinates — the direction the
 * beam travels INTO it (its emit direction for sources). Glyphs are authored
 * with +x as the optical axis, so scenes rotate them onto this vector.
 */
export function opticalAxisOf(part: DocPart): Vec3 {
  return beamDirOf(entryPortOf(recordPortsOf(part)));
}

/**
 * The entry/emit port's datum-frame offset in part-local mm (WP-39): where
 * the beam actually starts/lands on this part. The 2D preview offsets its sim
 * element by this, so a source whose `out` frame sits at z=+20 launches its
 * rays from the annotated anchor — matching the pin and the service trace.
 */
export function anchorFrameMm(part: DocPart): Vec3 {
  return entryPortOf(recordPortsOf(part)).positionMm;
}

export interface BeamAxes {
  /** Beam travel direction into the part (local doc frame). */
  entry: Vec3;
  /**
   * Exit beam direction with the LARGEST deviation from `entry` (the fold /
   * reflected arm), or null when the part is straight-through or terminal.
   */
  exit: Vec3 | null;
  /** Angle between entry and exit in degrees (null when exit is null). */
  foldDeg: number | null;
}

/**
 * Entry/exit beam axes derived purely from the record ports (WP-29): the fold
 * angle IS the angle between port directions — never hardcoded. flat_45-style
 * records yield 90°, retro mirrors 180°, straight-through parts null.
 *
 * WP-40 galvo groundwork: a library part whose template declares a ROTATION
 * DOF tilts its exit arm live — the dof value θ swings the reflected beam by
 * 2θ about the fold-plane normal, in the glyph, the pins and the 2D preview.
 */
export function beamAxesOf(part: DocPart): BeamAxes {
  const ports = recordPortsOf(part);
  const entryPort = entryPortOf(ports);
  const entry = beamDirOf(entryPort);

  let exit: Vec3 | null = null;
  let foldDeg: number | null = null;
  for (const p of ports) {
    if (p === entryPort || INPUT_PORT_NAMES.test(p.name)) continue;
    const dir = beamDirOf(p);
    const dot = entry[0] * dir[0] + entry[1] * dir[1] + entry[2] * dir[2];
    const angle = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
    if (foldDeg === null || angle > foldDeg) {
      foldDeg = angle;
      exit = dir;
    }
  }

  // Galvo: rotation-DOF value → the mirror normal tilts θ, the arm swings 2θ.
  if (exit) {
    const rotDof = libraryEntryOf(part.libraryRef)?.dofs.find(d => d.kind === 'rotation');
    const theta = rotDof
      ? part.dofs.find(d => d.name === rotDof.name)?.value ?? 0
      : 0;
    if (rotDof && theta) {
      const u = new THREE.Vector3(entry[0], entry[1], entry[2]);
      const e = new THREE.Vector3(exit[0], exit[1], exit[2]);
      const w = new THREE.Vector3().crossVectors(u, e);
      if (w.lengthSq() > 1e-9) {
        e.applyAxisAngle(w.normalize(), (2 * theta * Math.PI) / 180);
        exit = [e.x, e.y, e.z];
        const dot = entry[0] * exit[0] + entry[1] * exit[1] + entry[2] * exit[2];
        foldDeg = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
      }
    }
  }

  if (foldDeg === null || foldDeg < 1e-3) return { entry, exit: null, foldDeg: null };
  return { entry, exit, foldDeg };
}

const toThreeVec = (v: Vec3) => new THREE.Vector3(v[0], v[2], -v[1]); // doc → three

/**
 * Orientation for a glyph authored with +x = optical axis (and, for folding
 * glyphs, the exit arm toward +y): rotates +x onto the entry beam and keeps
 * the fold plane aligned with the real exit direction. Falls back to the
 * axis-only rotation for straight-through parts and 180° retro folds (where
 * the fold plane is degenerate).
 */
export function glyphQuatOf(part: DocPart): THREE.Quaternion {
  const { entry, exit, foldDeg } = beamAxesOf(part);
  const u = toThreeVec(entry).normalize();
  if (exit && foldDeg !== null && foldDeg > 1 && foldDeg < 179) {
    const e = toThreeVec(exit).normalize();
    const w = new THREE.Vector3().crossVectors(u, e).normalize(); // fold-plane normal
    const v = new THREE.Vector3().crossVectors(w, u).normalize(); // exit component
    const m = new THREE.Matrix4().makeBasis(u, v, w);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), u);
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

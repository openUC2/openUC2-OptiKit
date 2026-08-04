/**
 * The optical model, drawn inside the mechanics scene (WP-40).
 *
 * Surfaces + datum frames are the truth — so SHOW them: at the record's
 * anchor datum this overlay renders the lens cross-section (surface-of-
 * revolution from the draft's radii/thickness/⌀), the mirror plane disc, the
 * detector's sensor plane, beam entry/exit arrows and the frame axes. The
 * lens outline sitting inside the STP's glass IS the visual verify-t1; a
 * misplaced datum is something you see, not something a checker reports.
 *
 * Galvo groundwork: for mirror-family records a tilt angle θ (bindStore's
 * galvoTiltDeg) rotates the surface normal about the local x axis, and the
 * reflected beam arrow swings by 2θ via the reflection law — the first
 * record-internal continuous DOF made visible (WP-26 will actuate it).
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../../document';
import { datumToCube, poseDirection, posePoint } from '../../model/bindRecord';
import {
  PORT_AXIS_VECTORS,
  maxSemiApertureMm,
  surfaceProfiles,
  type RecordDraft,
} from '../../model/componentRecord';
import { useBindStore } from './bindStore';

const docToThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];

const ENTRY_COLOR = '#f0a53c';
const EXIT_COLOR = '#2ec4a5';
const GLASS_COLOR = '#1f9c7c';
const PLANE_COLOR = '#4aa3ff';

const NO_RAYCAST = () => null;

/** Anchor datum: the optical one if present, else the first authored. */
const ANCHOR_KINDS = ['reflective', 'source', 'sensor', 'front'];

function BeamArrow({
  dir,
  color,
  lengthMm = 34,
  fromMm = [0, 0, 0],
}: {
  dir: THREE.Vector3;
  color: string;
  lengthMm?: number;
  fromMm?: [number, number, number];
}) {
  const quat = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      ),
    [dir],
  );
  const mid = dir.clone().normalize().multiplyScalar(lengthMm / 2);
  const tip = dir.clone().normalize().multiplyScalar(lengthMm);
  return (
    <group position={fromMm}>
      <mesh position={mid} quaternion={quat} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.5, 0.5, lengthMm, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh position={tip} quaternion={quat} raycast={NO_RAYCAST}>
        <coneGeometry args={[1.8, 5, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FrameAxes({ sizeMm = 8 }: { sizeMm?: number }) {
  const axes: { dir: [number, number, number]; color: string }[] = [
    { dir: [1, 0, 0], color: '#e0533d' },
    { dir: [0, 1, 0], color: '#7cc142' },
    { dir: [0, 0, 1], color: '#2c8fff' },
  ];
  return (
    <group>
      {axes.map(({ dir, color }, i) => (
        <mesh
          key={i}
          position={[dir[0] * sizeMm / 2, dir[1] * sizeMm / 2, dir[2] * sizeMm / 2]}
          quaternion={new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(...dir),
          )}
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry args={[0.25, 0.25, sizeMm, 6]} />
          <meshBasicMaterial color={color} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The optical primitive drawn at the LOCAL origin, facing +y (the optical
 * axis): lens surface-of-revolution, mirror plane disc, or sensor plane, plus
 * beam arrows and frame axes. Reused for the WP-40 anchor overlay and for each
 * gizmo-placed WP-41 instance. Sizes come from the draft's surfaces; a
 * per-instance `diameterMm` overrides the disc/plane size (a mirror's size).
 */
export function OpticGlyph({
  category,
  surfaces,
  diameterMm = null,
  galvoTiltDeg = 0,
  mountAngleDeg = 0,
}: {
  category: string;
  surfaces: RecordDraft['surfaces'];
  diameterMm?: number | null;
  galvoTiltDeg?: number;
  /**
   * WP-107: the record's own fold angle. The mirror plate was drawn square to
   * the beam and tilted only by the galvo slider (default 0), so a 45° fold
   * mirror rendered as a disc facing the beam — the one thing a fold mirror
   * never is. Default 0 keeps hand-placed optics where the user put them.
   */
  mountAngleDeg?: number;
}) {
  const semi = diameterMm ? diameterMm / 2 : maxSemiApertureMm(surfaces);
  const isMirror = ['mirror', 'beamsplitter', 'dichroic'].includes(category);
  const isDetector = category === 'detector';
  const isSource = category === 'source';
  const hasGlass = !isMirror && !isDetector && !isSource && surfaces.length > 0;

  const latheGeoms = useMemo(() => {
    if (!hasGlass) return [];
    return surfaceProfiles(surfaces, 24).map(profile => {
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 24; k++) {
        const r = (profile.semiAperture * k) / 24;
        const idx = profile.points.findIndex(([, y]) => y >= r);
        const axial = profile.points[idx >= 0 ? idx : profile.points.length - 1][0];
        pts.push(new THREE.Vector2(r, axial));
      }
      return new THREE.LatheGeometry(pts, 40);
    });
  }, [hasGlass, surfaces]);

  // Galvo: tilt the mirror normal about local x; the reflected arm swings 2θ.
  // WP-107: the record's mount angle is the BASE tilt; the galvo slider is a
  // delta on top of it, so the reflection law below keeps producing the exit
  // arrow for free and the slider still means "swing it by θ".
  const { normal, reflected } = useMemo(() => {
    const theta = ((galvoTiltDeg + mountAngleDeg) * Math.PI) / 180;
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), theta);
    const beam = new THREE.Vector3(0, -1, 0);
    const r = beam.clone().sub(n.clone().multiplyScalar(2 * beam.dot(n)));
    return { normal: n, reflected: r };
  }, [galvoTiltDeg, mountAngleDeg]);

  return (
    <group>
      <FrameAxes />
      {hasGlass &&
        latheGeoms.map((geom, i) => (
          <mesh key={i} geometry={geom} raycast={NO_RAYCAST}>
            <meshStandardMaterial
              color={GLASS_COLOR} transparent opacity={0.35}
              side={THREE.DoubleSide} depthWrite={false}
            />
          </mesh>
        ))}
      {isMirror && (
        <group
          quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
            <circleGeometry args={[semi, 48]} />
            <meshStandardMaterial
              color={PLANE_COLOR} transparent opacity={0.4}
              side={THREE.DoubleSide} depthWrite={false}
            />
          </mesh>
        </group>
      )}
      {isDetector && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
          <planeGeometry args={[semi * 1.6, semi * 1.2]} />
          <meshStandardMaterial
            color={PLANE_COLOR} transparent opacity={0.4}
            side={THREE.DoubleSide} depthWrite={false}
          />
        </mesh>
      )}
      {isSource ? (
        <BeamArrow dir={new THREE.Vector3(0, 1, 0)} color={EXIT_COLOR} />
      ) : (
        <BeamArrow dir={new THREE.Vector3(0, -1, 0)} color={ENTRY_COLOR} fromMm={[0, 34, 0]} />
      )}
      {isMirror && <BeamArrow dir={reflected} color={EXIT_COLOR} />}
      {hasGlass && (
        <BeamArrow
          dir={new THREE.Vector3(0, -1, 0)}
          color={EXIT_COLOR}
          fromMm={[0, -Math.max(4, ...surfaces.map(s => s.thicknessMm ?? 0)), 0]}
        />
      )}
    </group>
  );
}

/** WP-40 anchor overlay: draw the optical model at the primary datum's pose
 * (the non-whole-module case — gizmo-placed instances draw via PlacedOptics). */
export function OpticsOverlay({ draft }: { draft: RecordDraft }) {
  const datums = useBindStore(s => s.datums);
  const transform = useBindStore(s => s.transform);
  const insertPose = useBindStore(s => s.insertPose);
  const showOptics = useBindStore(s => s.showOptics);
  const galvoTiltDeg = useBindStore(s => s.galvoTiltDeg);

  const anchor = useMemo(() => {
    // Gizmo-placed optics render via PlacedOptics — skip them here.
    // WP-116: an authored insert pose is the binding — draw the record's
    // optic exactly where the pose puts it (pose ∘ record entry frame).
    if (insertPose) {
      const entryPort = draft.ports.find(p => /^(front|sensor|in|plane)$/.test(p.name))
        ?? draft.ports[0];
      if (!entryPort) return null;
      const entryFrame = draft.frames.find(f => f.name === entryPort.frame);
      const dir = PORT_AXIS_VECTORS[entryPort.direction] ?? ([0, 0, -1] as [number, number, number]);
      return {
        pointMm: posePoint(insertPose, [0, 0, entryFrame?.zMm ?? 0]),
        direction: poseDirection(insertPose, dir),
      };
    }
    const datum =
      datums.find(d => !d.quaternion && ANCHOR_KINDS.includes(d.kind)) ??
      datums.find(d => !d.quaternion) ?? null;
    if (datum) return datumToCube(datum, transform);
    // WP-107: with no datum, draw the optic from the RECORD — at its entry
    // frame, facing its entry port. Every optical primitive here used to be
    // gated on `datums`, and opening a record CLEARS them, so the mechanics
    // tab showed an empty cube for a record that fully describes its optic.
    // Render-only: this never enters `store.datums`, because a datum is
    // authored data that `bindToRecords` would publish.
    const entry = draft.ports.find(p => /^(front|sensor|in|plane)$/.test(p.name))
      ?? draft.ports[0];
    if (!entry) return null;
    const frame = draft.frames.find(f => f.name === entry.frame);
    return {
      pointMm: [0, 0, frame?.zMm ?? 0] as [number, number, number],
      direction: PORT_AXIS_VECTORS[entry.direction] ?? ([0, 0, -1] as [number, number, number]),
    };
  }, [datums, transform, insertPose, draft.ports, draft.frames]);

  const quat = useMemo(() => {
    const d = new THREE.Vector3(...docToThree(anchor?.direction ?? [0, 1, 0]));
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      d.lengthSq() > 0 ? d.normalize() : new THREE.Vector3(0, 1, 0),
    );
  }, [anchor?.direction]);

  if (!showOptics || !anchor) return null;
  return (
    <group position={docToThree(anchor.pointMm)} quaternion={quat}>
      <OpticGlyph
        category={draft.category}
        surfaces={draft.surfaces}
        galvoTiltDeg={galvoTiltDeg}
        mountAngleDeg={draft.mirrorAngleDeg ?? 0}
      />
    </group>
  );
}

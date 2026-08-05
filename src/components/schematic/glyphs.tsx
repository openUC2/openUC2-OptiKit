/**
 * Schematic glyphs: category-specific 3D symbols (not cubes). Authored in
 * three.js local coordinates with X = optical axis (entry beam) and — for
 * folding glyphs — the exit arm toward +Y; the scene orients the group with
 * `glyphQuatOf` so these render on the part's REAL beam axes.
 *
 * WP-29: mirror/splitter plates are no longer hardcoded — the plate normal
 * follows the reflection law from the record's fold angle
 * (n ∝ exit − entry), so a 45°-mounted mirror draws a 45° plate and a
 * normal-incidence mirror draws a perpendicular one.
 */

import * as THREE from 'three';
import { Line, Text } from '@react-three/drei';
import type { DocCategory, InterfaceKind } from '../../document';
import { GLYPH_COLORS } from './colors';

/** Overlay lines must never intercept pointer raycasts. */
const NO_RAYCAST = () => null;

/**
 * Plate rotation (about glyph z) whose face normal bisects entry→exit:
 * entry beam is +x, exit at `foldDeg` in the xy-plane, so the mirror normal
 * n ∝ (exit − entry) sits at atan2(sin f, cos f − 1). 90° fold → 135°
 * (a 45° plate); 180° retro → 180° (plate perpendicular to the beam).
 */
function plateAngle(foldDeg: number): number {
  const f = (foldDeg * Math.PI) / 180;
  return Math.atan2(Math.sin(f), Math.cos(f) - 1);
}

function LensGlyph({ color }: { color: string }) {
  // Biconvex disc: a sphere squashed along the optical axis.
  return (
    <mesh scale={[0.18, 1, 1]}>
      <sphereGeometry args={[14, 32, 24]} />
      <meshPhysicalMaterial
        color={color}
        transparent
        opacity={0.45}
        roughness={0.1}
        transmission={0.6}
        thickness={4}
      />
    </mesh>
  );
}

/** WP-125: plate cross-section from the record's clear aperture. A rect
 * mirror draws the [w, h] plate it declares (scaled into the 28-unit glyph);
 * null keeps the round disc. */
function plateSize(rectMm: [number, number] | null): { w: number; h: number } | null {
  if (!rectMm || rectMm[0] <= 0 || rectMm[1] <= 0) return null;
  const scale = 28 / Math.max(rectMm[0], rectMm[1]);
  return { w: rectMm[0] * scale, h: rectMm[1] * scale };
}

function MirrorGlyph({
  color,
  foldDeg,
  rectMm = null,
}: {
  color: string;
  foldDeg: number;
  rectMm?: [number, number] | null;
}) {
  // Thin plate oriented by the record's fold angle (180° = normal incidence).
  const n = plateAngle(foldDeg);
  const rect = plateSize(rectMm);
  return (
    <group rotation={[0, 0, n - Math.PI]}>
      {/* authored with the reflective face toward -x (the incoming beam) */}
      {rect ? (
        <>
          <mesh>
            <boxGeometry args={[2.5, rect.w, rect.h]} />
            <meshStandardMaterial color={color} metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[-1.8, 0, 0]}>
            <boxGeometry args={[0.4, rect.w, rect.h]} />
            <meshBasicMaterial color="#eef4f8" />
          </mesh>
        </>
      ) : (
        <>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[14, 14, 2.5, 32]} />
            <meshStandardMaterial color={color} metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[-1.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[14, 14, 0.4, 32]} />
            <meshBasicMaterial color="#eef4f8" />
          </mesh>
        </>
      )}
    </group>
  );
}

function SourceGlyph({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[-8, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[7, 7, 18, 24]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[4, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[5, 8, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function DetectorGlyph({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[12, 22, 22]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[-6.5, 0, 0]}>
        <boxGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#1c242b" roughness={0.2} metalness={0.3} />
      </mesh>
    </group>
  );
}

function SplitterGlyph({
  color,
  plateColor,
  foldDeg,
}: {
  color: string;
  plateColor: string;
  foldDeg: number;
}) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[24, 24, 24]} />
        <meshPhysicalMaterial color={color} transparent opacity={0.18} roughness={0.05} />
      </mesh>
      {/* Internal plate oriented by the reflected arm's real fold angle. */}
      <mesh rotation={[0, 0, plateAngle(foldDeg)]}>
        <boxGeometry args={[1.2, 32, 23]} />
        <meshStandardMaterial color={plateColor} transparent opacity={0.75} metalness={0.5} roughness={0.2} />
      </mesh>
    </group>
  );
}

function FilterGlyph({ color }: { color: string }) {
  return (
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[13, 13, 3, 32]} />
      <meshPhysicalMaterial color={color} transparent opacity={0.55} roughness={0.2} />
    </mesh>
  );
}

function SampleGlyph({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[6, 26, 16]} />
      <meshPhysicalMaterial color={color} transparent opacity={0.5} roughness={0.3} />
    </mesh>
  );
}

// ── interface-zone glyphs (WP-64) ────────────────────────────────────────────
// Plates, puzzle joints and baseplates live in the 5 mm interface layer; the
// generic blob made a placed miniframe group read as a cloud of identical
// boxes. These stay deliberately subtle: flat outlines + a dim label.

/** Notched square: the UC2 puzzle-piece footprint, extruded 2 mm and laid
 * flat (shape XY → scene ground plane). */
const PUZZLE_GEOMETRY = (() => {
  const s = new THREE.Shape();
  const h = 8; // half-size of the square
  const nw = 3; // notch half-width
  const nd = 4; // notch depth
  s.moveTo(-h, -h);
  s.lineTo(h, -h);
  s.lineTo(h, h);
  s.lineTo(nw, h);
  s.lineTo(nw, h - nd);
  s.lineTo(-nw, h - nd);
  s.lineTo(-nw, h);
  s.lineTo(-h, h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false });
  geo.translate(0, 0, -1);
  return geo;
})();
const PUZZLE_EDGES = new THREE.EdgesGeometry(PUZZLE_GEOMETRY);

const PLATE_GEOMETRY = new THREE.BoxGeometry(44, 1.6, 44);
const PLATE_EDGES = new THREE.EdgesGeometry(PLATE_GEOMETRY);
const BASEPLATE_GEOMETRY = new THREE.BoxGeometry(48, 1.2, 48);
const BASEPLATE_EDGES = new THREE.EdgesGeometry(BASEPLATE_GEOMETRY);

/** Part ref at reduced prominence — the interface parts must stay quiet. */
function InterfaceLabel({ label }: { label: string }) {
  return (
    <Text
      position={[0, 4, 0]}
      fontSize={4.5}
      color="#9aa4af"
      fillOpacity={0.85}
      anchorX="center"
      anchorY="bottom"
    >
      {label}
    </Text>
  );
}

function InterfaceGlyph({
  kind,
  color,
  label,
}: {
  kind: InterfaceKind;
  color: string;
  label: string;
}) {
  if (kind === 'puzzle') {
    return (
      <group>
        <mesh geometry={PUZZLE_GEOMETRY} rotation={[-Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color} transparent opacity={0.35} roughness={0.7} />
        </mesh>
        <lineSegments geometry={PUZZLE_EDGES} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
          <lineBasicMaterial color={color} transparent opacity={0.9} />
        </lineSegments>
        <InterfaceLabel label={label} />
      </group>
    );
  }
  const plate = kind === 'plate';
  return (
    <group>
      <mesh geometry={plate ? PLATE_GEOMETRY : BASEPLATE_GEOMETRY}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={plate ? 0.3 : 0.18}
          roughness={0.8}
        />
      </mesh>
      <lineSegments geometry={plate ? PLATE_EDGES : BASEPLATE_EDGES} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={color} transparent opacity={0.9} />
      </lineSegments>
      {/* Inner cross: a baseplate reads as a gridded carrier, not a lid. */}
      {!plate && (
        <>
          <Line
            raycast={NO_RAYCAST}
            points={[[-24, 1, 0], [24, 1, 0]]}
            color={color}
            lineWidth={1}
            transparent
            opacity={0.5}
          />
          <Line
            raycast={NO_RAYCAST}
            points={[[0, 1, -24], [0, 1, 24]]}
            color={color}
            lineWidth={1}
            transparent
            opacity={0.5}
          />
        </>
      )}
      <InterfaceLabel label={label} />
    </group>
  );
}

function FallbackGlyph({ color, label }: { color: string; label: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[26, 26, 26]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} roughness={0.6} />
      </mesh>
      <Text position={[0, 16, 0]} fontSize={7} color="#dde3ea" anchorX="center" anchorY="bottom">
        {label}
      </Text>
    </group>
  );
}

/**
 * Arrow along the local optical axis (+x). For folding parts the arrow bends
 * at the element: entry from −x, exit along the record's fold angle — so the
 * symbol shows the routing the compiled optic will actually take (WP-29).
 */
export function OpticalAxisArrow({
  color = '#ffcf5c',
  foldDeg = null,
}: {
  color?: string;
  foldDeg?: number | null;
}) {
  const folded = foldDeg !== null && foldDeg > 1;
  const f = ((foldDeg ?? 0) * Math.PI) / 180;
  const exit: [number, number, number] = [30 * Math.cos(f), 30 * Math.sin(f), 0];
  const head = folded ? exit : ([30, 0, 0] as const);
  const headAngle = folded ? f - Math.PI / 2 : -Math.PI / 2;
  return (
    <group>
      <Line
        raycast={NO_RAYCAST}
        points={folded ? [[-30, 0, 0], [0, 0, 0], exit] : [[-30, 0, 0], [30, 0, 0]]}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={0.85}
      />
      <mesh
        position={[head[0] * 1.07, head[1] * 1.07, 0]}
        rotation={[0, 0, headAngle]}
      >
        <coneGeometry args={[2.4, 7, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function SchematicGlyph({
  category,
  label,
  foldDeg = null,
  tint = null,
  dimmed = false,
  interfaceKind = null,
  mirrorRectMm = null,
}: {
  category: DocCategory;
  label: string;
  /** Fold angle from the record ports (beamAxesOf); null = straight-through. */
  foldDeg?: number | null;
  /** WP-47: a source's active-line colour, overriding the category tint. */
  tint?: string | null;
  /** WP-47: a source that is switched off reads greyed out. */
  dimmed?: boolean;
  /** WP-64: structural interface-zone parts (plate/puzzle/baseplate) draw a
   * distinct flat glyph instead of the generic blob. */
  interfaceKind?: InterfaceKind | null;
  /** WP-125: rectangular reflective aperture [w, h] mm — a rect mirror draws
   * the plate the record declares instead of a disc. */
  mirrorRectMm?: [number, number] | null;
}) {
  const color = dimmed ? '#6b7280' : (tint ?? GLYPH_COLORS[category]);
  // WP-92: an interface part IS its flat glyph, whatever category its record
  // declares — before the fix a puzzle joint whose index category was not
  // 'other' fell into a dedicated optics glyph and the joints stayed
  // invisible ghosts.
  if (interfaceKind) return <InterfaceGlyph kind={interfaceKind} color={color} label={label} />;
  // 180° (normal incidence) is the safe default when no fold is known.
  const fold = foldDeg ?? 180;
  switch (category) {
    case 'lens':
      return <LensGlyph color={color} />;
    case 'mirror':
      return <MirrorGlyph color={color} foldDeg={fold} rectMm={mirrorRectMm} />;
    case 'source':
      return <SourceGlyph color={color} />;
    case 'detector':
      return <DetectorGlyph color={color} />;
    case 'beamsplitter':
      return <SplitterGlyph color={color} plateColor={color} foldDeg={foldDeg ?? 90} />;
    case 'dichroic':
      return (
        <SplitterGlyph
          color={color}
          plateColor={GLYPH_COLORS.dichroic}
          foldDeg={foldDeg ?? 90}
        />
      );
    case 'filter':
      return <FilterGlyph color={color} />;
    case 'sample':
      return <SampleGlyph color={color} />;
    // WP-47: a programmable surface is a plate like a mirror, but drawn with
    // its own colour so a DMD never reads as a plain fold mirror.
    case 'slm':
    case 'display':
      return <MirrorGlyph color={color} foldDeg={fold} rectMm={mirrorRectMm} />;
    default:
      return <FallbackGlyph color={color} label={label} />;
  }
}

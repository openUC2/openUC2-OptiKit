/**
 * Schematic glyphs: category-specific 3D symbols (not cubes). Authored in
 * three.js local coordinates with X = optical axis, Y = up; the part's
 * document-frame quaternion is converted by the scene (mapping.docQuatToThree)
 * so these render in the right orientation.
 */

import { Line, Text } from '@react-three/drei';
import type { DocCategory } from '../../document';
import { GLYPH_COLORS } from './colors';

/** Overlay lines must never intercept pointer raycasts. */
const NO_RAYCAST = () => null;

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

function MirrorGlyph({ color }: { color: string }) {
  // Thin plate whose face normal is the optical axis.
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[14, 14, 2.5, 32]} />
        <meshStandardMaterial color={color} metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[-1.8, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[14, 14, 0.4, 32]} />
        <meshBasicMaterial color="#eef4f8" />
      </mesh>
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

function SplitterGlyph({ color, plateColor }: { color: string; plateColor: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[24, 24, 24]} />
        <meshPhysicalMaterial color={color} transparent opacity={0.18} roughness={0.05} />
      </mesh>
      {/* Diagonal plate: normal halfway between −x and +z(local up → deflects up/side). */}
      <mesh rotation={[0, 0, Math.PI / 4]}>
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

/** Arrow along the local optical axis (+x), always drawn. */
export function OpticalAxisArrow({ color = '#ffcf5c' }: { color?: string }) {
  return (
    <group>
      <Line
          raycast={NO_RAYCAST}
        points={[
          [-30, 0, 0],
          [30, 0, 0],
        ]}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={0.85}
      />
      <mesh position={[32, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[2.4, 7, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function SchematicGlyph({
  category,
  label,
}: {
  category: DocCategory;
  label: string;
}) {
  const color = GLYPH_COLORS[category];
  switch (category) {
    case 'lens':
      return <LensGlyph color={color} />;
    case 'mirror':
      return <MirrorGlyph color={color} />;
    case 'source':
      return <SourceGlyph color={color} />;
    case 'detector':
      return <DetectorGlyph color={color} />;
    case 'beamsplitter':
      return <SplitterGlyph color={color} plateColor={color} />;
    case 'dichroic':
      return <SplitterGlyph color={color} plateColor={GLYPH_COLORS.dichroic} />;
    case 'filter':
      return <FilterGlyph color={color} />;
    case 'sample':
      return <SampleGlyph color={color} />;
    default:
      return <FallbackGlyph color={color} label={label} />;
  }
}

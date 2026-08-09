/**
 * In-scene rendering of the measure tool: settled dimension lines with mm
 * labels, the live rubber band from the first pick to the cursor, and a ring
 * marking a snapped target. Subscribes to the measure store, so pointer
 * moves re-render only this subtree.
 */

import { Line, Text } from '@react-three/drei';
import type { Vec3 } from '../../document';
import { measureLabel, useMeasureStore } from './measureStore';
import type { SnapPoint } from './measureStore';

const MEASURE_COLOR = '#f59e0b';
const NO_RAYCAST = () => null;

/** doc [x, y, z] → three [x, z, −y], lifted a hair above the glyphs. */
const LIFT = 1.5;
const toThree = (p: Vec3): [number, number, number] => [p[0], p[2] + LIFT, -p[1]];

function Dimension({ a, b, dashed }: { a: SnapPoint; b: SnapPoint; dashed?: boolean }) {
  const pa = toThree(a.mm);
  const pb = toThree(b.mm);
  const mid: [number, number, number] = [
    (pa[0] + pb[0]) / 2,
    (pa[1] + pb[1]) / 2 + 3,
    (pa[2] + pb[2]) / 2,
  ];
  const named = [a.label, b.label].filter(Boolean).join(' → ');
  return (
    <group>
      <Line
        points={[pa, pb]}
        color={MEASURE_COLOR}
        lineWidth={1.5}
        dashed={dashed}
        dashSize={3}
        gapSize={2}
        raycast={NO_RAYCAST}
      />
      {([pa, pb] as const).map((p, i) => (
        <mesh key={i} position={p} raycast={NO_RAYCAST}>
          <sphereGeometry args={[1.1, 12, 12]} />
          <meshBasicMaterial color={MEASURE_COLOR} />
        </mesh>
      ))}
      <Text
        position={mid}
        fontSize={6}
        color={MEASURE_COLOR}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.4}
        outlineColor="#00000090"
        raycast={NO_RAYCAST}
      >
        {measureLabel(a.mm, b.mm)}
        {named ? `\n${named}` : ''}
      </Text>
    </group>
  );
}

export function MeasureOverlay3D() {
  const active = useMeasureStore(s => s.active);
  const measurements = useMeasureStore(s => s.measurements);
  const draftA = useMeasureStore(s => s.draftA);
  const cursor = useMeasureStore(s => s.cursor);

  if (!active) return null;
  return (
    <group>
      {measurements.map((m, i) => (
        <Dimension key={i} a={m.a} b={m.b} />
      ))}
      {draftA && cursor && <Dimension a={draftA} b={cursor} dashed />}
      {cursor?.label && (
        <mesh
          position={toThree(cursor.mm)}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={NO_RAYCAST}
        >
          <ringGeometry args={[2.2, 3, 24]} />
          <meshBasicMaterial color={MEASURE_COLOR} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

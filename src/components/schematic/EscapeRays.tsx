/**
 * Escape-ray overlay (WP-52): when auto-chaining fails with E_NO_TARGET (or a
 * partial inference leaves dead arms), draw the escaping ray as a dashed red
 * segment from where it left the system, with a label naming the empty cell —
 * so a failing chain explains itself instead of just erroring.
 */

import { Fragment } from 'react';
import { Line, Html } from '@react-three/drei';
import type { Vec3 } from '../../document';
import { UC2_GRID_MM } from '../../document/types';
import { useServiceStore } from './serviceStore';

const NO_RAYCAST = () => null;
const ESCAPE_COLOR = '#ff4d4f';

/** doc frame (x, y-north, z-up) → three (x, y-up, z-south). */
const toThree = (p: Vec3): [number, number, number] => [p[0], p[2], -p[1]];

export function EscapeRays() {
  const escapes = useServiceStore(s => s.escapes);
  if (escapes.length === 0) return null;

  // Draw the ray one and a half grid steps along its direction — far enough to
  // clearly point at the empty cell it heads toward.
  const reach = 1.5 * Math.max(UC2_GRID_MM[0], UC2_GRID_MM[1], UC2_GRID_MM[2]);

  return (
    <>
      {escapes.map((e, i) => {
        const end: Vec3 = [
          e.originMm[0] + e.direction[0] * reach,
          e.originMm[1] + e.direction[1] * reach,
          e.originMm[2] + e.direction[2] * reach,
        ];
        return (
          <Fragment key={i}>
            <Line
              raycast={NO_RAYCAST}
              points={[toThree(e.originMm), toThree(end)]}
              color={ESCAPE_COLOR}
              lineWidth={1.8}
              dashed
              dashSize={6}
              gapSize={4}
              transparent
              opacity={0.9}
            />
            <Html position={toThree(end)} center distanceFactor={600} zIndexRange={[20, 0]}>
              <div
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                  background: 'rgba(200,40,44,0.92)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                  transform: 'translateY(-14px)',
                }}
              >
                ⚠ beam escapes → cell [{e.cell.join(', ')}]
              </div>
            </Html>
          </Fragment>
        );
      })}
    </>
  );
}

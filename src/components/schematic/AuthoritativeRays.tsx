/**
 * Authoritative ray overlay: world-coordinate polylines traced by the
 * optikit-core service (/v1/simulate), re-folded through the compile
 * manifest. Distinct from the approximate in-browser 2D preview: colored per
 * path while fresh, greyed out once the document has changed under them.
 */

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { Vec3 } from '../../document';
import { pathColor } from './colors';
import { useServiceStore, useSimFreshness } from './serviceStore';

const NO_RAYCAST = () => null;

const STALE_COLOR = '#5a6470';

/** doc frame (x, y-north, z-up) → three (x, y-up, z-south). */
const toThree = (p: Vec3): [number, number, number] => [p[0], p[2], -p[1]];

export function AuthoritativeRays() {
  const simByPath = useServiceStore(s => s.simByPath);
  const freshness = useSimFreshness();

  const lines = useMemo(() => {
    const out: { key: string; color: string; points: [number, number, number][] }[] = [];
    Object.entries(simByPath).forEach(([name, result], pathIndex) => {
      const color = pathColor(pathIndex);
      result.raysWorld.forEach((polyline, rayIndex) => {
        if (polyline.length < 2) return;
        out.push({
          key: `${name}-${rayIndex}`,
          color,
          points: polyline.map(p => toThree(p as Vec3)),
        });
      });
    });
    return out;
  }, [simByPath]);

  if (freshness === 'none' || lines.length === 0) return null;
  const stale = freshness === 'stale';

  return (
    <>
      {lines.map(l => (
        <Line
          raycast={NO_RAYCAST}
          key={l.key}
          points={l.points}
          color={stale ? STALE_COLOR : l.color}
          lineWidth={stale ? 1 : 1.6}
          transparent
          opacity={stale ? 0.3 : 0.95}
        />
      ))}
    </>
  );
}

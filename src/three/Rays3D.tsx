/**
 * Rays3D - Renders simulation ray paths in the 3D scene.
 *
 * Maps 2D simulation coordinates (SimPoint, mm) to Three.js world space:
 *   sim.x  → Three X
 *   sim.y  → Three Z
 *   height → derived from the source module's layer (optical axis at cube centre)
 *
 * Inter-layer vertical rays are not yet supported (would need physics changes).
 */

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import { getRayColor } from '../utils/sceneBuilder';
import { GRID_MM } from '../constants/grid';

// Optical-axis height for a given layer
function opticalAxisY(layer: number): number {
  return layer * GRID_MM.yLayer + GRID_MM.baseplate + GRID_MM.cube / 2;
}

export function Rays3D() {
  const rays = useSimulationStore(s => s.rays);
  const raysByLayer = useSimulationStore(s => s.raysByLayer);
  const config = useSimulationStore(s => s.config);
  const elements = useSimulationStore(s => s.elements);
  const placedModules = useAppStore(s => s.placedModules);

  // Map sourceId → layer (via placed modules, supports sim- prefix)
  const sourceLayerMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const pm of placedModules) {
      m.set(pm.id, pm.layer);
      m.set(`sim-${pm.id}`, pm.layer);
    }
    return m;
  }, [placedModules]);

  // Source index list (for 'source' color mode)
  const sourceIds = useMemo(() => {
    return elements
      .filter(e => e.type === 'laser' || e.type === 'led')
      .map(e => e.id);
  }, [elements]);

  // Build line data from raysByLayer (preferred) or flat rays (fallback)
  // Mirror lines are added for each segment to show rotational symmetry.
  const lineDefs = useMemo(() => {
    if (!config.enabled || !config.showRays) return [];

    const out: {
      key: string;
      points: [number, number, number][];
      color: string;
      opacity: number;
    }[] = [];

    const pushSegment = (
      key: string,
      seg: { start: { x: number; y: number }; end: { x: number; y: number }; wavelength: number; intensity: number },
      y: number,
      sourceIndex: number,
    ) => {
      const color = getRayColor(seg.wavelength, seg.intensity, sourceIndex, config.rayColorMode);
      const opacity = Math.max(0.35, Math.min(1, seg.intensity * config.rayBrightness));

      // Primary line
      out.push({
        key,
        points: [
          [seg.start.x, y, seg.start.y],
          [seg.end.x, y, seg.end.y],
        ],
        color,
        opacity,
      });

      // Mirror line (negate sim.y → Three Z) for rotational-symmetry visualisation
      if (Math.abs(seg.start.y) > 0.01 || Math.abs(seg.end.y) > 0.01) {
        out.push({
          key: `${key}-m`,
          points: [
            [seg.start.x, y, -seg.start.y],
            [seg.end.x, y, -seg.end.y],
          ],
          color,
          opacity: opacity * 0.45,
        });
      }
    };

    const hasLayerData = Object.keys(raysByLayer).length > 0;

    if (hasLayerData) {
      for (const [layerStr, layerRays] of Object.entries(raysByLayer)) {
        const layer = Number(layerStr);
        const y = opticalAxisY(layer);

        layerRays.forEach((ray, ri) => {
          const sourceIndex = Math.max(0, sourceIds.indexOf(ray.sourceId));
          ray.segments.forEach((seg, si) => {
            pushSegment(`ray-L${layer}-${ri}-${si}`, seg, y, sourceIndex);
          });
        });
      }
    } else {
      rays.forEach((ray, ri) => {
        const layer = sourceLayerMap.get(ray.sourceId) ?? 0;
        const y = opticalAxisY(layer);
        const sourceIndex = Math.max(0, sourceIds.indexOf(ray.sourceId));

        ray.segments.forEach((seg, si) => {
          pushSegment(`ray-${ri}-${si}`, seg, y, sourceIndex);
        });
      });
    }

    return out;
  }, [rays, raysByLayer, config.enabled, config.showRays, config.rayColorMode, config.rayBrightness, sourceLayerMap, sourceIds]);

  if (lineDefs.length === 0) return null;

  // For large segment counts fall back to a single merged BufferGeometry
  if (lineDefs.length > 5000) {
    return <LargeRayBatch lines={lineDefs} />;
  }

  return (
    <group>
      {lineDefs.map(l => (
        <Line
          key={l.key}
          points={l.points}
          color={l.color}
          lineWidth={2}
          transparent
          opacity={l.opacity}
        />
      ))}
    </group>
  );
}

// ─── Fallback for >5 000 segments: single LineSegments with vertex colors ────

function LargeRayBatch({ lines }: {
  lines: { points: [number, number, number][]; color: string; opacity: number }[];
}) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(lines.length * 6); // 2 verts × 3 components
    const colors = new Float32Array(lines.length * 6);    // 2 verts × 3 (rgb)
    const tmpColor = new THREE.Color();

    for (let i = 0; i < lines.length; i++) {
      const { points, color } = lines[i];
      const off = i * 6;

      positions[off]     = points[0][0];
      positions[off + 1] = points[0][1];
      positions[off + 2] = points[0][2];
      positions[off + 3] = points[1][0];
      positions[off + 4] = points[1][1];
      positions[off + 5] = points[1][2];

      tmpColor.setStyle(color);
      colors[off]     = tmpColor.r;
      colors[off + 1] = tmpColor.g;
      colors[off + 2] = tmpColor.b;
      colors[off + 3] = tmpColor.r;
      colors[off + 4] = tmpColor.g;
      colors[off + 5] = tmpColor.b;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [lines]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.8} />
    </lineSegments>
  );
}

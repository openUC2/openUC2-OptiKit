/**
 * RayBeam3D - Renders ray segments as rotationally symmetric 3D beams.
 *
 * Each ray segment is drawn as a CylinderGeometry oriented along the segment
 * direction with translucent MeshPhysicalMaterial. Beam radius can be
 * modulated by the segment's intensity (cone effect).
 *
 * Includes mirror lines: each beam is duplicated below the optical axis for
 * rotational-symmetry visualisation.
 *
 * Performance cap: at most MAX_BEAM_SEGMENTS meshes are rendered.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import { getRayColor } from '../utils/sceneBuilder';
import { GRID_MM } from '../constants/grid';

const MAX_BEAM_SEGMENTS = 200;
const BASE_RADIUS = 1.5; // mm – base beam radius

// Optical-axis height for a given layer
function opticalAxisY(layer: number): number {
  return layer * GRID_MM.yLayer + GRID_MM.baseplate + GRID_MM.cube / 2;
}

interface BeamDef {
  key: string;
  position: [number, number, number];
  rotation: THREE.Euler;
  length: number;
  radiusTop: number;
  radiusBottom: number;
  color: string;
  opacity: number;
}

export function RayBeam3D() {
  const rays = useSimulationStore(s => s.rays);
  const raysByLayer = useSimulationStore(s => s.raysByLayer);
  const config = useSimulationStore(s => s.config);
  const elements = useSimulationStore(s => s.elements);
  const placedModules = useAppStore(s => s.placedModules);

  const sourceLayerMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const pm of placedModules) {
      m.set(pm.id, pm.layer);
      m.set(`sim-${pm.id}`, pm.layer);
    }
    return m;
  }, [placedModules]);

  const sourceIds = useMemo(() => {
    return elements
      .filter(e => e.type === 'laser' || e.type === 'led')
      .map(e => e.id);
  }, [elements]);

  const beams = useMemo(() => {
    if (!config.enabled || !config.showRays) return [];

    const out: BeamDef[] = [];
    let count = 0;

    const addSegment = (
      seg: { start: { x: number; y: number }; end: { x: number; y: number }; wavelength: number; intensity: number },
      y: number,
      sourceIndex: number,
      keyPrefix: string,
      mirror: boolean,
    ) => {
      if (count >= MAX_BEAM_SEGMENTS) return;

      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dz * dz);
      if (length < 0.01) return;

      const color = getRayColor(seg.wavelength, seg.intensity, sourceIndex, config.rayColorMode);
      const opacity = Math.max(0.15, Math.min(0.6, seg.intensity * config.rayBrightness * 0.5));

      const midX = (seg.start.x + seg.end.x) / 2;
      const midZ = (seg.start.y + seg.end.y) / 2;

      // CylinderGeometry is Y-up; we rotate to align along XZ
      const angle = Math.atan2(dz, dx);
      const fullRotation = new THREE.Euler(0, -angle, Math.PI / 2, 'YXZ');

      const r = BASE_RADIUS * Math.max(0.3, seg.intensity);

      // For mirror: reflect around optical axis center
      const actualY = mirror
        ? 2 * (GRID_MM.baseplate + GRID_MM.cube / 2) - y
        : y;

      out.push({
        key: `${keyPrefix}${mirror ? '-m' : ''}`,
        position: [midX, actualY, midZ],
        rotation: fullRotation,
        length,
        radiusTop: r * 0.8,
        radiusBottom: r,
        color,
        opacity: mirror ? opacity * 0.4 : opacity,
      });
      count++;
    };

    const hasLayerData = Object.keys(raysByLayer).length > 0;

    if (hasLayerData) {
      for (const [layerStr, layerRays] of Object.entries(raysByLayer)) {
        const layer = Number(layerStr);
        const y = opticalAxisY(layer);

        for (let ri = 0; ri < layerRays.length && count < MAX_BEAM_SEGMENTS; ri++) {
          const ray = layerRays[ri];
          const sourceIndex = Math.max(0, sourceIds.indexOf(ray.sourceId));
          for (let si = 0; si < ray.segments.length && count < MAX_BEAM_SEGMENTS; si++) {
            const seg = ray.segments[si];
            addSegment(seg, y, sourceIndex, `beam-L${layer}-${ri}-${si}`, false);
            addSegment(seg, y, sourceIndex, `beam-L${layer}-${ri}-${si}`, true);
          }
        }
      }
    } else {
      for (let ri = 0; ri < rays.length && count < MAX_BEAM_SEGMENTS; ri++) {
        const ray = rays[ri];
        const layer = sourceLayerMap.get(ray.sourceId) ?? 0;
        const y = opticalAxisY(layer);
        const sourceIndex = Math.max(0, sourceIds.indexOf(ray.sourceId));

        for (let si = 0; si < ray.segments.length && count < MAX_BEAM_SEGMENTS; si++) {
          const seg = ray.segments[si];
          addSegment(seg, y, sourceIndex, `beam-${ri}-${si}`, false);
          addSegment(seg, y, sourceIndex, `beam-${ri}-${si}`, true);
        }
      }
    }

    return out;
  }, [rays, raysByLayer, config.enabled, config.showRays, config.rayColorMode, config.rayBrightness, sourceLayerMap, sourceIds]);

  if (beams.length === 0) return null;

  return (
    <group>
      {beams.map(b => (
        <mesh key={b.key} position={b.position} rotation={b.rotation}>
          <cylinderGeometry args={[b.radiusTop, b.radiusBottom, b.length, 8, 1]} />
          <meshPhysicalMaterial
            color={b.color}
            transparent
            opacity={b.opacity}
            roughness={0.3}
            transmission={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

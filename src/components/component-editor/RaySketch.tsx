/**
 * Approximate 2D single-element ray sketch.
 *
 * Reuses the schematic's 2D simulation stack (SimulationEngine over the
 * ray-optics adapter) with a synthetic collimated beam aimed at the drafted
 * element. Explicitly approximate — the authoritative simulation comes from
 * the optikit-core service (WP-15); this is a sanity sketch while authoring.
 */

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { DocCategory } from '../../document';
import type { OpticalElement, RayPath } from '../../types';
import { runSimulation } from '../../simulation/SimulationEngine';
import {
  NONOPTICAL_CATEGORIES,
  centerThicknessMm,
  maxSemiApertureMm,
  paraxialEflMm,
  surfaceProfiles,
  type RecordCategory,
  type SurfaceDraft,
} from '../../model/componentRecord';

const SIM_CONFIG = {
  enabled: true,
  autoRun: true,
  maxRays: 9,
  maxBounces: 8,
  wavelength: 532,
  showRays: true,
  showDetectorReadings: false,
  showPhysicalIcons: false,
  rayBrightness: 1,
  rayColorMode: 'wavelength' as const,
  gridToSimScale: 50,
};

function draftToElement(
  category: DocCategory,
  surfaces: SurfaceDraft[],
  mirrorAngleDeg: number | null,
): OpticalElement | null {
  const aperture = 2 * maxSemiApertureMm(surfaces);
  const base = {
    id: 'draft-element',
    moduleInstanceId: 'draft',
    position: { x: 0, y: 0 },
    rotation: 0,
  };
  switch (category) {
    case 'lens': {
      const efl = paraxialEflMm(surfaces);
      if (efl === null) return null;
      return { ...base, type: 'lens', params: { focalLength: efl, aperture } };
    }
    case 'mirror':
      return {
        ...base,
        type: 'mirror',
        // WP-126: the engine's `angle` is the PLATE angle from the beam axis
        // (`mirrorDir = rotate({1,0}, rotation - angle)`), and engine +y is
        // SVG-down. The glyph preview beside this sketch draws its canonical
        // exit arm UP (foldDeg toward +y, unsigned — see foldDeg.test.ts),
        // so the sketch must fold up-screen too: θ=45 → +45 (exit (0,−1),
        // up in the SVG), θ=0 → +90 (retro). WP-107's θ−90 matched the
        // schematic's engine default but mirrored the glyph next to it —
        // round 19: "the ray sketch renders a different axis than the glyph".
        params: { aperture, angle: 90 - (mirrorAngleDeg ?? 45), reflectivity: 1 },
      };
    case 'beamsplitter':
      // The splitter's surface param is spelled differently in the engine
      // (rotate((0,1), +angle)); 45 already folds up-screen like the glyph.
      return { ...base, type: 'beamsplitter', params: { aperture, splitRatio: 0.5, angle: 45 } };
    case 'dichroic':
      return {
        ...base,
        type: 'dichroic',
        params: { aperture, cutoffWavelength: 550, transmitAbove: true, angle: 45 },
      };
    case 'filter':
      return { ...base, type: 'filter', params: { aperture, transmission: 0.9 } };
    case 'detector':
      return { ...base, type: 'detector', params: { width: 4, height: aperture } };
    default:
      return null;
  }
}

function useSketchRays(
  category: DocCategory,
  surfaces: SurfaceDraft[],
  mirrorAngleDeg: number | null,
): RayPath[] {
  return useMemo(() => {
    const beamDiameter = Math.min(2 * maxSemiApertureMm(surfaces) * 0.8, 40);
    const source: OpticalElement = {
      id: 'sketch-beam',
      moduleInstanceId: 'sketch-beam',
      type: 'laser',
      position: { x: -60, y: 0 },
      rotation: 0,
      params: { wavelength: 532, rayCount: 7, beamDiameter, power: 100 },
    };
    const elements: OpticalElement[] = [source];
    if (category !== 'source') {
      const element = draftToElement(category, surfaces, mirrorAngleDeg);
      if (element) elements.push(element);
    }
    try {
      return runSimulation(elements, SIM_CONFIG).rays;
    } catch (err) {
      console.warn('ray sketch failed:', err);
      return [];
    }
  }, [category, surfaces, mirrorAngleDeg]);
}

export function RaySketch({
  category,
  surfaces,
  mirrorAngleDeg,
}: {
  category: RecordCategory;
  surfaces: SurfaceDraft[];
  mirrorAngleDeg: number | null;
}) {
  const nonOptical = NONOPTICAL_CATEGORIES.includes(category);
  const opticalCategory = (nonOptical ? 'other' : category) as DocCategory;
  const rays = useSketchRays(opticalCategory, nonOptical ? [] : surfaces, mirrorAngleDeg);
  const efl = paraxialEflMm(surfaces);
  const semi = maxSemiApertureMm(surfaces);
  // Real element cross-section (WP-30): sag arcs per surface, glass filled
  // between surface pairs — the DRAWN lens reshapes with the radii.
  const profiles = useMemo(() => surfaceProfiles(surfaces), [surfaces]);
  const totalThk = centerThicknessMm(surfaces);

  if (nonOptical) {
    return (
      <Typography variant="caption" color="text.secondary">
        no optics — {category} records carry vendor/BOM identity only
      </Typography>
    );
  }

  // World window: beam start to ~2 EFL (or a fixed span), vertically ± aperture.
  const xMax = Math.max(80, totalThk + 40, efl !== null && efl > 0 ? efl * 1.6 : 100);
  const xMin = -70;
  const yHalf = Math.max(semi * 1.4, 20);
  const width = 320;
  const height = 150;
  const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const sy = (y: number) => height / 2 + (y / yHalf) * (height / 2 - 6);
  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ');

  return (
    <Box>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ background: '#10151c', borderRadius: 8, display: 'block' }}
      >
        {/* optical axis */}
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#2a3442" strokeDasharray="4 4" />
        {/* glass volumes between consecutive surfaces */}
        {profiles.map((p, i) =>
          p.glassAfter && profiles[i + 1] ? (
            <path
              key={`glass-${i}`}
              d={`${toPath(p.points)} ${toPath([...profiles[i + 1].points].reverse()).replace(/^M/, 'L')} Z`}
              fill="#3f6f95"
              opacity={0.28}
            />
          ) : null,
        )}
        {/* surface cross-sections (the sag arcs) */}
        {profiles.map((p, i) => (
          <path
            key={`surf-${i}`}
            d={toPath(p.points)}
            fill="none"
            stroke="#7fa3c4"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        ))}
        {/* fallback element plane when no surfaces are drafted */}
        {profiles.length === 0 && (
          <line
            x1={sx(0)} y1={sy(-semi)} x2={sx(0)} y2={sy(semi)}
            stroke="#5b7a99" strokeWidth={2.5} strokeLinecap="round"
          />
        )}
        {rays.map(ray =>
          ray.segments.map((seg, i) => (
            <line
              key={`${ray.id}-${i}`}
              x1={sx(seg.start.x)}
              y1={sy(seg.start.y)}
              x2={sx(seg.end.x)}
              y2={sy(seg.end.y)}
              stroke="#37e8a3"
              strokeWidth={1}
              opacity={Math.max(0.25, seg.intensity)}
            />
          )),
        )}
        {efl !== null && efl > 0 && efl < xMax && (
          <circle cx={sx(efl)} cy={height / 2} r={2.5} fill="#ffcf5c" />
        )}
      </svg>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        approximate — authoritative sim comes from the service
        {efl !== null && ` · paraxial EFL ≈ ${efl.toFixed(2)} mm`}
      </Typography>
    </Box>
  );
}

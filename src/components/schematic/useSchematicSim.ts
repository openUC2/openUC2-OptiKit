/**
 * Live in-plane 2D ray preview for the schematic view.
 *
 * Runs the existing 2D SimulationEngine synchronously over the parts lying in
 * the current working plane, fed from document selectors (never appStore).
 * This is the fast approximate preview; the authoritative 3D trace arrives with
 * the optikit-core service round trip (WP-15).
 *
 * Frame note: 2D sim coordinates are (x, y-south); document is (x, y-north).
 *   sim.x = doc.x     sim.y = −doc.y     sim rotation° = −doc yaw°
 * so a sim segment renders in three.js at (sim.x, planeZ, sim.y).
 */

import { useMemo } from 'react';
import type { DocPart } from '../../document';
import { libraryEntryOf, rotateDocVec, useDocParts } from '../../document';
import { runSimulation } from '../../simulation/SimulationEngine';
import { anchorFrameMm, opticalAxisOf } from './ports';
import { MODULE_SIMULATION_MODELS } from '../../types';
import type {
  OpticalElement,
  OpticalElementParams,
  OpticalElementType,
  RayPath,
  SimulationConfig,
} from '../../types';

/**
 * Synthetic sim models for library-registry parts (WP-34): the palette entry
 * has no MODULE_SIMULATION_MODELS row, so approximate one from the record
 * category (+ EFL where declared). Categories the 2D engine can't model
 * return null and simply don't participate in the in-plane preview.
 */
function libraryElementModel(
  part: DocPart,
): { elementType: OpticalElementType; defaultParams: OpticalElementParams } | null {
  const lib = libraryEntryOf(part.libraryRef);
  if (!lib) return null;
  switch (lib.category) {
    case 'lens':
      return {
        elementType: 'lens',
        defaultParams: { focalLength: lib.eflMm ?? 100, aperture: 25 },
      };
    case 'mirror':
      return {
        elementType: 'mirror',
        defaultParams: { curvature: 0, reflectivity: 0.99, aperture: 25, angle: -45 },
      };
    case 'beamsplitter':
    case 'dichroic':
      return {
        elementType: 'beamsplitter',
        defaultParams: { splitRatio: 0.5, aperture: 25, angle: 45 },
      };
    case 'source':
      return {
        elementType: 'laser',
        defaultParams: { wavelength: 532, power: 5, divergence: 0, beamDiameter: 2, rayCount: 5 },
      };
    case 'detector':
      return { elementType: 'detector', defaultParams: { width: 12, height: 8, aperture: 25 } };
    case 'filter':
      return { elementType: 'filter', defaultParams: { aperture: 25 } };
    default:
      return null;
  }
}

const SIM_CONFIG: SimulationConfig = {
  enabled: true,
  autoRun: true,
  maxRays: 48,
  maxBounces: 16,
  wavelength: 532,
  showRays: true,
  showDetectorReadings: false,
  showPhysicalIcons: false,
  rayBrightness: 1,
  rayColorMode: 'wavelength',
  gridToSimScale: 50,
};

/** Half the layer pitch: a part belongs to the plane its center is nearest to. */
const PLANE_TOLERANCE_MM = 27.5;

export function partToElement(part: DocPart): OpticalElement | null {
  const csvSim = MODULE_SIMULATION_MODELS[part.libraryRef];
  const sim =
    csvSim && csvSim.elementType !== 'compound'
      ? csvSim
      : libraryElementModel(part); // registry/workspace parts (WP-34)
  if (!sim || sim.elementType === 'compound') return null;
  const params: OpticalElementParams = { ...sim.defaultParams };
  if ('parameterMappings' in sim && sim.parameterMappings) {
    for (const [moduleParam, simParam] of Object.entries(sim.parameterMappings)) {
      const v = part.params[moduleParam];
      if (v !== undefined) (params as Record<string, unknown>)[simParam] = v;
    }
  }
  // The element's sim rotation comes from the part's TRUE world beam axis
  // (record ports rotated by the pose), not just its yaw — so a torch whose
  // record emits along a non-+x axis still fans along its beam (WP-29). For
  // out-of-plane beams the in-plane preview keeps the yaw approximation.
  const worldAxis = rotateDocVec(part.worldPose.rotation, opticalAxisOf(part));
  const inPlane = Math.hypot(worldAxis[0], worldAxis[1]) > 0.5;
  const axisSimDeg = inPlane
    ? ((Math.atan2(-worldAxis[1], worldAxis[0]) * 180) / Math.PI + 360) % 360
    : (360 - part.worldPose.yawDeg) % 360;
  // MODULE_SIMULATION_MODELS.rotationOffset corrects the 2D GRID BUILDER's
  // SVG drawings and must NOT apply here: the schematic glyph already faces
  // the record axis (a torch's 270° offset was exactly the "rotated fan"
  // bug). The splitter family is the exception — there the +90° aligns the
  // ENGINE's reflected arm with the catalog convention (reflected → doc −y,
  // same side as the 45° mirror; verified empirically against the engine).
  const engineArmOffset =
    sim.elementType === 'beamsplitter' || sim.elementType === 'dichroic' ? 90 : 0;
  // WP-39: the sim element sits at the part's ANCHOR (the entry/emit port's
  // datum frame, rotated by the pose) — not the part center. A source whose
  // `out` frame is at z=+20 launches its rays 20 mm along the beam axis,
  // matching where the pin already is and what the service traces.
  const anchor = rotateDocVec(part.worldPose.rotation, anchorFrameMm(part));
  return {
    id: `schematic-${part.id}`,
    moduleInstanceId: part.id,
    type: sim.elementType,
    position: {
      x: part.worldPose.positionMm[0] + anchor[0],
      y: -(part.worldPose.positionMm[1] + anchor[1]),
    },
    rotation: axisSimDeg + engineArmOffset,
    params,
  };
}

export interface SchematicSim {
  rays: RayPath[];
  elementCount: number;
}

export function useSchematicSim(planeZMm: number, enabled: boolean): SchematicSim {
  const parts = useDocParts();
  return useMemo(() => {
    if (!enabled) return { rays: [], elementCount: 0 };
    const elements = parts
      .filter(p => Math.abs(p.worldPose.positionMm[2] - planeZMm) <= PLANE_TOLERANCE_MM)
      .map(partToElement)
      .filter((e): e is OpticalElement => e !== null);
    if (elements.length === 0) return { rays: [], elementCount: 0 };
    try {
      const result = runSimulation(elements, SIM_CONFIG);
      return { rays: result.rays, elementCount: elements.length };
    } catch (err) {
      console.warn('schematic ray preview failed:', err);
      return { rays: [], elementCount: elements.length };
    }
  }, [parts, planeZMm, enabled]);
}

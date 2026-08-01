/**
 * The legacy layout format — READ AND WRITE ONLY (WP-96).
 *
 * Before WP-96 the editor's design state WAS `PlacedModule[]`: an integer
 * cell, three 90°-step store-frame euler angles, and a `params.__doc` bag
 * carrying the continuous residuals. That shape is no longer state — but it is
 * still a FILE FORMAT, and files outlive refactors:
 *
 *   - every layout JSON in the Store repo (`uc2_components` + rotation triple)
 *   - `?data=` / `?layout=` share links and the FRAME wizard hand-off
 *   - the ImSwitch config export
 *   - the pre-WP-96 localStorage blob (migrated once, on first load)
 *
 * So this module converts, in both directions, and nothing else in the editor
 * mentions `PlacedModule`. If the old formats are ever retired, deleting this
 * file plus the legacy half of `mapping.ts` is the whole job.
 */

import { v4 as uuidv4 } from 'uuid';
import type { PlacedModule } from '../types';
import {
  DOC_PARAMS_KEY,
  eulerTripleForRot24,
  getDocParams,
  gridPoseOf,
  rot24FromEulerTriple,
} from './mapping';
import type { Rot24 } from './rot24';
import type { DsnPart, Vec3 } from './types';
import { ZERO_OFFSET_DEG } from './types';

/**
 * The legacy format spells the discrete orientation as three 90° steps, so
 * recovering the residual goes through a matrix decomposition — which lands
 * ~1e-15 off zero. Round to a precision the file format never had anyway, so
 * a round trip is exact instead of drifting.
 */
const round6 = (v: number): number => (Math.round(v * 1e6) / 1e6) || 0;

/** A legacy placed module → the canonical DSN part. */
export function partFromPlacedModule(m: PlacedModule): DsnPart {
  // `gridPoseOf` already does the store→document decomposition, including the
  // pre-WP-28 `freeYawDeg` migration and the y-axis sign flip.
  const grid = gridPoseOf(m);
  const docParams = getDocParams(m);
  const params = { ...(m.params ?? {}) };
  delete params[DOC_PARAMS_KEY];
  return {
    id: m.id || uuidv4(),
    ref: m.customText ?? '',
    libraryRef: m.moduleId,
    cell: grid.cell,
    offsetMm: grid.offsetMm,
    rot24: grid.rot24,
    offsetDeg: {
      x: round6(grid.offsetDeg.x),
      y: round6(grid.offsetDeg.y),
      z: round6(grid.offsetDeg.z),
    },
    dofValues: { ...(docParams.dofValues ?? {}) },
    params,
  };
}

/** The canonical DSN part → a legacy placed module (for the old files). */
export function placedModuleFromPart(part: DsnPart): PlacedModule {
  const triple = eulerTripleForRot24(part.rot24);
  const docParams: Record<string, unknown> = {};
  if (part.offsetMm.some(v => v !== 0)) docParams.offsetMm = part.offsetMm;
  if (part.offsetDeg.x || part.offsetDeg.y || part.offsetDeg.z) {
    docParams.offsetDeg = part.offsetDeg;
  }
  if (Object.keys(part.dofValues).length > 0) docParams.dofValues = part.dofValues;
  const params = { ...part.params };
  if (Object.keys(docParams).length > 0) params[DOC_PARAMS_KEY] = docParams;
  return {
    id: part.id,
    moduleId: part.libraryRef,
    // Document cell y is measured north; the store's y grows south.
    position: { x: part.cell[0], y: -part.cell[1] },
    layer: part.cell[2],
    rotation: triple.rotation,
    tiltRotation: triple.tiltRotation,
    topRotation: triple.topRotation,
    ...(Object.keys(params).length > 0 ? { params } : {}),
    ...(part.ref ? { customText: part.ref } : {}),
  };
}

export function partsFromPlacedModules(modules: PlacedModule[]): DsnPart[] {
  return modules.map(partFromPlacedModule);
}

export function placedModulesFromParts(parts: DsnPart[]): PlacedModule[] {
  return parts.map(placedModuleFromPart);
}

/**
 * The rotation triple the layout JSON stores, `[tilt, yaw, top]`, and back.
 * The interchange files write the three store-frame angles verbatim, so both
 * directions go through the same euler decomposition the old store used.
 */
export function rotationTripleOf(rot24: Rot24): [number, number, number] {
  const t = eulerTripleForRot24(rot24);
  return [t.tiltRotation, t.rotation, t.topRotation];
}

export function partFromLayoutEntry(entry: {
  moduleId: string;
  gridPos: [number, number, number];
  rotation?: [number, number, number] | number;
  params?: Record<string, unknown>;
  customText?: string;
  id?: string;
}): DsnPart {
  const [tilt, yaw, top] = Array.isArray(entry.rotation)
    ? entry.rotation
    : [0, entry.rotation ?? 0, 0];
  const raw = (entry.params ?? {}) as Record<string, unknown>;
  const docParams = (raw[DOC_PARAMS_KEY] ?? {}) as {
    offsetMm?: Vec3;
    offsetDeg?: { x: number; y: number; z: number };
    freeYawDeg?: number;
    dofValues?: Record<string, number>;
  };
  const params = { ...raw };
  delete params[DOC_PARAMS_KEY];
  const offsetDeg =
    docParams.offsetDeg ??
    (typeof docParams.freeYawDeg === 'number' && docParams.freeYawDeg !== 0
      ? { x: 0, y: 0, z: -docParams.freeYawDeg }
      : ZERO_OFFSET_DEG);
  return {
    id: entry.id || uuidv4(),
    ref: entry.customText ?? '',
    libraryRef: entry.moduleId,
    // Layout files store the STORE cell (y grows south).
    cell: [entry.gridPos[0], -entry.gridPos[1], entry.gridPos[2]],
    offsetMm: docParams.offsetMm ? ([...docParams.offsetMm] as Vec3) : [0, 0, 0],
    rot24: rot24FromEulerTriple(yaw, tilt, top),
    offsetDeg: { ...offsetDeg },
    dofValues: { ...(docParams.dofValues ?? {}) },
    params,
  };
}

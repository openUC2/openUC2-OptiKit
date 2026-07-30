/** Shared EMB-C test fixtures: the vendored library records, the curated
 * slug→record mapping, and the 18.1 first-success placement row. */

import { parse } from 'yaml';

import type { PlacedModule } from '../../types';
import type { OptikitRecord } from '../designBuilder';

import achromatYml from './fixtures/openuc2.lens.achromat_25mm_f50.component.yml?raw';
import cameraYml from './fixtures/openuc2.detector.camera_cs165.component.yml?raw';
import laserYml from './fixtures/openuc2.source.laser_488.component.yml?raw';
import mirrorYml from './fixtures/openuc2.mirror.flat_45.component.yml?raw';

function record(text: string): OptikitRecord {
  const doc = parse(text) as { id: string; category: string; optics: unknown };
  return { id: doc.id, category: doc.category, optics: doc.optics };
}

export const RECORDS = new Map<string, OptikitRecord>(
  [laserYml, cameraYml, achromatYml, mirrorYml].map(record).map((r) => [r.id, r]),
);

const OPTIKIT_IDS: Record<string, string> = {
  'laser-488nm': 'openuc2.source.laser_488',
  'camera-usb-daheng': 'openuc2.detector.camera_cs165',
  'lens-pos-1x1': 'openuc2.lens.achromat_25mm_f50',
  'mirror-1x1': 'openuc2.mirror.flat_45',
};

/** The curated `optikitMount` values (CSV column), keyed by module slug. */
const OPTIKIT_MOUNTS: Record<string, string> = {
  'mirror-1x1': 'x:90',
};

export const optikitIdFor = (moduleId: string) => OPTIKIT_IDS[moduleId];

/** The object-form ref kernelSim passes: record id plus the cube mount. */
export const optikitRefFor = (moduleId: string) => {
  const id = OPTIKIT_IDS[moduleId];
  if (!id) return undefined;
  const mount = OPTIKIT_MOUNTS[moduleId];
  return mount ? { id, mount } : id;
};

export function placed(
  moduleId: string,
  id: string,
  x: number,
  y: number,
  extra: Partial<PlacedModule> = {},
): PlacedModule {
  return { id, moduleId, position: { x, y }, rotation: 0, layer: 0, ...extra };
}

/** The 18.1 first-success row: laser → lens → camera along grid east. */
export function threeModuleRow(): PlacedModule[] {
  return [
    placed('laser-488nm', 'a1', 0, 0),
    placed('lens-pos-1x1', 'b2', 1, 0),
    placed('camera-usb-daheng', 'c3', 2, 0),
  ];
}

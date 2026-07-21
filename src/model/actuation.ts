/**
 * Runtime actuation (WP-26): a DOF value → a firmware command, and sending it
 * to a UC2-REST device. Mirrors optikit-core's `library/actuate.py` so the
 * live editor and the CLI produce the same command. No device is assumed —
 * the target URL is configurable and empty by default (the command is just
 * shown until you point it at a controller).
 */

import type { LibraryDof } from '../document/libraryPalette';

const DEVICE_URL_KEY = 'optikit-device-url';

export function getDeviceUrl(): string {
  try {
    return localStorage.getItem(DEVICE_URL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setDeviceUrl(url: string): void {
  try {
    if (url) localStorage.setItem(DEVICE_URL_KEY, url);
    else localStorage.removeItem(DEVICE_URL_KEY);
  } catch {
    /* private mode */
  }
}

export interface FirmwareCommand {
  dof: string;
  kind: string;
  value: number;
  unit: string;
  can: { object: number | string; index: number; subindex: number; value: number };
  uc2rest: { task: string; axis: string; target: number; unit: string };
}

function resolveCanObject(v: number | string): { index: number; subindex: number } {
  if (typeof v === 'number') return { index: v, subindex: 0 };
  const text = String(v);
  if (text.includes(':')) {
    const [i, s] = text.split(':', 2);
    return { index: Number.parseInt(i, i.startsWith('0x') ? 16 : 10), subindex: Number.parseInt(s) };
  }
  return { index: Number.parseInt(text, text.startsWith('0x') ? 16 : 10), subindex: 0 };
}

/** Build the firmware command for an actuated DOF at `value` (null when the
 * DOF is not actuatable / not firmware-bound). */
export function firmwareCommand(dof: LibraryDof, value: number): FirmwareCommand | null {
  if (!dof.actuatable || dof.canObject == null) return null;
  const { index, subindex } = resolveCanObject(dof.canObject);
  return {
    dof: dof.name,
    kind: dof.kind,
    value,
    unit: dof.unit,
    can: { object: dof.canObject, index, subindex, value },
    uc2rest: {
      task: dof.kind === 'translation' ? '/motor_act' : '/galvo_act',
      axis: dof.name,
      target: value,
      unit: dof.unit,
    },
  };
}

/** POST the UC2-REST command to the configured device. Throws when no device
 * URL is set (the caller shows the command instead). */
export async function sendActuation(command: FirmwareCommand): Promise<Response> {
  const base = getDeviceUrl().replace(/\/$/, '');
  if (!base) throw new Error('no device URL configured');
  return fetch(`${base}${command.uc2rest.task}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command.uc2rest),
  });
}

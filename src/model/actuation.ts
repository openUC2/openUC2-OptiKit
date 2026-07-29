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

// ── the READ direction (WP-86) ───────────────────────────────────────────────
// Calibration needs the other half of the WP-26 link: where is the axis NOW?
// UC2-REST answers position queries on the same task endpoints with GET, and
// firmwares differ in how they wrap the number — so the parse is deliberately
// forgiving and, when it cannot find a number, says so instead of guessing.

/** The task path that reports an axis position (mirrors the write side). */
export function readTask(dof: LibraryDof): string {
  return dof.kind === 'translation' ? '/motor_get' : '/galvo_get';
}

/**
 * Pull a number out of a UC2-REST position response. Accepts a bare number,
 * `{position: …}` / `{value: …}` / `{target: …}` / `{steps: …}`, and a
 * per-axis mapping (`{a: 1.2, z: 3.4}`) keyed by the DOF or its axis.
 * Returns null when nothing numeric is found — the caller then reports the
 * raw payload rather than inventing a measurement.
 */
export function parseAxisPosition(payload: unknown, dof: LibraryDof): number | null {
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
  if (typeof payload === 'string') {
    const n = Number(payload.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of [dof.name, dof.axis, 'position', 'value', 'target', 'steps', 'pos']) {
    if (!key) continue;
    const hit = record[key];
    if (typeof hit === 'number' && Number.isFinite(hit)) return hit;
    if (hit && typeof hit === 'object') {
      const nested = parseAxisPosition(hit, dof);
      if (nested !== null) return nested;
    }
  }
  // A SINGLE-key object is an unambiguous wrapper (`{motor: {position: …}}`)
  // — worth unwrapping. Anything wider is not: picking a number out of a
  // payload we do not understand would write a guess into the design as if
  // the instrument had measured it.
  const keys = Object.keys(record);
  if (keys.length === 1) {
    const inner = record[keys[0]];
    if (inner && typeof inner === 'object') return parseAxisPosition(inner, dof);
  }
  return null;
}

export interface AxisReading {
  /** `<componentKey>.<dofName>` — the design's dof_values key. */
  key: string;
  partId: string;
  dofName: string;
  unit: string;
  /** The measured position, or null when the device did not report one. */
  value: number | null;
  /** Why a reading is missing (unreachable device, unparsable payload …). */
  error: string | null;
}

/**
 * GET one axis's current position from the configured device. Never throws:
 * a missing device, a failed request or an unparsable payload comes back as
 * `value: null` with the reason, because a calibration run should report
 * which axes it could NOT read rather than abort.
 */
export async function readAxisPosition(
  dof: LibraryDof,
  opts: { key: string; partId: string; signal?: AbortSignal },
): Promise<AxisReading> {
  const base = getDeviceUrl().replace(/\/$/, '');
  const reading: AxisReading = {
    key: opts.key,
    partId: opts.partId,
    dofName: dof.name,
    unit: dof.unit,
    value: null,
    error: null,
  };
  if (!base) {
    reading.error = 'no device URL configured';
    return reading;
  }
  try {
    const url = new URL(`${base}${readTask(dof)}`);
    url.searchParams.set('axis', dof.name);
    const response = await fetch(url.toString(), { signal: opts.signal });
    if (!response.ok) {
      reading.error = `HTTP ${response.status} from ${readTask(dof)}`;
      return reading;
    }
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* a bare number / plain text is fine — parseAxisPosition handles it */
    }
    const value = parseAxisPosition(payload, dof);
    if (value === null) {
      reading.error = `no position in the response: ${text.slice(0, 120)}`;
      return reading;
    }
    reading.value = value;
  } catch (err) {
    reading.error = err instanceof Error ? err.message : String(err);
  }
  return reading;
}

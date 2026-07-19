/**
 * Palette source (WP-43). The parts palette reads ONE database — the record
 * registry — by default. The legacy CSV loader stays behind a flag for one
 * release so old saved setups (which reference CSV module ids) keep opening;
 * set `localStorage['optikit-legacy-csv'] = '1'` to re-enable it.
 */

const LEGACY_CSV_KEY = 'optikit-legacy-csv';

/** True when the legacy CSV palette should still load (default: false). */
export function legacyCsvEnabled(): boolean {
  try {
    return localStorage.getItem(LEGACY_CSV_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLegacyCsvEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(LEGACY_CSV_KEY, '1');
    else localStorage.removeItem(LEGACY_CSV_KEY);
  } catch {
    /* private mode — the default (registry only) stands */
  }
}

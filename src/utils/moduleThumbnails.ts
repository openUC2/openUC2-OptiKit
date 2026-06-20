// Resolves pre-rendered GLB thumbnails (produced by
// scripts/generate-glb-thumbnails.mjs) for the part library and module previews.
//
// The generator writes PNGs to public/thumbnails/<moduleId>/<orientation>.png and
// an index at public/thumbnails/manifest.json: { "<moduleId>": ["iso","front",…] }.
// When no pre-rendered thumbnail exists the UI falls back to the module's SVG.

const THUMB_BASE = `${import.meta.env.BASE_URL}thumbnails`;

/** moduleId → list of available orientation names. */
export type ThumbnailManifest = Record<string, string[]>;

/** Preferred order when picking a default orientation for a tile. */
export const ORIENTATION_ORDER = ['iso', 'front', 'top', 'right', 'left', 'back'] as const;

let manifestPromise: Promise<ThumbnailManifest> | null = null;

/** Fetch (and cache) the thumbnail manifest. Resolves to {} when none exists. */
export function loadThumbnailManifest(): Promise<ThumbnailManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${THUMB_BASE}/manifest.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return manifestPromise;
}

/** Full URL of one module/orientation thumbnail. */
export function thumbnailUrl(moduleId: string, orientation: string): string {
  return `${THUMB_BASE}/${moduleId}/${orientation}.png`;
}

/** Available orientations for a module, ordered by ORIENTATION_ORDER. */
export function orientationsFor(manifest: ThumbnailManifest, moduleId: string): string[] {
  const available = manifest[moduleId];
  if (!available || available.length === 0) return [];
  return [...available].sort(
    (a, b) => ORIENTATION_ORDER.indexOf(a as never) - ORIENTATION_ORDER.indexOf(b as never),
  );
}

/** Best default orientation for a module, or null if it has no thumbnails. */
export function defaultOrientation(manifest: ThumbnailManifest, moduleId: string): string | null {
  return orientationsFor(manifest, moduleId)[0] ?? null;
}

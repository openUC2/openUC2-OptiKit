/**
 * WP-98 — bundle-aware .dsn import: the `library/` half of a zip registers.
 *
 * A community-template zip (and a self-contained SETUP bundle) carries records
 * next to the design:
 *
 *   library/components/<id>/component.yml    the optics
 *   library/templates/<id>/template.yml      the mechanics (+ model.glb/step)
 *   library/modules/<id>/module.yml          the placeable binding
 *   docs/<file>.md                           part/setup documentation
 *   designs/… or ./optikit-design.yml        the design itself
 *
 * Before WP-98 the importer read ONLY the design, so every bundle-local
 * library ref was "unknown" and got substituted by a lookalike module. Now
 * the records register first:
 *
 *   - COMPONENTS land in the browser-local workspace library (persistent —
 *     the same road WP-87's Optiland import takes), so they survive reloads
 *     and can be promoted to the shared library later.
 *   - MODULES (+ their template's GLB, served from a blob URL, + their
 *     `docs:` markdown resolved from the zip) land in the SESSION bundle
 *     registry below. They are gone after a reload — re-import the zip, or
 *     dev-write the records into the registry to keep them.
 *
 * `useLibraryRegistration` merges the bundle registry into the palette with
 * the LOWEST precedence: a bundle can never shadow a curated `openuc2.*` id.
 */

import { create } from 'zustand';
import { parse } from 'yaml';
import type { DsnFiles } from './io';
import { recordFromYaml } from '../componentRecord';
import type { ComponentRecord } from './generated/library-component';
import {
  docCategoryOfRecord,
  recordPortsToSource,
  meshPoseGridOf,
  rectApertureOf,
  type LibraryPaletteEntry,
} from '../../document/libraryPalette';
import { useWorkspaceLibrary } from '../workspaceLibrary';
import { slugOf } from '../librarySearch';

// ── the session bundle registry ──────────────────────────────────────────────

interface BundleState {
  /** Palette entries for the bundle's modules (session-scoped). */
  entries: LibraryPaletteEntry[];
  /** The raw record files (+ meshes) behind them, kept so an exported .dsn
   * zip can carry the SAME bundle onward (`bundleFiles()`). */
  files: DsnFiles;
  register: (entries: LibraryPaletteEntry[], files: DsnFiles) => void;
  clear: () => void;
}

export const useBundleLibrary = create<BundleState>()(set => ({
  entries: [],
  files: {},
  register: (entries, files) =>
    set(s => ({
      entries: [
        ...s.entries.filter(e => !entries.some(n => n.moduleId === e.moduleId)),
        ...entries,
      ],
      files: { ...s.files, ...files },
    })),
  clear: () => set({ entries: [], files: {} }),
}));

/** The record files behind the registered bundle modules — merged into an
 * exported .dsn zip so a re-shared setup stays self-contained. */
export function bundleFiles(): DsnFiles {
  return useBundleLibrary.getState().files;
}

// ── extraction ───────────────────────────────────────────────────────────────

export interface BundleRegistration {
  components: number;
  modules: number;
  warnings: string[];
}

const text = (v: string | Uint8Array): string =>
  typeof v === 'string' ? v : new TextDecoder().decode(v);

/** `library/<kind>/<id>/<file>` matcher, tolerant of any leading directories. */
function recordPaths(
  files: DsnFiles,
  kind: 'components' | 'templates' | 'modules',
  file: RegExp,
): { path: string; dir: string; id: string }[] {
  const out: { path: string; dir: string; id: string }[] = [];
  for (const path of Object.keys(files)) {
    const match = new RegExp(`(^|/)library/${kind}/([^/]+)/([^/]+)$`).exec(path);
    if (match && file.test(match[3])) {
      out.push({ path, dir: path.slice(0, path.lastIndexOf('/')), id: match[2] });
    }
  }
  return out;
}

/** Resolve a repo-relative doc path (may carry ../ segments) in the file map. */
function resolveDoc(files: DsnFiles, fromDir: string, ref: string): string | null {
  const joined = ref.startsWith('/') ? ref.slice(1) : `${fromDir}/${ref}`;
  const segments: string[] = [];
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segments.pop();
    else segments.push(seg);
  }
  const path = segments.join('/');
  const hit =
    files[path] ??
    // Tolerate paths written relative to the repo root while the record sits
    // under library/…: fall back to a suffix match on the file name + parent.
    Object.entries(files).find(([p]) => p === ref || p.endsWith(`/${ref}`))?.[1];
  return hit === undefined ? null : text(hit);
}

interface TemplateInfo {
  record: Record<string, unknown>;
  glbUrl: string | null;
  files: DsnFiles;
}

/**
 * Register every record the bundle carries. Components go to the workspace
 * library; modules become session palette entries with the template's GLB
 * (blob URL) and their resolved docs. Curated/registered ids are skipped —
 * a bundle never shadows the registry.
 */
export function registerBundleLibrary(
  files: DsnFiles,
  opts: { registeredIds?: ReadonlySet<string> } = {},
): BundleRegistration {
  const warnings: string[] = [];
  const registered = opts.registeredIds ?? new Set<string>();

  // Components → workspace library (persistent, promotable).
  const components = new Map<string, ComponentRecord>();
  for (const { path, id } of recordPaths(files, 'components', /^component\.ya?ml$/)) {
    try {
      const record = recordFromYaml(text(files[path]));
      if (!record?.id) throw new Error('record has no id');
      if (String(record.id) !== id) {
        warnings.push(`${path}: record id '${record.id}' ≠ folder '${id}'`);
      }
      components.set(String(record.id), record);
    } catch (err) {
      warnings.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const workspace = useWorkspaceLibrary.getState();
  for (const record of components.values()) workspace.save(record);

  // Templates → mesh + metadata for the module entries.
  const templates = new Map<string, TemplateInfo>();
  for (const { path, dir, id } of recordPaths(files, 'templates', /^template\.ya?ml$/)) {
    try {
      const record = parse(text(files[path])) as Record<string, unknown>;
      const glbName = typeof record.glb === 'string' ? record.glb : 'model.glb';
      const glbBytes = files[`${dir}/${glbName}`];
      let glbUrl: string | null = null;
      if (glbBytes instanceof Uint8Array && typeof URL.createObjectURL === 'function') {
        glbUrl = URL.createObjectURL(
          new Blob([glbBytes as BlobPart], { type: 'model/gltf-binary' }),
        );
      }
      const own: DsnFiles = { [`library/templates/${id}/template.yml`]: text(files[path]) };
      if (glbBytes instanceof Uint8Array) own[`library/templates/${id}/${glbName}`] = glbBytes;
      const stepName = typeof record.step === 'string' ? record.step : 'model.step';
      const stepBytes = files[`${dir}/${stepName}`];
      if (stepBytes instanceof Uint8Array) own[`library/templates/${id}/${stepName}`] = stepBytes;
      templates.set(String(record.id ?? id), { record, glbUrl, files: own });
    } catch (err) {
      warnings.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Modules → session palette entries.
  const entries: LibraryPaletteEntry[] = [];
  const retained: DsnFiles = {};
  const seenModules = new Set<string>();
  const shadowWarned = new Set<string>();
  for (const { path, dir, id } of recordPaths(files, 'modules', /^module\.ya?ml$/)) {
    try {
      const mod = parse(text(files[path])) as Record<string, unknown>;
      const moduleId = String(mod.id ?? id);
      // A zip may carry the same trio twice (repo library + a setup bundle's
      // embedded copy) — first one wins, silently.
      if (seenModules.has(moduleId)) continue;
      seenModules.add(moduleId);
      if (registered.has(moduleId)) {
        if (!shadowWarned.has(moduleId)) {
          shadowWarned.add(moduleId);
          warnings.push(
            `${moduleId}: already in the registry — the bundle's mesh/docs fill any gaps, ` +
              'the registry record stays authoritative',
          );
        }
        // Still register the bundle entry: the palette merge keeps the
        // registry entry and uses this one only to fill its holes
        // (enrichEntry) — a hollow registry module gets its optics back.
      }
      const componentId = String(mod.component ?? '').split('@')[0] || null;
      const templateId = String(mod.template ?? '').split('@')[0] || null;
      const component = componentId ? (components.get(componentId) ?? null) : null;
      const template = templateId ? (templates.get(templateId) ?? null) : null;
      const tplRecord = template?.record ?? {};
      const footprint = (mod.footprint_grid ?? tplRecord.footprint_grid ?? [1, 1, 1]) as [
        number, number, number,
      ];
      // The record's docs, resolved to markdown from the SAME zip.
      const docs: { title: string; text: string }[] = [];
      for (const ref of (Array.isArray(mod.docs) ? mod.docs : []) as string[]) {
        const body = resolveDoc(files, dir, ref);
        if (body !== null) docs.push({ title: ref.split('/').pop() ?? ref, text: body });
        else warnings.push(`${moduleId}: docs entry '${ref}' not found in the bundle`);
      }
      entries.push({
        moduleId,
        componentId,
        name: slugOf(moduleId),
        description: String(mod.description ?? ''),
        category: docCategoryOfRecord(String(component?.category ?? mod.category ?? 'other')),
        templateClass:
          (tplRecord.class as LibraryPaletteEntry['templateClass']) ?? null,
        // WP-103: a bundle module carries a cube_module record, so it IS a
        // cube — a zip that ships a footprint_grid is a placeable cube even
        // before its records reach anyone's registry.
        mount: 'cube' as const,
        templateId,
        states: [],
        dofs: [],
        footprintGrid: footprint,
        thumbnailUrl: null,
        glbUrl: template?.glbUrl ?? null,
        meshFrame: String(tplRecord['mesh-frame'] ?? ''),
        meshPoseGrid: meshPoseGridOf(tplRecord),
        portsFrame:
          tplRecord['insert-pose'] && tplRecord.optical_ports ? 'mounted' : 'record',
        mirrorRectMm: rectApertureOf(
          (component as { optics?: { fragment?: { surfaces?: Record<string, unknown>[] } } } | null)
            ?.optics?.fragment?.surfaces,
        ),
        ports: component ? recordPortsToSource(component) : [],
        eflMm:
          typeof component?.effective_focal_length_mm === 'number'
            ? component.effective_focal_length_mm
            : null,
        wavelengthsUm:
          (component as { source?: { wavelengths_um?: number[] } } | null)?.source
            ?.wavelengths_um ?? [],
        symbolUrl: null,
        programmable: null,
        vendorName:
          (component?.vendor as { name?: string } | undefined)?.name || null,
        priceEur: typeof mod.price === 'number' ? mod.price : null,
        // WP-108: a bundle part is not a draft BY DEFINITION — where it came
        // from is `source`, and whether anything about it is unconfirmed is
        // the record's own review list. Hardcoding true conflated the two.
        review: Array.isArray(mod.review) && mod.review.length > 0,
        reviewNotes: (Array.isArray(mod.review) ? mod.review : []).map(String),
        source: 'bundle',
        unbound: false,
        fragmentSurfaces:
          ((component?.optics as { fragment?: { surfaces?: Record<string, unknown>[] } })
            ?.fragment?.surfaces) ?? [],
        docs: docs.length > 0 ? docs : undefined,
        carrier: Boolean(tplRecord.carrier),
        bays: {},
      });
      retained[`library/modules/${moduleId}/module.yml`] = text(files[path]);
      if (template) Object.assign(retained, template.files);
      if (component && componentId) {
        // Components re-export from the workspace, but keeping the byte-exact
        // YAML alongside costs nothing and preserves comments.
        const compPath = Object.keys(files).find(p =>
          new RegExp(`(^|/)library/components/${componentId}/component\\.ya?ml$`).test(p),
        );
        if (compPath) retained[`library/components/${componentId}/component.yml`] = text(files[compPath]);
      }
    } catch (err) {
      warnings.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (entries.length > 0) useBundleLibrary.getState().register(entries, retained);

  return { components: components.size, modules: entries.length, warnings };
}

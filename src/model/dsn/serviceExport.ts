/**
 * Service export: the document the optikit-core service actually receives.
 *
 * When a `.dsn` was imported, its retained declaration (with the `optics`,
 * `template`, `dof`, `category` blocks and location components the legacy
 * store cannot represent) is the base; the live document overlays it:
 *
 * - mapped parts override their component's pose with the current absolute
 *   grid pose (anchors are dropped — world geometry is identical, and it
 *   keeps a moved part from dragging its old anchor children along);
 * - `instantiation.dof_values` are rebuilt from the parts' DOF values
 *   (unmapped keys from the source are preserved);
 * - deleted parts delete their component (and its dof_values / chains);
 * - parts placed after the import export as bare components, like the plain
 *   snapshot path (the service reports E_NO_OPTICS if they end up in a chain);
 * - paths named in the source are kept verbatim when their placed-part
 *   subsequence matches the live chain (the store drops location components
 *   like `sample` from chains at import — keeping the source path preserves
 *   them); renamed/new/edited paths come from the live document;
 * - accepted-optimization provenance is stamped.
 *
 * Without a retained source this degrades to `snapshotToDesign`.
 */

import { parse } from 'yaml';
import {
  getSnapshot,
  parsePortRef,
  useSourceDesignStore,
} from '../../document';
import type { DocPart, DocSnapshot } from '../../document';
import type { CompSpec, DesignDecl } from './generated/design-decl';
import { poseSpecOf, snapshotToDesign } from './convert';
import { serializeDesign, DESIGN_DECL_FILE } from './io';
import type { DsnFiles } from './io';

export interface ServiceDesign {
  design: DesignDecl;
  /** partId → component key covering retained AND newly exported parts. */
  keyByPartId: Record<string, string>;
}

export function buildServiceDesign(
  snap: DocSnapshot = getSnapshot(),
): ServiceDesign {
  const source = useSourceDesignStore.getState();
  if (!source.yamlText) {
    const { design, keyByPartId } = snapshotToDesign(snap);
    return { design, keyByPartId };
  }

  const design = (parse(source.yamlText) ?? {}) as DesignDecl;
  const components: Record<string, CompSpec | undefined> = design.components ?? {};
  design.components = components as DesignDecl['components'];

  // ── partId → key for every live part (retained mapping + fresh keys) ─────
  const keyByPartId: Record<string, string> = {};
  const used = new Set(Object.keys(components));
  const liveIds = new Set(snap.parts.map(p => p.id));
  for (const [partId, key] of Object.entries(source.keyByPartId)) {
    if (liveIds.has(partId)) {
      keyByPartId[partId] = key;
      used.add(key);
    }
  }
  for (const part of snap.parts) {
    if (keyByPartId[part.id]) continue;
    const base = slug(part.ref) || slug(part.libraryRef) || 'part';
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}-${n}`;
    used.add(key);
    keyByPartId[part.id] = key;
  }

  // ── components: pose overrides, additions, deletions ─────────────────────
  const partByKey = new Map<string, DocPart>(
    snap.parts.map(p => [keyByPartId[p.id], p]),
  );
  for (const part of snap.parts) {
    const key = keyByPartId[part.id];
    const existing = components[key];
    if (existing) {
      existing.pose = poseSpecOf(part);
    } else {
      components[key] = {
        type: 'primitive',
        primitive: { type: 'glb', model: part.libraryRef },
        pose: poseSpecOf(part),
      };
    }
  }
  const deletedKeys = new Set<string>();
  for (const [partId, key] of Object.entries(source.keyByPartId)) {
    if (!liveIds.has(partId) && components[key]) {
      deletedKeys.add(key);
      delete components[key];
    }
  }

  // ── dof_values: live parts win; source-only keys survive ─────────────────
  const dofValues: Record<string, string | number> = {
    ...(design.instantiation?.dof_values ?? {}),
  };
  for (const dotted of Object.keys(dofValues)) {
    const compKey = dotted.slice(0, dotted.lastIndexOf('.'));
    if (deletedKeys.has(compKey) || partByKey.has(compKey)) delete dofValues[dotted];
  }
  for (const part of snap.parts) {
    for (const dof of part.dofs) {
      dofValues[`${keyByPartId[part.id]}.${dof.name}`] = dof.value;
    }
  }
  if (Object.keys(dofValues).length > 0) {
    design.instantiation = { ...(design.instantiation ?? {}), dof_values: dofValues };
  } else if (design.instantiation) {
    delete design.instantiation.dof_values;
  }

  // ── paths ─────────────────────────────────────────────────────────────────
  const sourcePaths = design.paths ?? {};
  const paths: NonNullable<DesignDecl['paths']> = {};
  for (const path of snap.paths) {
    const liveChain = path.chain.map(ref => {
      const { partId, port } = parsePortRef(ref);
      return `${keyByPartId[partId] ?? partId}.${port}`;
    });
    const original = sourcePaths[path.name]?.chain;
    paths[path.name] =
      original && chainSubsequenceMatches(original, liveChain, partByKey)
        ? sourcePaths[path.name]
        : { chain: liveChain };
  }
  design.paths = Object.keys(paths).length > 0 ? paths : undefined;

  if (source.provenance) {
    design.provenance = { ...(design.provenance ?? {}), ...source.provenance };
  }

  return { design, keyByPartId };
}

/**
 * True when the live chain equals the original chain restricted to components
 * that exist as placed parts (the import dropped the rest, e.g. locations).
 */
function chainSubsequenceMatches(
  original: string[],
  live: string[],
  partByKey: Map<string, DocPart>,
): boolean {
  const expected = original.filter(entry => {
    const key = entry.slice(0, entry.lastIndexOf('.')).split('>')[0];
    return partByKey.has(key);
  });
  if (expected.length !== live.length) return false;
  return expected.every((entry, i) => entry === live[i]);
}

/** The `{files}` body every service endpoint takes. */
export function serviceFiles(snap?: DocSnapshot): DsnFiles {
  const { design } = buildServiceDesign(snap);
  return { [DESIGN_DECL_FILE]: serializeDesign(design) };
}

export interface RangedDof {
  /** dotted key, e.g. "objective.dz" */
  key: string;
  componentKey: string;
  name: string;
  range: [number, number];
  unit: string;
  value: number | null;
  /** Store part id when the component maps to a placed part. */
  partId: string | null;
}

/** Every ranged DOF the optimizer can vary, from the merged design. */
export function listRangedDofs(snap?: DocSnapshot): RangedDof[] {
  const { design, keyByPartId } = buildServiceDesign(snap);
  const partIdByKey = Object.fromEntries(
    Object.entries(keyByPartId).map(([id, key]) => [key, id]),
  );
  const dofValues = design.instantiation?.dof_values ?? {};
  const out: RangedDof[] = [];
  for (const [key, comp] of Object.entries(design.components ?? {})) {
    for (const dof of comp?.dof ?? []) {
      const range = dof.range;
      if (!range || range.length !== 2) continue;
      const [lo, hi] = range;
      if (typeof lo !== 'number' || typeof hi !== 'number') continue;
      const dotted = `${key}.${dof.name}`;
      const value = dofValues[dotted];
      out.push({
        key: dotted,
        componentKey: key,
        name: dof.name,
        range: [lo, hi],
        unit: dof.unit ?? 'mm',
        value: typeof value === 'number' ? value : null,
        partId: partIdByKey[key] ?? null,
      });
    }
  }
  return out;
}

export interface TranslationDof {
  /** dotted key, e.g. "objective.dz" */
  key: string;
  name: string;
  axis: 'x' | 'y' | 'z';
  range: [number, number];
  unit: string;
  value: number;
  actuatable: boolean;
}

export interface PartMechanics {
  partId: string;
  componentKey: string;
  /** fixed (T1) | adaptive (T2) | generative (T3) | null = no template bound. */
  templateClass: string | null;
  /** Ranged translation DOFs — the draggable insert axes (T2). */
  translationDofs: TranslationDof[];
}

/**
 * Mechanical bindings per placed part, from the merged design: the template
 * class and the draggable (ranged translation) DOFs with current values.
 */
export function listPartMechanics(snap?: DocSnapshot): PartMechanics[] {
  const { design, keyByPartId } = buildServiceDesign(snap);
  const dofValues = design.instantiation?.dof_values ?? {};
  const out: PartMechanics[] = [];
  for (const [partId, key] of Object.entries(keyByPartId)) {
    const comp = design.components?.[key];
    if (!comp) continue;
    const translationDofs: TranslationDof[] = [];
    for (const dof of comp.dof ?? []) {
      if ((dof.kind ?? 'translation') !== 'translation') continue;
      const axis = dof.axis;
      if (axis !== 'x' && axis !== 'y' && axis !== 'z') continue;
      const range = dof.range;
      if (!range || range.length !== 2) continue;
      const [lo, hi] = range;
      if (typeof lo !== 'number' || typeof hi !== 'number') continue;
      const dotted = `${key}.${dof.name}`;
      const value = dofValues[dotted];
      translationDofs.push({
        key: dotted,
        name: dof.name,
        axis,
        range: [lo, hi],
        unit: dof.unit ?? 'mm',
        value: typeof value === 'number' ? value : 0,
        actuatable: Boolean(dof.actuatable),
      });
    }
    out.push({
      partId,
      componentKey: key,
      templateClass: comp.template?.class ?? null,
      translationDofs,
    });
  }
  return out;
}

/**
 * "Back-annotate to schematic" (WP-17): fold the live DOF values into the
 * RETAINED source design's `instantiation.dof_values` and stamp provenance,
 * so the parked YAML agrees with the document again. Pose/path edits are not
 * touched — those flow through the cubify direction. Comments in the retained
 * YAML do not survive (the browser has no comment-preserving YAML layer;
 * optikit-core's ruamel path does — documented in io.ts).
 *
 * Returns the number of dof values written, or null without a retained source.
 */
export function backAnnotateSource(
  snap: DocSnapshot = getSnapshot(),
  provenance: { optimized_by: string; merit?: Record<string, unknown> } = {
    optimized_by: 'assembly-editor',
  },
): number | null {
  const store = useSourceDesignStore.getState();
  if (!store.yamlText) return null;
  const design = (parse(store.yamlText) ?? {}) as DesignDecl;
  const keyByPartId = { ...store.keyByPartId };

  const dofValues: Record<string, string | number> = {
    ...(design.instantiation?.dof_values ?? {}),
  };
  let written = 0;
  for (const part of snap.parts) {
    const key = keyByPartId[part.id];
    if (!key) continue;
    for (const dof of part.dofs) {
      const dotted = `${key}.${dof.name}`;
      if (dofValues[dotted] !== dof.value) {
        dofValues[dotted] = dof.value;
        written += 1;
      }
    }
  }
  design.instantiation = { ...(design.instantiation ?? {}), dof_values: dofValues };
  design.provenance = {
    ...(design.provenance ?? {}),
    optimized_by: provenance.optimized_by,
    run: new Date().toISOString().slice(0, 19),
    ...(provenance.merit ? { merit: provenance.merit } : {}),
  };
  store.setSource(serializeDesign(design), keyByPartId);
  return written;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

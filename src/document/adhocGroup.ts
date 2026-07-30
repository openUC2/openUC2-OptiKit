/**
 * WP-71: ad-hoc grouping — select a few parts, make them one thing.
 *
 * No library record is involved: this reuses WP-44's INSTANCE mechanism
 * (`params.groupId` + `params.groupRef`), the same tags a placed library
 * group leaves on its members, so everything downstream — rigid dragging,
 * the group chip, unlock-for-member-editing, export/import — works on an
 * ad-hoc cluster exactly as it does on a catalog OPM. The difference is
 * only where the name came from: a `groupRef` of `adhoc:<name>` says "a
 * human drew a box around these", a dotted library id says "this is
 * openuc2.group.focus_lock".
 *
 * `groupRecordYaml` is the bridge back: an ad-hoc cluster that turns out to
 * be worth keeping graduates into a real `cube_group` record — members'
 * cells made relative to the cluster's own origin, envelope from the bbox.
 */

import {
  captureUndo,
  commitUndo,
  getPart,
  groupInstanceOf,
  listParts,
  setPartParam,
} from './OptikitDocument';
import { useGroupEditStore } from './groupStore';
import { libraryEntryOf } from './libraryPalette';
import type { DocPart } from './types';

/** `params.groupRef` prefix that marks an ad-hoc (non-library) group. */
export const ADHOC_PREFIX = 'adhoc:';

let adhocCounter = 0;

/** The display name of a group instance ('' when it has none). */
export function groupNameOf(part: DocPart): string {
  const ref = part.params.groupRef;
  if (typeof ref !== 'string' || !ref) return '';
  return ref.startsWith(ADHOC_PREFIX) ? ref.slice(ADHOC_PREFIX.length) : ref;
}

/** True when this part belongs to an ad-hoc group (not a library OPM). */
export function isAdhocGroup(part: DocPart): boolean {
  const ref = part.params.groupRef;
  return typeof ref === 'string' && ref.startsWith(ADHOC_PREFIX);
}

export interface GroupResult {
  instanceId: string;
  name: string;
  partIds: string[];
}

/**
 * Tag `partIds` with a fresh group-instance id. Parts already in another
 * group leave it first (a part belongs to exactly one instance), and the
 * whole thing is ONE undo step. Returns null for fewer than two parts —
 * a group of one is just a part.
 */
export function groupParts(partIds: string[], name: string): GroupResult | null {
  const parts = partIds.filter(id => getPart(id) !== undefined);
  if (parts.length < 2) return null;
  const instanceId = `adhoc-${Date.now().toString(36)}-${++adhocCounter}`;
  const label = name.trim() || 'group';
  const token = captureUndo();
  for (const id of parts) {
    setPartParam(id, 'groupId', instanceId);
    setPartParam(id, 'groupRef', `${ADHOC_PREFIX}${label}`);
  }
  commitUndo(token);
  return { instanceId, name: label, partIds: parts };
}

/** Rename an existing instance in place (one undo step). */
export function renameGroup(instanceId: string, name: string): number {
  const members = listParts().filter(p => p.params.groupId === instanceId);
  if (members.length === 0) return 0;
  const label = name.trim() || 'group';
  const token = captureUndo();
  for (const part of members) {
    setPartParam(part.id, 'groupRef', `${ADHOC_PREFIX}${label}`);
  }
  commitUndo(token);
  return members.length;
}

/**
 * Drop the group tags from every member of the instances the given parts
 * belong to (Ctrl+Shift+G). Returns the number of parts freed; ONE undo
 * step for the whole operation.
 */
export function ungroupParts(partIds: string[]): number {
  const instances = new Set(
    partIds.map(id => groupInstanceOf(id)).filter((g): g is string => Boolean(g)),
  );
  if (instances.size === 0) return 0;
  const members = listParts().filter(
    p => typeof p.params.groupId === 'string' && instances.has(p.params.groupId),
  );
  const token = captureUndo();
  for (const part of members) {
    setPartParam(part.id, 'groupId', undefined);
    setPartParam(part.id, 'groupRef', undefined);
  }
  commitUndo(token);
  for (const instanceId of instances) useGroupEditStore.getState().lock(instanceId);
  return members.length;
}

/** Every part tagged with `instanceId`. */
export function partsOfGroupInstance(instanceId: string): DocPart[] {
  return listParts().filter(p => p.params.groupId === instanceId);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'group'
  );
}

export interface GroupRecordDraft {
  id: string;
  yaml: string;
  /** Members whose library ref is not a registry module (they cannot be
   * referenced by a record — a bare symbol has no module id). */
  unresolved: string[];
}

/**
 * WP-71 step 4: an ad-hoc cluster → a `cube_group` YAML the library accepts.
 *
 * Member cells are made RELATIVE to the cluster's minimum cell, so the
 * record describes a shape rather than a location, and the envelope is the
 * bounding box of those relative cells. Every member references its module
 * with a caret range on the id — the same spelling the seeded groups use.
 */
export function groupRecordYaml(
  instanceId: string,
  opts: { namespace?: string; name?: string; description?: string } = {},
): GroupRecordDraft | null {
  const members = partsOfGroupInstance(instanceId);
  if (members.length === 0) return null;
  const name = slug(opts.name || groupNameOf(members[0]) || 'group');
  const namespace = opts.namespace?.trim() || 'user';
  const id = `${namespace}.group.${name}`;

  const cells = members.map(m => m.gridPose.cell);
  const min = [0, 1, 2].map(i => Math.min(...cells.map(c => c[i])));
  const max = [0, 1, 2].map(i => Math.max(...cells.map(c => c[i])));
  const envelope = [0, 1, 2].map(i => max[i] - min[i] + 1);

  const unresolved: string[] = [];
  const used = new Set<string>();
  const lines: string[] = [];
  for (const part of members) {
    const entry = libraryEntryOf(part.libraryRef);
    // A bare symbol (WP-60) has no module to reference — a group is an
    // arrangement OF MODULES, so say so rather than emit a dangling ref.
    if (!entry || entry.unbound) unresolved.push(part.ref);
    let key = slug(part.ref);
    for (let n = 2; used.has(key); n++) key = `${slug(part.ref)}_${n}`;
    used.add(key);
    const cell = [0, 1, 2].map(i => part.gridPose.cell[i] - min[i]);
    lines.push(
      `  ${key}: {module: ${part.libraryRef}@^0.1, cell: [${cell.join(', ')}]}`,
    );
  }

  const description =
    opts.description?.trim() ||
    `${groupNameOf(members[0]) || name} — ${members.length} module arrangement ` +
      '(saved from an ad-hoc group)';
  const yaml = [
    `# WP-71: saved from an ad-hoc selection in the schematic. Member cells are`,
    `# relative to the arrangement's own origin; the envelope is their bbox.`,
    'kind: cube_group',
    `id: ${id}`,
    'version: 0.1.0',
    `description: ${JSON.stringify(description)}`,
    'tags: [opm, adhoc]',
    'review:',
    '  - saved from an ad-hoc group — verify the cells and add the interface ports',
    `envelope-grid: [${envelope.join(', ')}]`,
    'members:',
    ...lines,
    '',
  ].join('\n');

  return { id, yaml, unresolved };
}

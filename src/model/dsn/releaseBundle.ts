/**
 * Manufacturing export (WP-18): the "Export release bundle" zip.
 *
 * One archive with everything a build needs and everything a rebuild checks:
 *
 *   optikit-design.yml         the merged document (optics blocks intact)
 *   optikit-lock.yml           sha256 pins of every bundled file + versions
 *   BOM.csv                    printed (PRT/SUB) · purchased (BUY, vendor/MPN)
 *                              · trade parts (TP), aggregated with counts
 *   assembly-notes.md          T2 insert dof targets, T3 generator params
 *   optic.<path>.json          compiled optics from /v1/compile (provenance)
 *   optic.<path>.manifest.json trace manifests
 *   assembly.glb               merged render of the assembly (browser only)
 *
 * `optikit-core rebuild <bundle.zip>` re-verifies the pins and recompiles
 * every path, comparing canonicalized optic structures byte-for-byte.
 *
 * Infinity: bundled optic JSON writes ±Infinity as ±1e999 (same contract as
 * the service wire format) so Python's json.loads round-trips it to ±inf.
 */

import { buildDocBom, docBomCsv, getSnapshot } from '../../document';
import type { DocSnapshot } from '../../document';
import { compileDesign } from '../../api/coreClient';
import type { CompileResponse } from '../../api/coreClient';
import type { DesignDecl } from './generated/design-decl';
import { buildServiceDesign, listPartMechanics, serviceFiles } from './serviceExport';
import { DESIGN_DECL_FILE } from './io';
import type { DsnFiles } from './io';

export const LOCK_FILE = 'optikit-lock.yml';
export const LOCK_SCHEMA = 'optikit-lock/v0';

// ── helpers ──────────────────────────────────────────────────────────────────

/** JSON with ±Infinity as raw ±1e999 literals (the service wire contract). */
export function stringifyFinite(value: unknown, indent = 2): string {
  const text = JSON.stringify(
    value,
    (_key, v) => {
      if (v === Infinity) return '__POS_INF__';
      if (v === -Infinity) return '__NEG_INF__';
      return v;
    },
    indent,
  );
  return text.replace(/"__POS_INF__"/g, '1e999').replace(/"__NEG_INF__"/g, '-1e999');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── BOM ──────────────────────────────────────────────────────────────────────

type BomType = 'BUY' | 'PRT' | 'SUB' | 'TP' | 'OTHER';

const BOM_ORDER: BomType[] = ['BUY', 'SUB', 'PRT', 'TP', 'OTHER'];

function bomTypeOf(model: string): BomType {
  const prefix = model.trim().split(/\s*-\s*/)[0]?.toUpperCase();
  if (prefix === 'BUY' || prefix === 'PRT' || prefix === 'SUB' || prefix === 'TP') return prefix;
  return 'OTHER';
}

interface BomRow {
  type: BomType;
  model: string;
  qty: number;
  vendor: string;
  mpn: string;
  components: string[];
}

export function buildBom(design: DesignDecl): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const [key, comp] of Object.entries(design.components ?? {})) {
    if (!comp || comp.type === 'location') continue;
    const model = comp.primitive?.model || comp.design || '(no model)';
    // Vendor provenance travels as an extra field on the component
    // (schema is extra=allow); populated by WP-19 bindings or by hand.
    const vendor = (comp as { vendor?: { name?: string; mpn?: string } }).vendor;
    const row = rows.get(model) ?? {
      type: bomTypeOf(model),
      model,
      qty: 0,
      vendor: vendor?.name ?? '',
      mpn: vendor?.mpn ?? '',
      components: [],
    };
    row.qty += 1;
    row.components.push(key);
    if (vendor?.name && !row.vendor) row.vendor = vendor.name;
    if (vendor?.mpn && !row.mpn) row.mpn = vendor.mpn;
    rows.set(model, row);
  }
  return [...rows.values()].sort(
    (a, b) => BOM_ORDER.indexOf(a.type) - BOM_ORDER.indexOf(b.type) || a.model.localeCompare(b.model),
  );
}

export function bomCsv(rows: BomRow[]): string {
  const header = 'type,model,qty,vendor,mpn,components';
  const lines = rows.map(r =>
    [r.type, r.model, r.qty, r.vendor, r.mpn, r.components.join(' ')]
      .map(csvField)
      .join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

// ── assembly notes ───────────────────────────────────────────────────────────

export function buildAssemblyNotes(design: DesignDecl, snap: DocSnapshot): string {
  const lines: string[] = [
    `# Assembly notes — ${design.design?.name ?? 'design'}`,
    '',
    `Generated ${new Date().toISOString().slice(0, 19)} by openUC2-OptiKit.`,
    '',
  ];

  const mechanics = listPartMechanics(snap);
  const inserts = mechanics.filter(m => m.translationDofs.length > 0);
  if (inserts.length > 0) {
    lines.push('## Insert settings (T2 — set after assembly)', '');
    for (const mech of inserts) {
      const part = snap.parts.find(p => p.id === mech.partId);
      for (const dof of mech.translationDofs) {
        const value = part?.dofs.find(d => d.name === dof.name)?.value ?? dof.value;
        const sign = value >= 0 ? '+' : '';
        lines.push(
          `- set the **${mech.componentKey}** insert (${dof.name}, range ` +
            `[${dof.range[0]}, ${dof.range[1]}] ${dof.unit}) to **${sign}${value} ${dof.unit}**`,
        );
      }
    }
    lines.push('');
  }

  const generative = Object.entries(design.components ?? {}).filter(
    ([, comp]) => comp?.template?.generator?.script,
  );
  if (generative.length > 0) {
    lines.push('## Generated holders (T3 — print from the artifacts)', '');
    for (const [key, comp] of generative) {
      const generator = comp!.template!.generator!;
      lines.push(
        `- **${key}**: \`${generator.script}\` with parameters ` +
          `\`${JSON.stringify(generator.params ?? {})}\` — regenerate via ` +
          '`optikit-core generate` (artifacts are keyed by the canonical parameter hash)',
      );
    }
    lines.push('');
  }

  const bom = buildBom(design).filter(r => r.type === 'BUY');
  if (bom.length > 0) {
    lines.push('## Purchased optics', '');
    for (const row of bom) {
      const vendorTxt = row.vendor ? ` — ${row.vendor}${row.mpn ? ` ${row.mpn}` : ''}` : '';
      lines.push(`- ${row.qty}× ${row.model}${vendorTxt}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── merged GLB (browser only, failure-tolerant) ─────────────────────────────

async function tryExportGlb(snap: DocSnapshot): Promise<Uint8Array | null> {
  try {
    const [{ GLTFLoader }, { GLTFExporter }, THREE, doc] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/exporters/GLTFExporter.js'),
      import('three'),
      import('../../document'),
    ]);
    const scene = new THREE.Scene();
    const loader = new GLTFLoader();
    for (const part of snap.parts) {
      const { glbUrl } = doc.renderInfoOf(part.libraryRef);
      const [x, y, z] = part.worldPose.positionMm;
      const holder = new THREE.Group();
      holder.name = part.ref;
      holder.position.set(x, z, -y); // doc → three
      holder.quaternion.copy(doc.docQuatToThree(part.worldPose.rotation));
      if (glbUrl) {
        try {
          const gltf = await loader.loadAsync(glbUrl);
          holder.add(gltf.scene);
        } catch {
          holder.add(new THREE.Mesh(new THREE.BoxGeometry(48, 48, 48)));
        }
      } else {
        holder.add(new THREE.Mesh(new THREE.BoxGeometry(48, 48, 48)));
      }
      scene.add(holder);
    }
    const exporter = new GLTFExporter();
    const buffer = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
    return new Uint8Array(buffer);
  } catch {
    return null; // GLB is a convenience render — never block the bundle on it
  }
}

// ── the bundle ───────────────────────────────────────────────────────────────

export interface ReleaseBundle {
  files: DsnFiles;
  designName: string;
}

export async function buildReleaseBundle(
  snap: DocSnapshot = getSnapshot(),
  opts: { compile?: (files: DsnFiles) => Promise<CompileResponse>; glb?: boolean } = {},
): Promise<ReleaseBundle> {
  const compile = opts.compile ?? compileDesign;
  const { design } = buildServiceDesign(snap);
  const designFiles = serviceFiles(snap);
  const designYaml = designFiles[DESIGN_DECL_FILE] as string;

  const files: DsnFiles = { [DESIGN_DECL_FILE]: designYaml };
  const hashes: Record<string, string> = {
    [DESIGN_DECL_FILE]: await sha256Hex(designYaml),
  };

  // Compiled optics + manifests (provenance + the rebuild comparison basis).
  const pathNames = Object.keys(design.paths ?? {});
  if (pathNames.length > 0) {
    const compiled = await compile(designFiles);
    for (const [name, result] of Object.entries(compiled.paths)) {
      const opticFile = `optic.${name}.json`;
      const manifestFile = `optic.${name}.manifest.json`;
      files[opticFile] = stringifyFinite(result.optic) + '\n';
      files[manifestFile] = stringifyFinite(result.manifest) + '\n';
      hashes[opticFile] = await sha256Hex(files[opticFile] as string);
      hashes[manifestFile] = await sha256Hex(files[manifestFile] as string);
    }
  }

  // WP-50: BOM.csv comes from the SAME facade function the live BOM panel
  // renders (one generator, two consumers) — the numbers on screen can never
  // disagree with the manufacturing export. The legacy model-typed rows
  // (BUY/PRT/SUB) survive only inside assembly-notes' "Purchased optics".
  const bom = docBomCsv(buildDocBom(snap.parts));
  files['BOM.csv'] = bom;
  hashes['BOM.csv'] = await sha256Hex(bom);

  const notes = buildAssemblyNotes(design, snap);
  files['assembly-notes.md'] = notes;
  hashes['assembly-notes.md'] = await sha256Hex(notes);

  if (opts.glb !== false) {
    const glb = await tryExportGlb(snap);
    if (glb) files['assembly.glb'] = glb; // binary: hashed by rebuild only if listed
  }

  // The lockfile pins everything above (written last, not self-referential).
  const lockLines = [
    `schema: ${LOCK_SCHEMA}`,
    `design: ${JSON.stringify(design.design?.name ?? 'untitled')}`,
    `generated: "${new Date().toISOString().slice(0, 19)}"`,
    `paths: [${pathNames.map(n => JSON.stringify(n)).join(', ')}]`,
    'sha256:',
    ...Object.entries(hashes).map(([file, hex]) => `  ${JSON.stringify(file)}: ${hex}`),
    '',
  ];
  files[LOCK_FILE] = lockLines.join('\n');

  return { files, designName: design.design?.name || 'optikit-design' };
}

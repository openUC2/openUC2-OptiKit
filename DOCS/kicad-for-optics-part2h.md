# Part 2h · Feedback round 7 (2026-07-23) — miniFRAME template, community, sharing & ordering

Continues `kicad-for-optics-part2g.md` (round 6). This round: the inner-cube
(miniFRAME/OPM) template with the plate generator, the browse-setups revamp
onto `.dsn`, GitHub-sideloaded documentation, the embedded viewer migration,
STEP assembly export, the forkable community template repo, and the
OSHWLab-for-optics gap analysis (sharing + ordering through openUC2).

WP numbering continues at **WP-53**. Two direct questions are answered first.

---

## Answers first

### "Where is the STP stored for a T1 import — near the yaml? remote?"

**Canonical home: next to the yaml.** A bound template is a directory:

```
library/templates/openuc2.tpl.camera_mount_1x1/
  template.yml        # glb: model.glb / step: model.step  (relative names)
  model.step
  model.glb
  thumbnail.png       # optional
```

The service serves these at `/v1/library/assets/templates/<id>/<file>`
(traversal-safe, WP-22); the frontend fetches meshes from exactly that URL.
Workspace drafts live in the browser's IndexedDB until you publish/dev-write —
then they land in the same folder shape.

**The exception you noticed is real:** the 315 WP-43-migrated records are
yaml-only and carry a `glb-url:` pointing at
`raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/…/GLB/…`. That is
a split brain — one library, two asset homes, and the remote one is a moving
branch. WP-58 step 4 normalizes it: vendor the Store GLBs into the record
folders (or a git-LFS mirror), keep `glb-url` only as provenance.

### "What do you need to close the WP-20 gap (PyInventor → STP)?"

The code side is **already written** — what's missing is the run loop on a
machine I don't have. `batch_iam_to_stp_glb.py` drives Inventor over COM
(`win32com` → `Inventor.Application`), exports every `.iam` to STEP, then
cascadio-converts to GLB; `stamp_datums.py` implements the marker-part
contract (work planes don't survive STEP/GLB export, so datums are tiny real
parts whose *occurrence names* carry `PLN_`/`AXIS_`/`PT_` — with `--init-lib`,
`--from-work-features`, `--validate`). I can maintain and extend these
blind, but Inventor is Windows-only + licensed, so I cannot execute them.
To close WP-20 I need, from a machine with Inventor:

1. **Run logs** of both scripts against a real assembly (stdout + any COM
   errors) — Inventor version differences in the STEP translator are the
   usual failure point, and I can only fix what I can see.
2. **One golden pair**: a marker-stamped `.iam` exported to `.stp` + `.glb`,
   committed as a fixture (PyInventor repo or optikit-core
   `tests/fixtures/`). With that I can assert end-to-end that occurrence
   names + transforms survive into GLB and that `glb2template` ingests real
   Inventor output, not just synthetic fixtures. (`MAS-2000-CUSTOM.stp`
   is already in the repo — its source `.iam` with markers would do.)
3. **Three settings confirmations**: Inventor version, STEP protocol
   (AP214 vs AP242) and units in the export options, and whether the
   marker library parts from `--init-lib` insert cleanly in your template
   workflow (the ME copy-before-editing guide from WP-35).

Deliverable back: I pin the golden pair in CI, fix whatever the logs show,
and WP-20 closes.

---

## Work packages

### WP-53 — The miniFRAME inner-cube template: 18 cubes, puzzle pieces, sandwich plates, plate generator

```
PROMPT (repo: optikit-core + openUC2-OptiKit — amends WP-44/45)

The inner cube of the FRAME is a concrete, buildable thing: TWO layers of
3×3 cube assemblies (18 cubes), the layers joined by puzzle pieces, the
stack SANDWICHED by solid aluminium plates top and bottom that clamp the
18 cubes and slide the unit into the FRAME. Plates are sometimes larger
(3×4, 3×5). Encode it, and generate the plates.

1. Group template `openuc2.group.miniframe_2x3x3` (WP-44 group): envelope
   3×3×2, member slots per layer, `structure:` block naming what holds it
   together — `plates: {top: <plate-ref>, bottom: <plate-ref>}` and
   `joints: puzzle` between layers. Validation: every member cell inside
   the envelope; plates must cover the full layer footprint.
2. Plate generator (T3-style, optikit-core `generate plate`): parametric
   N×M aluminium sandwich plate — the UC2 hole pattern per cell (50 mm
   pitch), FRAME slide interface on the long edges, optional central
   aperture per cell (beam pass-through where a member has a vertical
   port). Emits STEP + GLB + a `openuc2.plate.<n>x<m>` template record
   (carrier, WP-45) with keyed artifacts like the WP-21 holder. Sizes
   3×3, 3×4, 3×5 generated as stock records; any N×M on demand.
3. Arrangement assistant: with a group selected, "suggest structure"
   computes the minimal plate size covering the occupied cells + the
   puzzle-piece positions between layers (edge-adjacent cube pairs), adds
   them to the group's structure block, and DRC warns when a cube sits
   outside the plate or a layer joint is missing.
4. FRAME context records (WP-45 carrier follow-up): the FRAME as the xyz
   stage + illumination + electronics host — electronics member records
   for the Raspberry Pi (system computer) and the ESP32 CANopen adapter
   (the WP-42 axis-map speaks to exactly this device), so a full FRAME
   design carries its control chain in the BOM.
5. Store the result: the assembled miniFRAME-DPC design saved as a
   `.dsn` in the community set (WP-54's gallery is the consumer).

Acceptance: `generate plate --nx 3 --ny 4` emits STEP+record that
validates; the miniframe group with 18 members suggests a 3×3 plate pair
+ 12 puzzle joints; removing the top plate raises the DRC finding; the
BOM lists 18 cubes + 2 plates + puzzle pieces + RPi + ESP32-CAN.
```

**For humans:** the inner cube stops being folklore — the 2×3×3 stack, its
puzzle joints and its aluminium sandwich plates become a checkable template,
the plates (any size, 3×3 to 3×5 and beyond) come out of a generator as real
STEP you can machine, and the tool tells you where plates and puzzle pieces
belong before you print or mill anything.

### WP-54 — Browse-setups revamp: the gallery speaks `.dsn`

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

The "Browse Setups" tab still lists legacy layout JSONs indexed by a CSV
in the openUC2-OptiKit-Store repo (SetupBrowser.tsx fetches
setups_analysis.csv + JSON layouts). Convert the corpus and the browser.

1. Batch converter (core CLI `import layout-json`): legacy layout JSON →
   schema-v0 `.dsn` (modules mapped through the WP-43 migrated records,
   unknown parts → review-flagged placeholders; provenance block keeps
   the source URL + conversion date). Convert the whole Store corpus,
   PR the .dsn files back into the Store repo next to the originals.
2. SetupBrowser v2: cards render from the .dsn set (name, thumbnail,
   cube count, beam-path summary from chain inference run at convert
   time and cached in the .dsn meta); "Open in configurator" loads the
   design through the existing .dsn import path. Legacy JSON cards get
   a "legacy" badge and the old grid loader until the corpus is fully
   converted.
3. Share links: the configurator gets a "share" action producing a URL —
   `?design=<url>` for anything hosted (the Store repo, a gist, WP-58
   community repos), and `?d=<lz-string>` for small unsaved designs
   (compressed .dsn JSON in the fragment, no server needed). Opening
   either loads the design read-write as a copy. The share dialog warns
   above the size budget and offers "publish to gallery" (a PR link to
   the Store repo) instead.

Acceptance: ≥5 real Store setups convert and open in the schematic with
correct cube placement; a shared ?d= link round-trips a 6-cube design
into a fresh browser session; the gallery shows converted + legacy cards
side by side, legacy clearly badged.
```

**For humans:** the setups gallery becomes real working files — every
community setup opens directly in the new configurator, and any design you
have on screen turns into a link you can paste in a chat that opens the
exact same arrangement on the other end.

### WP-55 — Sideloaded documentation: markdown + images from GitHub, inside the design

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

1. Schema: the .dsn design meta gets a `docs:` block — a list of
   {repo: <github url>, ref: <branch/tag>, path: <dir or file.md>,
   title}. Records may carry the same block (a module's assembly guide).
2. Frontend docs panel: a "Docs" tab (schematic + assembly) fetches the
   markdown via raw.githubusercontent.com, renders it (existing MUI +
   a small md renderer; mermaid/code fences fine to skip in v1), and
   REWRITES RELATIVE IMAGE PATHS against the repo raw URL so the repo's
   images render in place. Multiple docs → a per-design table of
   contents. Fetch errors show the repo link instead of breaking.
3. Offline/export: "include docs" in the WP-18 release bundle vendors
   the fetched markdown + images into the zip (docs/ folder) so an
   exported design documents itself without network.
4. Wire the existing corpus: the openuc2.group.miniframe_dpc group
   (WP-45/53) points its docs at
   docs.openuc2.com's source repo page for miniFRAME_DPC; one Store
   setup gets a docs block as the reference example.

Acceptance: a design whose docs block points at a GitHub repo renders
the markdown with its images in the Docs tab; the release bundle
contains the vendored copy; a dead repo URL degrades to a link, not a
crash.
```

**For humans:** the assembly instructions, alignment guides and photos that
live in your GitHub repos appear inside the design itself — and get frozen
into the export bundle, so a downloaded setup carries its own manual.

### WP-57 — STEP assembly export: the optics and the beam as CAD parts

```
PROMPT (repo: optikit-core)

Export a design as ONE grouped STEP assembly with named parts —
mechanics, optics, and the ray path as geometry — for CAD downstream
(enclosure design, renders, teaching sections).

1. `optikit-core export step <design>` (and /v1/export/step): build an
   assembly tree with cadquery/OCCT — one named group per placed module
   (its template STEP inserted at the module pose), one per optical
   element (lens solids LATHED FROM THE SURFACE PRESCRIPTION — radii,
   conic, thickness, semi-aperture; mirror discs; sensor planes), and
   one `beam_path` group.
2. Beam geometry: each traced segment (the WP-15 simulate output or the
   chain axis when no trace exists) becomes a thin swept solid
   (configurable radius, default 0.5 mm) so it survives into any CAD;
   `--beam wires` emits edges instead for the puristic case.
3. Grouping contract: STEP assembly node names = part refs
   (`laser-488nm`, `L1`, `beam_path/seg-01`) so downstream CAD trees
   are navigable; document units (mm) + axes (z-up, matching
   src/document/mapping.ts conventions).
4. Frontend: "Export STEP assembly" in the File menu calling the
   service endpoint, with beam solid/wires/off options.

Acceptance: the laser→mirror→camera demo exports; FreeCAD opens it
showing named groups for both cubes, the lens solid with correct
curvature, and the folded beam solid; re-export is byte-stable
(WP-18 reproducibility discipline).
```

**For humans:** one click gives you the whole setup as a real CAD
assembly — cubes, actual lens shapes, and the beam itself as solid
geometry — organized in named groups, ready for enclosure design or a
cutaway teaching render.

### WP-58 — The community template repository: fork, fill, get imported

```
PROMPT (repo: NEW github template `openUC2/optikit-community-template`
        + openUC2-OptiKit + optikit-core — scaffold now, iterate later)

1. Scaffold the template repo (a directory in this workspace first,
   published as a GitHub *template repository*):
     library/components|templates|modules|groups/   # record trios, examples included
     designs/<name>.dsn/                            # example design (folder form)
     docs/<name>.md + docs/img/                     # WP-55-consumable docs
     README.md                                      # what goes where, the record crash course
     CONTRIBUTING.md                                # naming (user.* → PR to openuc2.*), review flags
     .github/workflows/validate.yml                 # pip install optikit-core → `library validate`
                                                    #   + .dsn schema check on every push/PR
   Seed with ONE fully-worked example: a simple lens module (component +
   template + module + STEP/GLB + docs page + a 2-cube design using it).
2. Import-by-URL in the configurator: "Add library from GitHub" takes a
   repo URL, fetches its index (a generated library-index.json committed
   by the CI workflow), and mounts it as an additional palette namespace
   (read-only, badge with the repo name). Registry precedence: builtin
   openuc2.* < mounted community repos < local drafts.
3. Sharing loop: designs in a mounted repo appear in Browse Setups
   (WP-54 gallery accepts external repo sources); the share link format
   already covers them (?design=<raw url>).
4. Asset hygiene (the split-brain fix from the answers section): a
   `library vendor-assets` core command pulls remote `glb-url`s into the
   record folders; run it on the WP-43 migrated records so the ONE
   library has ONE asset home; template-repo CI refuses remote-only
   assets.

Acceptance: forking the template, adding a part, and pushing gets green
CI; pasting the fork URL into the configurator shows its parts in the
palette under the fork's badge and its example design in the gallery;
the migrated openuc2.* records reference only local assets afterwards.
```

**For humans:** anyone can fork one repo, drop in their parts and designs
following the worked example, get automatic validation on every push — and
then paste their repo URL into the configurator to see their own palette
section and share their designs through the same gallery everyone uses.


---

## Suggested order

1. **WP-54** (setups → .dsn + share links — the community substrate everything else links into)
2. **WP-58** (template repo + import-by-URL + asset hygiene — can start immediately; the scaffold is a session on its own)
3. **WP-53** (miniFRAME template + plate generator — the flagship content for the gallery)
4. **WP-56** (embedded viewer v2 — needs WP-54's .dsn corpus)
5. **WP-55** (docs sideload)
6. **WP-50→57** (BOM, then STEP assembly export)
7. **WP-59 Phase A**, then **Phase B** (design pages, then ordering)

Adjustments to Part 2g: WP-45 gains the structure/plates concepts from
WP-53 (they amend, not replace); WP-50's BOM becomes the direct input to
WP-59 Phase B ordering.

E2 asks this round: none new — WP-57 exports THROUGH our compile path;
groups/carriers were already asks #10/#11.

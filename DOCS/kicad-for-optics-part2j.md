# Part 2j · Feedback round 9 (2026-07-26) — the part-first library, layers, cleanup, community loop

Continues `kicad-for-optics-part2i.md`. Status at triage: worked through
**WP-53**; Parts 2h/2i (WP-54…62) remain queued. WP numbering continues at
**WP-63**.

---

## Answers first (things that are answers, not work)

### "Import a STEP, associate function + origin + direction to it — can we do this already?"

**Yes — this is exactly what the bind workbench does today**, and your
philosophy statement matches its design: load the STP (source of truth),
click/place datums that carry the *function* (source/sensor/reflective/front/
back), the *origin* (the datum point in the part frame) and the *direction*
(snapped to an axis within 2°, else kept as a true vector), watch the optical
model drawn at those datums (the ray-sketch verification), and emit records.
Since WP-41 you can even place the primitive with a gizmo against the visible
face of a whole module.

**What's genuinely missing** is the case you describe: a Thorlabs laser whose
housing is specific but which is *not a cube yet*. Today `bindToRecords`
always emits a **cube** module (50 mm envelope, `footprint_grid`). There is no
"this STEP is the part's own housing, no cube involved" binding — that's
WP-67. The derived symbol for such a part (glyph + housing silhouette) rides
along there; the authored-SVG slot from WP-48 already exists for the cases
derivation can't cover.

### "Puzzle pieces are not visible in the layers — where are they organized?"

They are ordinary placed parts. `addGroup` (`src/document/OptikitDocument.ts`)
walks `group.structure.jointCells` and places one `openuc2.cube.puzzle_1x1`
per joint cell, tagged with the group's `params.groupId` — the code comment
says it: the joint *"lives in the 5 mm"* interface zone between layers (the
55 mm layer pitch = 50 mm cube + 5 mm plate/joint zone). So they exist, but
(a) they render as generic mechanics glyphs, and (b) there is no layer
concept to reveal/hide them. Both land in WP-64 (visibility polish) and WP-65
(layers, with an explicit "interface" sublayer).

### "Everything is T1; we want primitives placed freely, holder generated AFTER optimize"

Answered in **Part 2i** (as you noted): the datamodel already supports it and
the engine already tolerates template-less parts. WP-60 (unbound symbols in
the palette), WP-61 (`/v1/generate` + "put it in a cube" at the placed pose),
WP-62 (prescription → boolean solid) are the wiring. Nothing new needed here —
they move up the queue instead (see the order at the end).

### "Assembly 3D and Assembly do the same"

Correct — the "Assembly (3D)" toolbar button (`Toolbar.tsx:601`) is the WP-37
retirement shim for the old View-3D and now just navigates to the same
assembly. Removed in WP-64.

### "Bind is kinda the library — rename it?"

Half right: **Bind is the footprint half of the library editor** (the
component editor's mechanics tab; `/configurator/bind` is already only a
deep-link shim). Proposal (WP-67): one nav entry **"Parts"** replacing both
"Components" and "Bind", with its two tabs renamed **"optics (symbol)"** and
**"mechanics (housing)"** — the word "bind" disappears from the UI. The
palette keeps living in the schematic; "Parts" is where records are authored.

### The simulate 500 — diagnosed

`ValueError: Unknown material type: ideal`. Root cause confirmed in code:
optiland's material registry keys on **class names**
(`BaseMaterial._registry[cls.__name__]` → `IdealMaterial`, `Material`,
`AbbeMaterial`…), but two of our emitters write the invented tag
`{type: "ideal", name: "N-BK7"}`:

- `optikit-core/src/optikit_core/importers/csv_palette.py:122` → it's baked
  into all 315 migrated records
- `openUC2-OptiKit/src/model/dsn/convert.ts:83` (`paletteOpticsOf`'s lens
  fragment)

The zmx importer is unaffected (it round-trips through optiland itself).
Also exposed: `/v1/simulate` lets the `ValueError` escape as a 500 instead of
a typed 422. Both fixed in WP-63, which goes **first**.

---

## Decisions I've assumed (veto anytime)

1. **Rename**: "Components" + "Bind" → one **"Parts"** nav entry (tabs:
   optics / mechanics). Alternative on the table: calling it "Library".
2. **Archive location** (WP-68): records move to `library/archive/**` in the
   same repo — history preserved, loader skips it like `dist/`. Alternative:
   a separate archive repo.
3. **Seed set** (WP-68): exactly your five — lens, mirror, electronic
   z-stage, laser, LED — **plus a camera/detector** (no beam path can
   terminate without one) and the existing hand-authored reference records
   (flat_45, galvo, thorlabs.ac254-050-a) which are the T1/T2/vendor
   exemplars other parts derive from.
4. **Frontend CSV code is deleted** (WP-69); the core `import csv` command
   stays as the documented historical migration tool.

---

## Work packages

### WP-63 — Materials speak optiland: fix the simulate 500 (FIRST)

```
PROMPT (repo: optikit-core + openUC2-OptiKit — bug fix, do first)

1. Core, the safety net: compile_path normalizes every material_post/
   material_pre it emits onto optiland's OWN registry vocabulary before it
   ever reaches Optic.from_dict:
     {type:'ideal', name:<glass>}  → {type:'Material', name:<glass>}   (named glass)
     {type:'ideal', index:<n>}     → {type:'IdealMaterial', index:<n>}
     already-registry-valid dicts  → untouched (zmx imports are correct)
     unknown shape                 → CompileError E_MATERIAL with the
                                     component + surface named, not a 500
   Pin with a test that compiles a WP-43-migrated lens record and hands the
   optic to optiland's Optic.from_dict without raising.
2. Fix the emitters so new data is born valid: csv_palette.py:122 and
   convert.ts:83 (paletteOpticsOf) emit the registry form.
3. Migrate the stock: a one-shot `library migrate-materials` pass rewrites
   the {type: ideal} dicts in the 315 migrated records (mechanical edit,
   review flags untouched), library validate green after.
4. Service hardening: /v1/simulate (and /v1/optimize) wrap Optic.from_dict
   in the engine_422 path — an invalid optic is a typed 422
   (E_OPTIC_INVALID, naming the surface), never an ASGI traceback.

Acceptance: the exact design from the bug report simulates; a hand-broken
material yields 422 E_OPTIC_INVALID with the surface named; full core
suite + a new regression test pass.
```

**For humans:** the "Unknown material type: ideal" crash is a vocabulary
mismatch we invented ourselves — the fix makes the compiler always speak
optiland's dialect, repairs the 315 migrated records, and turns any future
material problem into a readable error instead of a 500.

### WP-64 — Editor fit & finish: resize bug, duplicate tab, part deep-link, interface parts

```
PROMPT (repo: openUC2-OptiKit)

1. Collapse/unfold blank panes: collapsing the left/right drawers leaves
   the canvas area white — the R3F <Canvas> does not re-measure. Drive it
   with a ResizeObserver on the canvas container (drei/fiber `resize`
   options or a manual gl.setSize/camera.updateProjectionMatrix on
   observe), covering schematic, assembly and bind scenes. Verify with the
   drawer toggled both ways at two window sizes.
2. Remove the "Assembly (3D)" toolbar shim (Toolbar.tsx ~601) — "Assembly"
   is the one entry. Keep the /configurator/3d redirect route.
3. "Open in library" from the schematic: the property panel of any placed
   part gets the same ?open=<componentId> deep-link the assembly panel got
   in WP-37 (libraryEntryOf(part.libraryRef).componentId → navigate to the
   parts editor).
4. Interface parts legible: plates and puzzle pieces (mechanics category,
   placed in the 5 mm interface zone by WP-53 groups) get a small distinct
   glyph + label instead of the generic blob, so a placed group reads as
   cubes + plates + joints instead of a cloud of circles (the round-9
   screenshot).

Acceptance: toggling both drawers never leaves dead white area; exactly one
assembly entry in the nav; clicking "open in library" on a placed lens
lands on its record; a placed miniframe group visually distinguishes
plates/joints from optical members.
```

**For humans:** four small dents that make daily use annoying — the white
stripes after collapsing a panel, the duplicated assembly tab, the missing
jump from a placed part to its library record, and the puzzle-piece soup in
the screenshot — hammered out in one pass.

### WP-65 — Layers, KiCad-style: show/hide L-1, L0, L1, L2 …

```
PROMPT (repo: openUC2-OptiKit)

1. Document: a part's layer index is derivable (round(z / 55)); expose
   `layerOf(part)` in src/document. Interface parts (plates/joints in the
   5 mm zone) belong to the interface ABOVE their layer: classify as
   {layer: n, interface: true}.
2. A layer-visibility store (persisted): per-layer {visible, dimmed} +
   "solo active layer" toggle. The set of layers is derived from the parts
   present (min..max), always including the working-plane layer.
3. Schematic + assembly render: hidden layers unmount (no raycast), dimmed
   layers render at low opacity and non-interactive. The working-plane
   stepper (schematic) and a new compact layer chip row (both editors)
   control it — checkbox per layer, interface parts toggle with their
   layer but get their own sub-toggle ("show plates & joints").
4. Placement guard: with hidden layers, dropping/dragging still targets
   the ACTIVE working plane only — you can never accidentally edit a
   hidden layer (KiCad discipline). Deleting respects visibility too.

Acceptance: a two-layer miniframe design: hide L1 → only the lower layer
renders and is editable; solo L1 → plates/joints of L0/L1 interface follow
their sub-toggle; drag-drop lands on the active plane while L1 hidden;
reload keeps the visibility state.
```

**For humans:** exactly the KiCad layers panel, for cubes: flip layers on and
off while you build, dim the ones you only need for reference, and never
fat-finger a part on a floor you can't see.

### WP-66 — Schematic BOM round 2: the module list with grid positions and swap (amends WP-50)

```
PROMPT (repo: openUC2-OptiKit — amends WP-50's BOM)

1. A "Modules" panel in the SCHEMATIC (tab beside the service panel): one
   row per placed part (not aggregated): ref, module (short name), grid
   cell [x,y,z], layer, T-class chip. Click row ↔ select/zoom part
   (cross-probing both ways, WP-17 discipline).
2. Swap from the list: each row gets a module dropdown (grouped like the
   palette, filtered to the same category first, "all modules" expander).
   Choosing swaps `libraryRef` IN PLACE: pose kept, ref kept, paths kept
   where the new record declares matching port names (else the path entry
   is dropped with a warning toast), DOF values re-clamped to the new
   template. One undo step.
3. Aggregated view toggle: the same panel can switch to the WP-50 rollup
   (qty × module × price) — one component, two projections; the release-
   bundle BOM keeps coming from the same generator so numbers never fork.
4. Works against groups: members list their group tag; swapping a group
   member is allowed only when the instance is unlocked (WP-44 rule).

Acceptance: place 3 parts, open Modules, click a row → part selected and
zoomed; swap a mirror_1x1 → flat_45 from the dropdown — pose stays, chain
survives (front/reflected match), DRC re-runs; the aggregate toggle shows
qty 2 for a duplicated module; undo restores the original module.
```

**For humans:** the schematic gets its own parts list — every placed module
with its grid position, click-to-find in both directions, and a dropdown to
swap one module for another without touching its position or rewiring the
beam.

### WP-67 — The part-first library: "Parts" editor, housing without a cube

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

The philosophy, stated in round 9: import a STEP, associate the function +
origin + direction to it; the symbol derives from part + glyph; a cube is
OPTIONAL and may come later (T3). The association flow exists (bind
workbench); this WP removes the "everything becomes a cube" assumption and
the "bind" naming.

1. Schema: `mechanical_template.footprint_grid` becomes OPTIONAL
   (None = "not cube-mounted": a bare housing — a Thorlabs laser body, a
   breadboard-mount part). Validation: a cube_module may only reference a
   template WITH a footprint; a housing-only part is component + template,
   no module. Index: housing templates ship under a `housings` section
   (or `template.footprint: null` on the component entry) so the frontend
   can tell the three states apart: bare symbol / symbol+housing / cube
   module.
2. Parts editor rename: one nav entry "Parts" replaces "Components" and
   "Bind"; tabs "optics (symbol)" / "mechanics (housing)"; /configurator/
   bind and /components keep redirecting. The word "bind" leaves the UI
   (the mechanics tab's save actions say "attach housing" / "package as
   cube module").
3. Mechanics tab, third mode alongside insert-binding and whole-module:
   **housing only** — load the STEP, place datums (function + origin +
   direction, the existing flow), save component + housing template, NO
   cube module. The WP-60 unbound-palette path then places it freely; the
   schematic/assembly render the housing GLB at the part pose (real
   silhouette instead of the ghost).
4. Symbol derivation: an unbound part's palette thumbnail composes glyph +
   housing outline (top-down bbox silhouette from the GLB) so a Thorlabs
   laser looks like a Thorlabs laser, not a generic red box. The WP-48
   authored-SVG slot stays the override.
5. Road to a cube stays open: "package as cube module…" on a housing part
   pre-fills the WP-61 generate flow (the housing STEP becomes part_step
   for the boolean holder).

Acceptance: import a laser housing STEP, mark its emission datum, save —
component + housing template, no module; it appears in the palette with
the composed symbol, places freely, chains and simulates; "package as
cube module" hands it to the T3 flow; `library validate` rejects a
cube_module referencing the housing template.
```

**For humans:** the library stops pretending everything is a cube. A part is
its optics plus (optionally) its own housing; the editor is called "Parts"
and speaks that language; and turning a housed part into a cube becomes a
deliberate later step — generated, not assumed.

### WP-68 — The starter library: archive the 100+, seed six

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

1. `library/archive/**`: load_library skips it (like dist/). Move ALL
   WP-43-migrated record trios there in one commit (git mv — history
   survives). A `library restore <id>` CLI copies a trio back out.
2. The seed set that remains, each reviewed and exemplary (these are what
   users learn from and derive new parts from):
     openuc2.lens.starter_50mm      (biconvex f=50, correct materials)
     openuc2.mirror.flat_45         (exists, hand-authored)
     openuc2.stage.z_motor          (T2 + actuation contract — the WP-42 exemplar)
     openuc2.source.laser_basic     (with source states, WP-47)
     openuc2.source.led_basic
     openuc2.detector.camera_basic
   plus the reference exemplars: openuc2.mirror.galvo_xy (multi-surface +
   firmware), thorlabs.lens.ac254-050-a (vendor import), the carrier/
   plate/puzzle records (groups need them), and the group records.
3. Every seed record passes library validate with ZERO review flags and
   ZERO warnings (incl. the WP-63 material form and WP-40 derived
   directions) — the seed set is the quality bar, not a subset of the mess.
4. Frontend: palette groups collapse accordingly; the Explore/community
   pages and tests that referenced archived ids get updated fixtures;
   the bundled index snapshot is rebuilt.

Acceptance: fresh palette shows ~a dozen entries across the categories;
library validate is finding-free; a design using an archived module still
imports (resolve falls back with a clear "archived — restore?" error
naming the CLI); the community BOM prices still resolve for seed parts.
```

**For humans:** instead of 100+ auto-migrated, review-flagged lookalikes,
the palette opens with a handful of genuinely good parts — one clean example
of each kind, each one a template you can copy from. The rest is archived,
not deleted, and one command brings any of them back.

### WP-69 — Legacy retirement: the grid builder goes

```
PROMPT (repo: openUC2-OptiKit)

Remove, in one reviewed sweep (git rm, no soft-deprecation):
1. The /configurator/grid + / legacy routes' 2D builder: EditorPage,
   Layout(+css), GridCanvas, PropertyPanel(+css), LayerPanel(+css),
   BOMPanel(+css) (superseded by WP-50/66), SimulationPanel, RayOverlay,
   AnnotationCanvas, AnnotationPanel, PhysicalModuleOverlay (move
   ElementShape into PartLibrary if still imported), ModuleCreationWizard
   + ModuleSizeSelector + ModuleDrawingCanvas + ModuleMetadataForm,
   Tutorial (the intro.js grid tour; WP-27 guides replace it).
2. CSV palette leftovers: utils/csvHandler.ts, paletteConfig's legacy
   flag, MODULE_DATABASE_GUIDE.md marked historical. (Core's `import csv`
   stays — it is the documented migration record.)
3. appStore STAYS (it backs the document facade) but loses actions only
   the removed components called (annotations, simulation store wiring,
   drawing-wizard state) — measure with a dead-export sweep, delete what
   nothing imports, and re-run every gate.
4. Routes: /configurator/grid → redirect to /configurator/schematic with
   a one-time "the grid builder retired" notice; Toolbar drops the Grid
   nav + the grid-only menu items (annotate menu etc.).
5. The lint baseline shrinks: the known pre-existing errors live almost
   entirely in these files — after the sweep, `npm run lint` should be
   CLEAN, and CI can finally enforce it.

Acceptance: tsc/vitest/lint all green with lint at ZERO findings; the app
boots with no route to any Konva component; bundle size drops (record the
before/after from vite build); schematic/assembly/parts flows unaffected
(smoke-test each).
```

**For humans:** the old 2D grid builder — and the thousands of lines of
Konva code, CSV plumbing and wizards behind it — leaves the codebase. The
payoff besides clarity: the lint baseline finally reaches zero, so from then
on any new warning is a real one.

### WP-70 — The publish loop: save to GitHub, see it in Explore

```
PROMPT (repo: openUC2-OptiKit + the Store repo — closes the WP-54/58 loop)

1. Store repo becomes the gallery source of truth: designs/ holds .dsn
   folders; a CI workflow regenerates designs/index.json (the WP-54
   gallery shape: id, name, description, category, parts count, url) on
   every push. (One commit to the Store repo, done by Bene — the workflow
   file is authored in this WP.)
2. Explore fetches LIVE: the gallery loads the Store repo's raw
   designs/index.json first, falling back to the bundled snapshot offline
   — a merged design appears in /configurator/explore without an app
   redeploy.
3. "Publish to community" in the editor's File menu: exports the current
   design, opens a prefilled GitHub PR (new-file URL with the .dsn YAML
   content) against the Store repo's designs/ — no auth infrastructure
   needed yet (the user is on GitHub in the browser). The dialog explains
   the flow and links the CONTRIBUTING template. When WP-72's login
   lands, this upgrades to a one-click API PR.
4. The design page (community DesignDetailPage) renders straight from the
   live index too, so Fork & edit works on freshly merged designs.

Acceptance: merge a test .dsn into the Store repo → within one fetch,
Explore lists it and its design page opens and forks into the editor;
offline, the bundled gallery still works; "Publish to community" produces
a correct prefilled PR for the currently open design.
```

**For humans:** the loop closes: design → publish (a guided GitHub PR) →
merged → it shows up in Explore for everyone, with a working design page and
Fork & edit — no redeploy, no manual gallery editing.

### WP-71 — Ad-hoc grouping: select, group, name

```
PROMPT (repo: openUC2-OptiKit — builds on WP-44's instance machinery)

1. Multi-select: shift-click adds/removes parts from a selection set;
   a selection rectangle (drag on empty canvas with shift held) selects
   in-plane parts. The property panel shows a multi-selection summary.
2. "Group selection" (context menu / Edit menu / Ctrl+G): tags the
   selected parts with a fresh group-instance id (the WP-44 params
   mechanism — no library record involved), prompts for a name, stores
   name + optional notes in each part's params.groupRef. From then on the
   instance drags as one rigid unit, exactly like a placed library group;
   ungroup (Ctrl+Shift+G) unwinds it.
3. Properties: the group chip in the panel edits name/notes; the BOM/
   Modules panel (WP-66) shows the group column.
4. Bridge to the library: "save as group record…" computes the members'
   relative cells and pre-fills a cube_group YAML (envelope from the
   bbox), downloadable / dev-writable — an ad-hoc group can graduate into
   a reusable OPM (WP-44/53).

Acceptance: shift-select three parts, Ctrl+G, name it — they drag as one
and the chip shows the name; ungroup restores independence; "save as
group record" emits YAML that library validate accepts.
```

**For humans:** select a few cubes, press Ctrl+G, give it a name — now it
moves as one thing. And when an ad-hoc cluster turns out to be worth
keeping, one click turns it into a real library group.

### WP-72 — Accounts & user-owned storage: the architecture spike

```
PROMPT (design spike → ADR document + thin prototype; repo: openUC2-OptiKit
        DOCS/adr/ — LONG-TERM, decision before code)

Question: users log in (GitHub, or Google) and their designs live in THEIR
OWN repo/storage. Produce DOCS/adr/001-accounts-and-storage.md comparing:

A. GitHub OAuth (PKCE, no backend): SPA-only; token in memory/session.
   + no server, designs as repos (history, forks, PRs for free — matches
     the whole community model)
   - GitHub's OAuth token exchange REQUIRES a client_secret even for PKCE
     → in practice needs a tiny token-exchange proxy (a single serverless
     function); scopes are coarse (classic OAuth: repo = everything)
B. GitHub App (fine-grained, per-repo installation): the right long-term
   answer for "the app writes only to your optikit repo"; needs a small
   backend for JWT signing; installation UX is heavier.
C. Google sign-in (OIDC) + Drive/Firestore storage: reaches non-GitHub
   users, but storage loses git semantics (fork/PR/history) that the
   community loop is built on — position as a LATER additive, not the base.

Things the ADR must cover: where tokens live (memory + silent refresh vs
localStorage — XSS surface), the CORS/proxy needs of the GitHub API from
the SPA, rate limits, the offline story (IndexedDB drafts stay the
default; "sync to my repo" is explicit), repo layout for a user library
(their fork of the WP-58 template), collision with the Store-repo publish
flow (WP-70 upgrades from prefilled-PR to API PR), and what self-hosted
deployments do (env-configured OAuth app).

Prototype (thin): device-flow login from the editor + "save design to
my repo" round trip behind a feature flag, to validate the token proxy
assumption before any UI investment.

Recommendation to land in the ADR: B (GitHub App) as the target, A as the
stepping stone, C deferred.
```

**For humans:** before building login, we write down the trade-offs — GitHub
OAuth vs GitHub App vs Google — with the sharp edges named (token exchange
needs a tiny proxy; fine-grained repo access wants a GitHub App; Google
breaks the git-native community model). One document, one decision, one thin
prototype — then the building happens once, in the right shape.

### WP-73 — The UX overhaul: website vs editor, the design system everywhere (LAST)

```
PROMPT (repo: openUC2-OptiKit — deliberately LAST, after the chain is solid)

The OSHWLab pattern, explicitly: oshwlab.com is a WEBSITE that hands off
to the editor (pro.easyeda.com). Copy that separation:

1. Two surfaces, one repo: the community site (landing/explore/design
   pages — already in the teal design system) becomes the default origin
   experience; the EDITOR is a distinct full-screen app shell reached via
   "Start a schematic" / "Fork & edit" / "Open in editor", with its own
   focused chrome (no community nav inside the editor, a single "back to
   community" affordance).
2. Apply the PPT design system to the editor shell: nav structure from
   screens 04/05 (module library grouped the way an optician thinks;
   instant-quote rail; optical checks panel), the teal tokens replacing
   the WP-24 navy chrome, Space Grotesk/IBM Plex type. The canvas
   surfaces keep their drawing-first neutrality.
3. Information architecture pass with the deck: Schematic and Layout as
   the two primary tabs (03-THE FLOW), Parts and Explore reachable but
   secondary; the sync chip and service results surfaced the way screen
   04 sketches them.
4. This WP consumes the remaining deck decisions: apply whatever A/B/C
   community-model choice was made (slide 11) to the visible copy.

Acceptance: cold visit lands on the community site; entering the editor
is a visible context switch with focused chrome; every editor surface
uses the design tokens; the deck's screens 01-05 are recognizably
implemented; no regression in any editor flow (full smoke pass).
```

**For humans:** the last coat: the public site and the editor become two
clearly different places (like OSHWLab → EasyEDA), and the editor finally
gets the design-deck look — done at the end, on purpose, so polish lands on
a working machine.

---

## Updated order (the whole queue)

| Phase | Packages | Why |
|---|---|---|
| Now (bugs) | **WP-63** materials 500 · **WP-64** fit & finish | Users blocked / daily friction |
| Core capability | **WP-60 → 62** (Part 2i: free primitives + T3) | The round-9 T1 complaint, already specced |
| Editor workflow | **WP-65** layers · **WP-66** BOM+swap · **WP-71** grouping | Daily-driving the schematic |
| Library | **WP-67** Parts editor + housings · **WP-68** starter set | The part-first philosophy |
| Cleanup | **WP-69** legacy retirement | After 66/68 replace the last legacy consumers |
| Community | **WP-70** publish loop · WP-54/58 leftovers · **WP-56** viewer | The share loop |
| Long-term | **WP-72** accounts ADR (anytime, it's a doc) · **WP-73** UX overhaul (LAST, per round 9) | |

Superseded/amended: WP-50 is amended by WP-66 (same generator, new panel);
WP-51's remaining items (composition card, index cache, theme remnants) stay
valid — its generate-button item was already superseded by WP-61.

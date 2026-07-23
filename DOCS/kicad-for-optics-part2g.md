# Part 2g · Feedback round 6 (2026-07-23) — groups & the OPM, carriers, fibers, BOM

Continues `kicad-for-optics-execution.md` (Parts 2b–2f). This round collects
the FRAME/optical-module (OPM) integration, groups, fibers, source states,
authored symbols, SLM/display parts, a live BOM, and a batch of fixes —
plus a verification of the three T1/T2/T3 authoring paths as implemented.

WP numbering continues at **WP-44**. Each package has a Claude Code session
prompt (paste as-is) and a "For humans" summary.

---

## Where the three authoring paths stand (requested verification)

> *"As of now (T1, T2, T3) we have the following paths — can you verify if we
> can do it with the current implementation and what's missing?"*

### Path A — "our ME already has a module in Inventor (incl. lens, mirror, …)
### and we match the optical property with the part" → **T1, works today**

The full chain exists and is verified:

1. Inventor STEP/GLB → `glb2template` ingestion (WP-8) with the naming
   contract; `PLN`/`AXIS`/`PT` datum markers import as frames, and a mirror
   without its `PLN` marker is review-flagged (WP-35).
2. No markers? The bind workbench takes the **whole module STEP** (cube +
   insert + optic + screws, one export): "whole module" toggle + "fit to
   cube", then you *drag the optical primitive* (mirror disc, lens lathe)
   onto the visible surface — the placed pose (position + quaternion) is
   written into the record frames (WP-41).
3. `library verify-t1` proves the record: fragment ↔ insert frame pose,
   `E_MIRROR_NO_REFLECTIVE` when the disc misses the face (WP-35/41).
4. Discrete states (`beamsplitter ↔ mirror ↔ empty`) and per-surface
   firmware actuation (dual-axis galvo) are record facts (WP-35/42).

**Missing:** (a) WP-20 — the Inventor-side datum stamping automation
(PyInventor, Bene's async track) so step 1 needs no manual marker naming;
(b) the 315 auto-migrated `openuc2.*` records still carry review flags;
(c) a T1 module that spans **several cubes** (the OPM case) needs the group
concept — that is WP-44 below.

### Path B — "properties of an optical primitive, mounted in a cube using a
### template insert that is parametric or fully free" → **parametric works,
### "fully free" is the gap**

Parametric (T2) is complete: templates declare DOFs with ranges, `optikit-core
fx` emits `optikit-fx.json` (fx name == dof name == axis-map name), the groove
lattice decomposes dz → pair + δ, `apply_fx_params.py` re-drives Inventor and
re-exports, `pocket_params()` derives the MAS-2000 pocket, and the editors
clamp δ to the declared travel (WP-34/35).

**Missing:** a "fully free" insert — a template that accepts an *arbitrary
6-DOF pose* for the optic and adapts. Today you have two routes:
(a) use **T3** — the generated holder already regenerates its cavity at the
placed pose (`generate --design --component`, WP-35), which IS a fully-free
insert, just 3D-printed rather than Inventor-parametric; or (b) when a real
Inventor insert needs it, extend the fx contract from named scalar DOFs to a
full pose block (6 params) — a small, natural extension of the existing
pipeline. Recommendation: route through T3 now, add pose-fx when the first
concrete Inventor part demands it.

### Path C — "optical properties + mechanical design, held by a generated
### holder" → **works end-to-end in core; UI trigger is thin**

`optikit-core generate` produces the boolean auto-holder (cavity from the
surface stack, two halves, M3 cut-off fastening, keyed artifacts — WP-10/21)
and regenerates at the placed design pose (WP-35). **Missing:** a one-click
"generate holder" button in the editor calling the service — today it is
CLI-only. Folded into WP-51 (fix bundle) below.

---

## Direct answers (questions that are answers, not work)

**"For associated cubes I expected to see cube + insert + part — where?"**
Today the composition is spread out: the assembly right panel shows module id
+ template-bound + cell; the component editor's mechanics tab shows the mesh
and datums; the library browser cards show the trio's assets. There is no
single "composition card". WP-51 adds one: module → `component@ver` +
`template@ver` + STEP/GLB + electronics, each line deep-linking its editor
(the `?open=` route from WP-37 already exists).

**"How can I see T1/T2/T3 modules in the grid viewer?"**
The palette badges (WP-34) render wherever `PartLibrary` mounts — schematic
AND the legacy grid sidebar. A *placed* part shows its T-class chip in the
schematic property panel. The legacy grid canvas itself does not badge placed
parts (and is on the retirement path); the assembly panel gets the chip in
WP-51.

**"Schematic lower bar needs to be light-scheme too"** — fixed in WP-37
(commit `5f02680`): the bottom toolbar now sits on `background.paper` +
`divider`. One hardcoded accent survives (`#00e5ff` on the ray toggle);
WP-51 sweeps the remnants.

**"`library_index()` takes long, cache it?"** — correct: the endpoint calls
`load_library` + `build_index` on every request (deliberate in WP-22 so dev
writes appear instantly). WP-51 adds an mtime-keyed cache — same freshness,
one build per change.

**"Auto-chaining failed: E_NO_TARGET at laser-488nm.out"** — real bug or
real UX gap; needs a live diagnosis. WP-52.

---

## Work packages

### WP-44 — Groups: the optical module (OPM) as a first-class record

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Groups make a NAMED ARRANGEMENT of modules a placeable, versioned library
part — the concept behind openUC2's "optical module" (OPM): a self-contained
optical engine spanning several cubes (see WP-45 for the miniFRAME flagship;
the first group here is the focus-lock autofocus,
https://docs.openuc2.com/usage/pro/frame/addons/focus-lock/).

1. Schema: a new record kind `group` (library/groups/<id>/group.yml):
   - `members`: a list of {module: <id@range>, cell: [x,y,z], rot90/offset}
     — module instances at relative grid poses inside the group's envelope.
   - `envelope_grid: [w,l,h]` (cubes) and `interface.ports`: the group's
     OUTWARD optical ports, each mapping to a member's port
     (`member: <ref>, port: <name>`) — like a hierarchical sheet pin.
   - Validation: members resolve, interface ports point at real member
     ports, member cells stay inside the envelope, no overlaps.
   CONVERGENCE NOTE (E2 ask #10): a group's mechanical payload is exactly
   an Ethan `.dsn` subassembly (nested optikit-design.yml). Emit the
   member arrangement as a .dsn fragment in the compile path so the Go
   side renders groups with zero new schema — file the ask, do not fork.
2. Author the first real group: `openuc2.group.focus_lock` — IR laser
   (~850 nm) + IR dichroic beamsplitter + monochrome focus camera + XY
   adjustment stage, interface ports `to_objective` (out) and the closed
   IR return path internal. Create/reuse the member component records.
3. Frontend: groups appear in the palette (badge "GROUP", envelope
   footprint); placing one places the members as ONE rigid unit (a
   `groupId` on the member DocParts; select any → the group selects,
   double-click enters the group for member-level editing, breadcrumb to
   exit). The schematic shows only the interface ports on the collapsed
   group; chain inference sees the internal path through the mapping.
4. BOM/export: a group explodes into its members (each with its cell) in
   cubify, DRC, and the release bundle — the group is an editing/library
   concept, not a manufacturing one.

Acceptance: place openuc2.group.focus_lock in a design next to an
objective; the collapsed group chains to_objective correctly; entering
the group shows the IR laser → dichroic → camera members; cubify lists
the individual cubes at absolute cells; library validate passes the
group record; the E2 ask documents the .dsn-subassembly convergence.
```

**For humans:** the autofocus, the DPC engine, any multi-cube "optical
module" becomes ONE library part you drop into a design — with its own
outward ports, its own version, its own docs — and you can still open it up
and edit the cubes inside. Under the hood the arrangement is stored the same
way Ethan's Go tool nests designs, so both tools agree on what a group is.

### WP-45 — Carriers: FRAME, miniFRAME bay, baseplates, puzzle pieces

```
PROMPT (repo: optikit-core + openUC2-OptiKit — after WP-44)

Not everything is a cube. Carriers are the mechanics that HOST cubes:
the FRAME (rail system with a 3×3×2 inner-frame bay), classic baseplates,
and puzzle pieces. Model them so a design says WHERE its cubes sit.

1. Schema: template records get `carrier: true` + `bays`: named regions a
   cube array can dock into (`bay: {origin-cell, size: [w,l,h], axis}`).
   The FRAME record declares its miniFRAME bay as 3x3x2 (the ~15x15x20 cm
   inner cube, https://docs.openuc2.com/usage/pro/miniframe/miniFRAME_DPC)
   with the coaxial constraint: the bay's optical axis must align with
   the FRAME objective axis (a frame-to-frame constraint checked by DRC).
2. Author records: `openuc2.carrier.frame` (rail + bay, STEP/GLB assets),
   `openuc2.carrier.baseplate_4x4` / `_8x4` (the classic plates; the
   render-only 5 mm offset in the 3D view becomes THEIR geometry, not a
   magic number), `openuc2.carrier.puzzle_1x1` / corner / edge pieces.
3. Model the flagship OPM: `openuc2.group.miniframe_dpc` (WP-44 group) —
   folding mirror, 100 mm tube lens (CCTV, infinity), camera cube
   (USB3 industrial), RMS objective cube, LED-matrix illumination ring,
   XYZ stage mount, electronics layer as non-optical members. The group's
   envelope is exactly the FRAME bay: dropping the group into the bay
   docks it (cell-snapped), DRC errors when the envelope exceeds the bay
   or the coaxial constraint breaks.
4. Frontend: carriers render under the cubes (baseplate under a grid
   region, FRAME as the outer mesh); placing a baseplate under existing
   cubes adopts them; the BOM (WP-50) counts carriers + puzzle pieces.

Acceptance: place openuc2.carrier.frame, drop openuc2.group.miniframe_dpc
into its bay — it snaps, DRC is green, moving it half out of the bay
raises the bay-overflow finding; a 4x4 baseplate under 3 cubes shows in
the 3D view and in the BOM; library validate passes all carrier records.
```

**For humans:** the FRAME stops being scenery — it's a part that *knows* it
has a 3×3×2 bay for an optical engine, and the DPC miniFRAME engine is a
group that *knows* it fits that bay. Baseplates and puzzle pieces become
real parts too, so the BOM finally counts every piece of plastic you need.

### WP-46 — Fibers: connect one port to another, without geometry

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

1. Document layer: a new connection type `fiber` between two ports
   (partId+port → partId+port) with properties {core_um, NA, length_m,
   type: SM|MM}. Unlike beam paths, a fiber imposes NO geometric
   constraint — the parts can sit anywhere.
2. Schematic: fibers render as a distinct curved spline (catmull-rom
   between the two port anchors, styled unlike beam segments); create by
   drag from port to port in a "fiber" tool mode; select/delete/edit
   properties in the panel.
3. Optics: chain inference treats a fiber as an ideal relay — the beam
   exits the far port with the fiber's NA-derived divergence (MM) or
   diffraction-limited (SM); compile emits it as a named jump in
   optic.json (`fiber` element with the properties, E2 ask if the Go
   side needs a schema slot). E_NO_TARGET traversal follows fibers.
4. Records: fiber-coupled parts declare `port.coupling: fiber` (an FC/PC
   port accepts fibers, a free-space port does not — validation warns on
   a fiber into a free-space port).

Acceptance: laser (fiber port) → fiber spline → collimator (fiber port)
→ free-space → camera chains and simulates; the fiber shows its core/NA
in the panel; deleting the fiber breaks the chain with the existing
E_NO_TARGET messaging; a fiber dragged onto a free-space port warns.
```

**For humans:** you can finally route light the way real setups do — a
fiber from the laser bench to the microscope, drawn as a loose curve that
doesn't care about the grid, with the core/NA numbers the simulation needs.

### WP-47 — Source states & the SLM/display class

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

1. Source states: source components get runtime state in the document —
   `on: bool` + active `wavelength` (from the record's wavelengths_um
   list; multi-line lasers pick a line). The schematic tints the source
   glyph and its rays by wavelength (wavelength→RGB helper), greys them
   when off; the property panel gets the on/off switch + line picker;
   off sources are skipped by auto-chaining. Wire on/off to WP-26
   actuation when the module's axis-map binds an `enable` dof
   (/laser_act task in the UC2-REST view).
2. New optical classes: `slm` and `display` (DMD, LCoS, diffuser).
   Component schema: category + a `programmable` surface type (planar,
   reflective (DMD/LCoS) or transmissive (diffuser/LCD), pixel pitch,
   resolution, fill factor). Trace as a plane mirror / flat window for
   now — the programmable phase is NOT simulated, but the record carries
   the facts and the surface participates in fold geometry and DRC.
   Glyph + palette category; a `openuc2.slm.dmd_45` reference record.
3. Validation: E_ on a programmable surface without pitch/resolution;
   the actuation contract (WP-42) may bind a dof `pattern_index` for
   firmware-switchable patterns.

Acceptance: a 3-line laser record placed twice — one at 488 on, one off:
rays render tinted green-blue only from the active one and chaining
ignores the off source; toggling on sends /laser_act when a device URL
is set; the DMD record folds the beam at 45° like a mirror, validates,
and shows its resolution in the panel.
```

**For humans:** sources get their real behavior — on/off and *which*
wavelength — visible in the colors of the drawing and switchable from the
panel (down to the actual laser over UC2-REST). And DMDs/SLMs/diffusers
get a proper part class instead of masquerading as mirrors.

### WP-48 — Authored SVG symbols (when derivation isn't enough)

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Derived glyphs (category shape + ports + surface profile) stay the
default — they can't drift. But electronics, carriers, and exotic parts
need authored symbols.

1. Schema: component records accept an optional asset `symbol.svg`
   (stored like STEP/GLB assets, served by /v1/library/assets/…, listed
   in the index). Contract documented in DOCS/LIBRARY.md: viewBox
   centered on the part origin, 1 unit = 1 mm, beam axis +x, currentColor
   for themable strokes so light/dark both work.
2. Frontend: the palette thumbnail, schematic scene glyph, and component
   editor preview use symbol.svg when present, derived glyph otherwise;
   pins STILL come from optics.ports (the symbol is looks, ports are
   truth — never let an SVG define connectivity).
3. Component editor: an upload slot on the record form (with the
   fallback-derived glyph shown side by side); validation warns when the
   SVG is missing a viewBox or uses fixed colors.
4. Author symbols for the existing electronics records (ESP32 board,
   LED matrix, motor driver) as the proving set. File E2 ask #11:
   ignore-but-preserve `symbol` assets on the Go side.

Acceptance: the ESP32 record shows its authored symbol in palette +
schematic in both themes; deleting the asset falls back to the derived
glyph; a fixed-color SVG warns in library validate; ports still drive
pins (rotate the part — pins follow ports, not the drawing).
```

**For humans:** parts that have no optical shape — controller boards,
carriers — get real schematic symbols you can draw once and version with
the record, while lenses and mirrors keep their auto-generated, always-
accurate look.

### WP-49 — *(reserved — merged into WP-47.2, the SLM/display class)*

### WP-50 — Live BOM: the components at their locations

```
PROMPT (repo: openUC2-OptiKit)

1. A document-facade BOM (src/document — NOT the legacy appStore
   BOMPanel): group placed parts by library id → {record, count, cells:
   [[x,y,z]…], unit price + total from the record's vendor/pricing,
   T-class, namespace}. Carriers, groups (exploded to members, WP-44/45),
   and non-optical members included.
2. UI: a "BOM" panel/tab reachable from schematic AND assembly (one
   component, two mounts): sortable table (part, qty, cells, price),
   totals row, per-row deep links (?open= to the component editor,
   click-cell → select that part in the scene, the WP-17 cross-probing
   path). Missing-price rows flagged, review-flagged records marked.
3. Export: CSV download from the panel; reconcile with the WP-18 release
   bundle BOM (one generator, two consumers — the bundle imports the
   same facade function so the numbers can never disagree).
4. Retire the legacy BOMPanel from Layout once the new panel covers it.

Acceptance: a design with 2× the same laser + 1 mirror shows laser qty 2
with both cells listed; clicking a cell selects the part in the scene;
CSV matches the panel; the release bundle BOM comes from the same
function (unit test proves identical output).
```

**For humans:** one click shows everything the design needs — which parts,
how many, *where they sit on the grid*, and what they cost — clickable
back into the drawing, downloadable as CSV, and guaranteed to match the
manufacturing export.

### WP-51 — Fix bundle: composition card, T-class chips, index cache, theme remnants, generate button

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

1. Module composition card: the assembly right panel (and schematic
   panel, collapsed) show the selected part's full trio — component@ver +
   template@ver + STEP/GLB assets + electronics/axis-map — each line
   deep-linking its editor (?open= exists since WP-37). "cube + insert +
   part" is visible in ONE place.
2. T-class chips on placed parts: the assembly panel shows the T1/T2/T3
   badge (schematic panel already does); the legacy grid gets nothing
   new (retirement path).
3. library_index cache: keep building from the tree, but key a cached
   index on max(mtime) over library/ (os.scandir walk is cheap); dev
   writes still appear instantly because they touch the tree. Add a
   ?fresh=1 escape hatch. Measure before/after on the 315-record library.
4. Light-scheme remnants: sweep the schematic/assembly/bind chrome for
   remaining hardcoded colors (e.g. the #00e5ff ray-toggle accent, the
   cubify chip's rgba) → theme tokens. Both themes screenshot-checked.
5. T3 generate button: the component editor's mechanics tab gets
   "generate holder" for records with surfaces + no bound mesh — POST a
   new /v1/generate endpoint wrapping optikit-core generate, download/
   attach the artifact pair, show the cavity in the 3D preview.

Acceptance: select a placed T2 part in the assembly → composition card
with 3 working deep links + T2 chip; /v1/library/index p50 drops below
100 ms warm; zero hardcoded canvas-chrome colors grep-able in schematic/
assembly/bind; generate-holder on the AC254-050-A record attaches the
two halves and previews them.
```

**For humans:** the "where is my cube + insert + part?" question gets a
card that shows all three with links; the parts index stops rebuilding on
every request; the last dark-theme leftovers go; and the auto-generated
holder is one button instead of a CLI incantation.

### WP-52 — Auto-chaining round 2: diagnose and fix E_NO_TARGET

```
PROMPT (repo: openUC2-OptiKit + optikit-core — DIAGNOSIS FIRST)

Reported: "auto-chaining failed — E_NO_TARGET at laser-488nm.out: no
branch of this source's ray reaches a detector/sample port (see warnings
for escape points)" on a design that looks correct.

1. Reproduce: build the reported design (laser-488 → … → camera) from
   migrated openuc2.* records. Suspects, in order: (a) migrated WP-43
   records with thin default ports (direction/after-surface wrong so the
   traversal exits the wrong face), (b) a fold record whose derived
   direction disagrees with its glyph (WP-29/40 concordance), (c) the
   traversal not treating `camera`/`sample` port kinds as targets,
   (d) yaw/rot90 mishandling for a rotated part. Write the failing case
   as a core test BEFORE fixing.
2. Fix the root cause in core (chain/infer.py or the record data —
   record fixes go into the library with the review flag cleared for
   the touched field).
3. UX regardless of root cause: E_NO_TARGET's escape points become
   VISIBLE — the schematic draws the escaping ray to its exit point
   (dashed red), the error panel lists each escape with the part+port
   it left from and a one-line hint ("mirror_1x1 reflected +y — no part
   at cell [4,2,0]"). A failing chain should explain itself.

Acceptance: the reported design chains green after the fix (test
pinned); breaking it on purpose (rotate the mirror 90°) shows the
dashed escape ray at the mirror with the hint naming the empty cell.
```

**For humans:** the chain error stops being a riddle — you'll *see* the
ray leave the system, where, and why, and the underlying record or
traversal bug gets found and pinned with a test.

---

## Suggested order

1. **WP-52** (auto-chain fix — a user is blocked today)
2. **WP-51** (fix bundle — small, unblocks daily testing)
3. **WP-44** (groups — the concept everything OPM depends on)
4. **WP-45** (carriers + miniFRAME bay — needs WP-44)
5. **WP-50** (BOM — benefits from groups/carriers landing first)
6. **WP-47** (source states + SLM class)
7. **WP-46** (fibers)
8. **WP-48** (SVG symbols)

E2 asks generated this round: **#10** groups-as-.dsn-subassemblies
(WP-44), **#11** ignore-but-preserve `symbol` assets (WP-48), plus a
possible schema slot for fiber elements (WP-46) — fold into the pending
E2 package for Ethan.

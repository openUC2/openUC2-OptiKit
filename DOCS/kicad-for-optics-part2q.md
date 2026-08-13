# Part 2q — round-23 triage: the sync with Go, the sim loop, and the roadmap

Status of the previous plans: part2o and part2p are fully landed (WP-110..138,
see git log). This file is the CURRENT backlog, ordered by priority. Items
marked ⏳ came out of the August frames audit and are still open; everything
else is new from round 23 (2026-08-07).

Done during the round-23 triage itself, not WPs: datum rows measure in the
PART frame again with the world value read-only alongside (WP-139); the
compiler coerces every corpus spelling of ∞ (`.inf` / `inf` / `1e999`)
instead of crashing; `_optiland_or_501` is gone — optiland is assumed.

Round 24 landed outside the numbered list: the port-less-draft crash fix and
the invalid-hex spam (logged as WP-149 in the commit log), whole-arrangement
delete + the sidebar bin (WP-150 in the commit log), ACT VIII of the core
tour, ARCHITECTURE §4b, and the roadmap merge. **Round 25 (the 13 Aug email)
is triaged in its own section below — WP-158..166.**

---

## P0 · breaks the daily loop

### WP-140 · Sync with Ethan's DSN (openUC2/optikit@21dc193)

The commit is "Recursively process subassemblies (#12)". Real changes are in
`exp/designs/designs-decl.go` + `designs-.go` + `geometry.go`; the 3.4 M added
lines are regenerated examples. The divergences, each with our position:

1. **`type: quaternion` rotations.** `CompPoseRotSpec` gains a first-class
   `quaternion` rotation type (unit-quat validated), and Go's new
   `NewPoseRot(mat)` DOWNGRADES any non-axis-aligned matrix to a bare
   quaternion — the grid membership is lost. Our v0 extension spells the same
   physics as `R = R24 · ΔR(offset-deg)`, which keeps the discrete state the
   whole editor depends on (T-rule, yaw ring, DRC on residuals, the 24
   insert poses). **Proposal to Ethan:** the wire accepts both; writers
   prefer `grid + offset-deg`; readers normalize `quaternion` via the
   existing `decomposeRot24` (lossless — we already have the math both
   repos agree on to 7e-15°). We implement: accept-and-normalize on import,
   never emit. He implements: accept `offset-deg` in his reader (or run the
   same decomposition on load).
2. **Top-level `instantiation:` is GONE from `DesignDecl`** — it moved onto
   the component (`comp.instantiation`, for per-subassembly variants). Our
   `schema/design.py` still carries the top-level `InstSpec` and our exporter
   may write it. Decide: mirror the move (tolerate top-level on read for old
   files, stop writing it).
3. **Recursive subassemblies are now real**: `design`-type components flatten
   recursively into STEP/glTF, with `JoinCompIDs` path-joined ids
   (`sub/comp`) and `Prefixed` model paths. Our schema tolerates `design:`
   components as draft syntax but the service, BOM, DRC, `paths:` netlist and
   the editor all assume FLAT component ids. This is the mechanism WP-147
   (FRAME OPM) wants — groundwork: ids with `/` must survive round-trips.
4. Renames/additions to note in DSN-CONTRACT §1: `Flattened` →
   `TranslFlattened` (+ a new recursive `FSDesign.Flattened`), exported
   `BasisDirs`, grid spacings now a Go const `{50, 50, 55}` (matches
   `UC2_GRID_MM` — good).

Deliverable: a short DISCUSSION.md for Ethan with the table above, then the
accept-and-normalize importer (quaternion → rot24 + offset-deg) behind tests. We should also merge all related discussions and open point that need to be clarfieid and discussed between our optikit implementation and the Go implementation from Ethan. I am quite happy with the current feature set of the non-Go implementation, hence what are the difference and how should Go change (if it's a wise thing) so that we are sharing one contract. 

### WP-141 · Authoritative-ray lifecycle

Round-23 bugs, one cause: the traced overlay and the path list outlive the
design state they were computed from.
- Deleting a beam path un-hid a lens ("after I deleted the from-laser-488
  path the lens becomes visible in the backend") — the stale path kept
  claiming the part.
- Changing a beam path does not refresh "Beam paths" — the sim runs over the
  OLD traversals.
- The overlay can only go stale-grey; it needs an explicit CLEAR.
Fix: authoritative rays carry the design revision they were traced from;
any beam-path edit invalidates (not just greys) them; a clear button in the
service panel; the paths list re-derives on every path edit.

### WP-142 · E_GEOMETRY at camera-basic — diagnose with the user's zip

`transverse offset 37.27 mm exceeds 25.0 mm: from ac254-050-a.front @
(17.427, 12.734, 0) facing (1,0,0) to camera-basic.sensor @ (200, 50, 0)`.
Two candidate causes: a genuinely misaligned design (camera at y=50 vs lens
at y≈13 — the clamp is doing its job) or the unfolded-axis compiler
mis-charging a fold's lateral offset to the next segment. Reproduce with
`Untitled-Setup.dsn.zip`, decide, and either way improve the message: name
the SEGMENT, print the offset in the document frame, and say what to move.

### WP-143 · T1 reaches all 24 orientations; unbound is free

`openuc2.detector.camera_basic` (T1) cannot pitch/roll — but a cube can be
mounted pins-sideways in a stack, so T1's legal set is the full 24 grid
orientations, not 4 yaws. Pitch/roll for T1 become 90°-step buttons that
compose onto `rot24` (NOT `offset-deg` — tiltPart writes residuals, which is
the wrong mechanism for discrete steps and currently disabled anyway).
Unbound parts (no template) place entirely freely — verify nothing still
clamps them. The WP-136 yaw quantization stays.

-------------------------------

## Status (updated 2026-08-09)

**P0 is complete.** WP-140 (quaternion accept-and-normalize + `DOCS/GO-SYNC.md`
+ regenerated wire types), WP-141 (ray lifecycle), WP-142 (E_GEOMETRY message,
diagnosed as a genuinely misaligned design), WP-143 (T1 reaches all 24).

**P1 is complete except the second half of WP-144.** WP-145, WP-146, WP-147
and WP-148 are landed; WP-144's basis transport is landed, its folded-surface
rework is not — see the note under WP-144 below.

## P1 · structure & correctness

### WP-144 · Keep the folds folded (compiler rework)

Today the compiler UNFOLDS the beam path onto one straight z axis: fold
mirrors are emitted non-reflective ("flat fold surface unfolded") and the
transverse basis is re-derived per hop (`_transverse_basis`), which the
August audit measured rolling 90° at every fold — the authoritative overlay
is untrustworthy for folded multi-ray paths. Optiland's sequential mode DOES
support reflective flat surfaces with tilted/decentered coordinate systems.
Rework: emit folds as reflective surfaces with real `cs` rotations, parallel-
transport (u, v) through each fold, drop the unfold warnings. This also
unblocks WP-151 (merit functions in optiland's own formalism) and fixes
audit findings #2/#3 in one move. Big, golden-test risk — its own branch.

**Part 1 landed (2026-08-09):** `_transport_basis` parallel-transports (u, v)
across every fold, so the ray overlay is trustworthy again — the 90° roll the
audit measured is gone, pinned by `tests/test_transverse_transport.py`.
**Part 2 still open:** emitting folds as REFLECTIVE surfaces with real `cs`
rotations instead of unfolding onto a straight axis. That rewrites the
emission loop, the arc-length accumulation and the manifest→world mapping at
once, so it keeps its branch. Feasibility confirmed: optiland 0.6.0's
`CoordinateSystem` takes `rx/ry/rz` and `reference_cs`.

### WP-145 · One laser diameter

**Landed.** `CompSpec.source` is typed, the index ships `beam_diameter_mm`, and the compiler's entrance pupil reads it (an explicit `simulation.aperture` still wins).

The frontend beam render and the optiland trace disagree on the source
diameter (schematic ~2 mm glow vs entrance pupil 10.000 mm). The record's
`beam_diameter_mm` must reach the simulation aperture AND the canvas from
the same field.

### WP-146 · cubify synthesizes plates & joints

**Landed** as `addStructureJoints` ("add joints" beside cubify) — one 5 mm piece per occupied cell, above every cube and under the bottom layer, idempotent. The puzzle GLB was never broken: it parses to 1044 meshes and serves 200. What was wrong is that five openuc2 exports are y-up and declared nothing; they now say `mesh-frame: record`, and "mesh failed" carries its reason.

Answer to "I still cannot see the puzzle pieces anywhere": they exist as
`openuc2.cube.puzzle_1x1` (palette search "puzzle") but are auto-placed ONLY
by placing a cube GROUP that declares `joint_cells` (miniframe brightfield
places 9). A hand-placed design never gets structure — cubify should derive
the sandwich plates and one joint per shared cube edge, as `addGroup`
already does for groups. (Also: the "plates & joints" toggle persists — if it
was ever switched off, everything structural is hidden; check it first.)
Right now it says "mesh failed" when trying to display a manually placed puzzle 1x1. 
The puzzle is a 5mm thick piece that sits on top of and below the cube. Multiple 
puzzle pieces can be connected in x/y to form a large plate to mount multiple cubes in one
layer and stack multiple cube in the z-direction 

### WP-147 · FRAME OPM: the inner cube as a carrier group

**Landed.** The 3×3×2 group and the `miniframe` bay already existed; the FRAME body is now the carrier's placeholder mesh with a MEASURED envelope. Measuring it needed a core fix: the export uses `KHR_mesh_quantization`, so `glb_bounding_box` read it as 10 157 770 mm until it learned to dequantize.

Files provided (`FRAME_reduced-compressed.glb`, `frame3d.html`). Build in
optikit-core's library: a 3×3×2 `cube_group` for the FRAME inner cube with
top/bottom baseplates in `structure.plates`, plus a carrier housing whose
placeholder GLB is the reduced FRAME body (bays declare the 3×3×2 slot, the
WP-45 mechanism). Blocked-by-nothing but INFORMED by WP-140.3 (nested
subassemblies) — build it as a group now, migrate to a nested design when
the ids land.

### WP-148 · The insert turns inside a fixed cube — visibly

**Landed.** The scene renders twice with complementary masks — halves in place, insert under the conjugated pose. On the STP: the viewport never renders one; the service already converts STP→glTF on import, so both roads are covered.

Round-22/23 ask, twice: in the bind pose step, rotating the insert pose
should rotate the INSERT SUBTREE of the GLB (every node not matching
`CUBHLF`) and also the stp if possible  while the cube halves stay pins-up. Today only the optics overlay
previews the pose and the mesh sits still. Render split: halves at the shell
transform, rest at shell ∘ insert-pose. Pure display — records unchanged.
if stp is not possible we should probably find a way to convert it on the fly?

---

## P2 · roadmap (design discussions before code)

*(Numbering note: the round-24 commit log used WP-149 for the ports-crash fix
and WP-150 for group delete — both landed. The two backlog items that carried
those numbers are renumbered WP-156/WP-157 below — WP-152..155 belong to the
strategy sections above, and WP-151 was never reused.)*

- **WP-156 · Multi-cube parts.** `footprint_grid` already spells N×M×K, but
  placement, DRC overlap, the T-rule and the mesh cell check all assume
  1×1×1. Define: anchor cell + span, port cells, and how verify-t1 measures
  a multi-cell envelope. *Round 25 asked three more times* ("NxM larger
  components", "arbitrarily large components", "imported components can be
  larger than one cube") — promote to the next P1 slot.
- **WP-157 · open-raman → UC2 importer.** The Optiland-setup importer
  (WP-87) already carries prescriptions in; the missing half is a mapping
  road from a published system (open-raman.org) to cubes: match elements to
  library records by vendor/EFL/diameter, propose holders for the rest.
- **WP-151 · Merit functions & optimization tables.** Expose optiland's
  operand formalism as a table (variable, target, weight — rows referencing
  parts/DOFs), stored in the design's `simulation:` block; `/v1/optimize`
  consumes it. Closer-to-optiland is the stated direction; WP-144 is the
  prerequisite.
### WP-152 · Land the canvas pair, consolidate the repos (round 25 — first)

Ratified 2026-08-09: **merge before anything builds on top.**

1. Backend: `kit-canvas-scene3-export` → optikit-core main (self-contained:
   `/v1/scene3`, `/v1/library/verify-t1`, the compiler transverse-transport
   fix rides along).
2. Frontend: `emb-g-kernel-port` is dsn-model + 6 commits — merge it into
   `dsn-model` first (near-trivial), then the repo move below.
3. Repo topology (recommendation): **monorepo.** The pair is hard-coupled
   (the frontend pins backend `83a315d+`, KIT-05 crosses the repos, one
   contract) — bring the frontend into optikit-core under `/frontend` via
   `git subtree add` (history preserved; a hard copy loses it), consider
   renaming the combined repo `openUC2/optikit`. The old openUC2-OptiKit
   repo stays untouched serving the legacy configurator: tag its main
   `v1`, archive the repo with a pointer README, delete the migrated
   `dsn-model` branch there. The backend stays at the repo root for now —
   a cosmetic `/backend` move touches packaging/CI and can wait.
4. Kernel source: the optiland-canvas author is a collaborator and can
   share sources — replace the vendored tarball with a source dependency
   (submodule or CI-built package), bring KIT-05/06 out of
   maintainer-local into CI, and mirror the integration-spec sections the
   code cites (§18/§19, rules 5/12/13) into DSN-CONTRACT as a scene3-lane
   section.
5. Riding the merge: a UI toggle for the kernel loop (on by default with
   no off switch today), surface `kernel.findings`/warnings, pick the
   canonical home for `optics.emission` vs `SourceSpec.beam_diameter_mm`
   (GO_INTEGRATION ask #12), and one home each for the one-stop rule and
   the ∞-spellings (both currently implemented twice, compiler + dialect).

### WP-153 · The sequential projection — a third view of the one document (round 25)

Ratified: the surface **table + unfolded 2D sketch** is the v1 UX (no
docked-analysis ambition yet). The Optiland-style sequential editor is a
**third projection of `OptikitDocument`** beside schematic and assembly —
never a parallel model. Both maps between sequence-space and world-space
already exist and are proven equivalent at ~1e-14 (KIT-05):
sequence→world is `canvas/materialize.py:_Placer.local_pos`;
world→sequence is `compile/compiler.py`'s `ManifestEntry.world`
(fold-correct since the `_reflect_transverse` fix).

- **Ordering — ray-swept, checked against intent.** The kernel trace can
  construct the sequence physically: record the hit order of the traced
  rays and map object ids → components through the scene3-manifest
  (upstream ask: the segment readout must expose per-hit object ids).
  But the *declared/inferred* `paths:` stay the intent — while editing, a
  misaligned design's rays miss elements, and the table must keep showing
  the intended sequence precisely so the user can fix it. Sweep agrees →
  silent; sweep disagrees → a finding ("declared M1 before L2; rays hit
  L2 first") with a repair offer. Long-term the compiler stops owning
  sequencing and shrinks to the Optiland projection (optimize/merit,
  spot/paraxial, `optic.json` interop) — it is not removed; WP-144 part 2
  retires its unstable unfolding half. The table's axis is cumulative
  path length along the traced ray — *display* unfolding, no physics.
- **Read path**: per named path, table rows = traversal order + record
  fragments (prescription) + gaps from part poses; folds render as
  markers ("M1, 90°" — mechanically real, identity in prescription
  space); a branch point renders as a terminator with a "switch to
  path…" chip. The path selector is first-class — deliberately ahead of
  Optiland's single-system worldview.
- **Write-back routing**: air gaps / insert / delete / reorder are
  **placement** edits → facade verbs (a new `shiftAlongPath(path,
  fromElement, deltaMm)` re-poses everything downstream; insert = the
  WP-60/WP-87 unbound-primitive road). Prescription columns are
  **read-only for catalog parts** — library parts are static physical
  objects, so the verb is `replace with…` (picker filtered by
  EFL/Ø/λ/fits-a-cube), not edit-in-place; direct prescription editing
  exists only for unbound user primitives (`lens f=50`), which are
  already `user.*` drafts. The WP-87 workspace-copy road stays as the
  import mechanism, off the critical path. Bound parts quantize gap
  edits to cells + intra-cube residual via the same placement path drag
  uses; a gap the T-class cannot absorb is a finding, not a silent
  clamp.
- **Live feedback for free**: gap edits are pose-only edits, so the kernel
  tier-2 fast path (`PREVIEW_KEYS` in `src/kernel/kernelSim.ts`) previews
  them instantly — the sequential editor inherits the live trace without
  new infrastructure.
- **Phasing**: (1) read-only table + unfolded 2D sketch, (2) editable gaps
  + insert/delete/replace, (3) prescription editing for user primitives,
  (4) the WP-88 DSL as the *textual serialization* of this projection
  (script ↔ table ↔ sketch are one state; WP-88 stops being a standalone
  package), (5) the optimize dialog moves here — in sequence space the
  free pose variables ARE the air gaps, which is the variable set
  WP-93/WP-151 expect. WP-144 part 2 (folds as reflective surfaces) is
  the prereq for expressing folded systems in optiland's own formalism,
  not for phases 1–3.

### WP-154 · Dispersive elements & the spectral axis (round 25)

Chromatic dispersion of *glass* effectively lands with the canvas branch pair
(`kit-canvas-scene3-export` bakes real Sellmeier coefficients into the scene3
`catalog.glasses`, refusing to approximate; the kernel traces wavelength-true;
the sequential lane resolves the same glass names through optiland's own
database). What is missing everywhere is dispersive **deflection** — the
grating/prism axis that open-raman (WP-157) and the Czerny-Turner benchmark
need:

1. **Record vocabulary**: a `grating` category (`lines_per_mm`, `order`,
   blaze) in the component schema + parts editor. The compiler's
   `"diffractive" → DiffractiveInteractionModel` mapping
   (`compile/compiler.py:115`) is vocabulary passthrough exercised by zero
   records today; canvas dialect v0 whitelists only
   `refractive_reflective | thin_lens` — both need the new type.
2. **λ-dependent exit direction**: ports today carry one geometric direction;
   a grating's out-direction obeys m·λ = d·(sin θᵢ + sin θd). Chain
   inference and the ports model need either a λ-parametrized port direction
   (evaluated at the design's primary line) or per-line path branches — the
   spectral-aware inference (WP-74) gates on response, not geometry, so this
   is a new mechanism, not an extension of it.
3. **Both engines**: optiland's diffractive model on the sequential lane;
   the kernel needs grating support upstream in optiland-canvas (it has
   `addPrism` + Sellmeier, no grating) — the author is a collaborator with
   sources shareable (WP-152.4), so this is a concrete upstream ask, not a
   blocker.
4. **Readout**: the dispersed fan across a detector is the spectrometer's
   output — WP-94 virtual detectors (or the kernel's G4 readout slice) turn
   it into a spectrum plot.

Acceptance: a Czerny-Turner layout traces per-λ, per-λ spot centroids on the
detector match the grating equation analytically, and the fan renders in the
canvas. Prereq for the WP-95 benchmark suite's Raman ambition and the real
enabler behind WP-157.

### WP-155 · Vendor catalog connector (Thorlabs / Edmund)

Metadata-only index (part number, family, EFL, Ø, λ-range, price, product
URL) as a palette source badged by vendor — facts, small, cacheable, and
filterable by what no vendor offers: "fits a 50 mm cube / has a holder
generator". Prescriptions are fetched **at place time** into the user's
workspace (the user does the download; we never redistribute): the fetch
road feeds the existing `.zmx` importer (`importers/thorlabs.py` already
does zmx → record with datum frames; today it is `--zmx-dir` only).
Promotion to `thorlabs.*`/curated stays the explicit library-save flow.
Check current vendor terms before building the fetch road.

## Round 25 (2026-08-13) — the email triage

Source: Bene's notes-to-self mail (openuc2.com, 13 Aug) + the attached
`Untitled-Setup.dsn`. Two items in it are already visible working in its own
screenshots (the vacuous-verify banner, the T1 90° steppers); one item is
diagnosed below rather than deferred. New numbers start at WP-158
(WP-152..155 are the strategy round's packages above; WP-149/150 were
consumed by round-24 commit messages).

### Quick wins first

- **WP-158 · ±1-cell translation buttons.** "For the translation in xyz it
  would be handy to have +/- grid position 50/55 mm buttons." The property
  panel gets x/y/z ∓/± steppers that move exactly one cell (50/50/55), next
  to the WP-143 rotation steppers. One function, six buttons.
- **WP-159 · Fibers are first-class, and "no beam" says why.** The fiber
  appears nowhere it can be deleted ("the fiber should appear in the
  bom/parts overview"). And the attached design renders no beam for a
  findable reason: it declares NO `paths:` at all — its only link is the
  fiber `uc2-eyepiece.back → uc2-torch.out`, so inference has to walk a
  FIBER hop from the source and propose the chain, and the panel must say
  "no path declared — adopt or chain one" instead of rendering nothing.
  Fibers get list rows (Design panel + BOM) with delete; the empty-paths
  state gets words.
- **WP-160 · Detect the ×1000 Inventor GLB scale.** "The glbs exported from
  inventor have a 1000x scaling factor — detect automatically or have a
  scaling factor in the imports." The node-scale ×1000 (m→mm) is already
  honoured when present; the failure case is a file WITHOUT the wrapper
  scale. Auto-detect by bbox sanity (a part measuring under ~2 mm or over
  ~2 m is in the wrong unit) with a visible "assumed ×1000" note, plus an
  explicit scale field in the mesh section for the cases the heuristic
  cannot decide. Kin to the KHR-quantization fix (WP-147).
- **WP-161 · `E_NO_FRAGMENT` is category-aware.** The mail's screenshot
  shows `user.mechanics.uc2_cube` and `user.sample.uc2_sample` hard-failing
  with "declares no fragment surfaces — nothing for the fixed insert to
  hold". A pure-mechanics record and a sample plane legitimately HAVE no
  surfaces; the check must exempt mechanics/sample/other categories (a
  mirror or lens without a fragment stays an error).

### P1 additions

- **WP-162 · Place parts in the ASSEMBLY view.** Twice in one mail: "in the
  assembly we also need to be able to place components freely" and "placing a
  puzzle piece is not very intuitive [in the schematic] but renders correctly
  in the assembly — maybe all mechanical components can also be placed in the
  assembly view". The assembly gains a palette drop road (same `addPart`,
  same grid snap); mechanical categories (puzzle, plates, empties) default
  to it. Includes the "add empty cubes" affordance — a one-click spacer,
  and optionally a fill rule for enclosed gaps.
- **WP-163 · STP conversion fidelity: names and colours.** "Separation of
  the cube halves in the stp does not work yet, it's the same name" — the
  STP→GLB conversion flattens node names, so the WP-148 CUBHLF split cannot
  find the halves in converted meshes; it must preserve the assembly tree's
  names. Same pass: "step files do not show colours" — carry STEP face/solid
  colours into the GLB materials (OCP exposes them).
- **WP-164 · Attach a Zemax model to a component.** "How can we associate
  e.g. an objective lens with a zemax model?" The `.zmx` importer exists for
  whole setups (WP-87); this is the per-record road: an "attach .zmx…"
  action on a component that imports the prescription into
  `optics.fragment.surfaces` and keeps the file as provenance.
- **WP-165 · Import a bare YAML design.** "How could we just import yaml?"
  The importer accepts only `.dsn.zip` today; accept a raw
  `optikit-design.yml` (drag-drop and file picker), with the zip road
  unchanged for bundles that carry a library.

### P2 additions

- **WP-166 · Coupled DOFs (mechanical linkages).** "Some components (e.g.
  the z stage) have this mechanical link — turn knob/move motor, translate
  objective. Need to define it?" Yes: a `linked-to:` relation between DOFs
  (ratio + offset), declared on the template, honoured by actuation and the
  optimizer. Design discussion first — it touches the firmware contract.
- **Library content, no WP needed:** a smartphone detector record ("add
  phone") next to the cameras; it is authoring work in `library/`, not code.

### Carried over from the roadmap (2026-08-09)

`kicad-for-optics-roadmap.md` is the M0…M10 plan through the MVP. Everything
it lists through **WP-92** has landed (WP-87 Optiland import, WP-89 the part
inspector's optics, WP-90 per-category authoring, WP-91 palette list view +
multispectral, WP-92 the bug sweep — each has code and tests in tree). These
four never started, and are restated here so ONE document holds the open work.
The roadmap keeps the milestone framing and the full prompts; this is the
backlog.

- **WP-88 · Sequential beam-path scripting** *(roadmap Phase 4)*. A small
  Optiland/PyOpticL-style DSL that builds the circuit line by line and stays
  two-way in sync with the canvas — the inverse authoring direction to chain
  inference. Nothing in tree. **Round 25: absorbed into WP-153 phase 4** —
  the DSL becomes the textual serialization of the sequential projection,
  which makes "two-way in sync" free (one document, three renderers, no sync
  protocol).
- **WP-93 · The optimizer becomes a design tool** *(roadmap M9)*. Free-space
  **pose variables** for unbound optics — `_free_dofs` varies only *declared*
  DOFs today, so "break the optic loose and let the optimizer place it"
  silently does nothing; plus per-variable constraints (bounds/fix/link), a
  merit CHOICE instead of the hardcoded RMS spot, and the "change the
  holder…" verb so an optimizer-moved part gets new mechanics in one undo
  step. **Overlaps WP-151** (merit tables in optiland's formalism) — treat
  them as one package when either is picked up, and note WP-144 part 2 is the
  prerequisite for expressing folded systems in optiland's own terms.
- **WP-94 · Virtual detectors** *(roadmap M9)*. Non-physical probes placed
  anywhere in the beam (including inside a sample volume) returning an
  irradiance map + homogeneity, power, D86. Consumes no cube, appears in no
  BOM, never perturbs the trace. Feeds WP-93's merit — and it is what makes
  the fluo-scope's stated acceptance criterion computable at all.
- **WP-95 · The benchmark suite** *(roadmap M9, the MVP gate)*. Three
  instruments as goldens + CI: the fluorescence scope (exists; gains the
  optimization + probe acceptance), the **light sheet** (two independent arms
  crossing at the aquarium — the geometry-complexity test) and the
  **laser-scanning confocal** (galvo tilt deflecting at 2θ, pinhole gating the
  return — the reference test). Note the audit's compiler finding #1: a
  rotation DOF currently swings the beam by θ where the reflection law wants
  2θ, so the confocal benchmark cannot pass until that is fixed.

Post-MVP, unchanged and still in the roadmap (M10): WP-70 publish loop, WP-55
GitHub docs sideload, WP-56 embedded viewer v2, WP-59 OSHWLab-for-optics,
WP-72 accounts/storage ADR, WP-73 the UX overhaul. Plus the roadmap's own
**WP-90 amendment** (multi-axis DOF authoring + a generic
`openuc2.tpl.lens_holder_xyz` with independent dx/dy/dz — every T2 template
in the library declares exactly one translation axis, though the placement
machinery already handles N).

- ⏳ **Audit carry-overs** (still open, unranked): rotatePart's mixed-frame
  yaw on TIPPED parts (upright cubes are safe since WP-124/136); compiler
  physics #1 (DOF θ→2θ), #2 (per-hop `cs` read as absolute), #4
  (`semi_aperture` never emitted); `W_POSE_VACUOUS` + retitling verify-t1's
  OK line; `RotGridSpec` axis validator (typo → 422, not 500);
  `portCatalog.ts` FOLD_90 fallback goes loud; `ports-frame` on the `.dsn`
  wire; an explicit port `role:` replacing the six copies of
  `/^(front|sensor|in|plane)$/`; community-repo modules never enrich
  (mergeRepoIndexes drops `components`).



WP-88 — Sequential beam-path scripting (Phase 4, with WP-78). A small Optiland/PyOpticL-style DSL that builds the circuit line by line and stays two-way in sync with the canvas — the inverse authoring direction to chain inference.

### WP-88 — Script the beam path: a sequential authoring mode

```
PROMPT (repo: openUC2-OptiKit, thin core support)

Optiland let you BUILD a system in code, sequentially — add a
source, then a lens 40 mm downstream, then a mirror. Offer the same for the
schematic: a text/script pane that authors the design programmatically, as
an alternative to dragging.

1. A small, safe DSL (NOT arbitrary JS): line-oriented commands mirroring the
   Optiland vocabulary — `source 488nm`, `lens f=50 @ +40mm`,
   `mirror 45deg @ +30mm turn=up`, `detector @ +50mm`. Each line places a
   part relative to the previous element along the beam (the WP-88 constraint
   is the {distance | x | y | z} + turn vocabulary PyOpticL uses), resolved to
   grid cells + intra-cube residual by the same placement path drag uses.
2. The script is a VIEW of the document, two-way: editing the script re-lays
   the parts; dragging a part updates the script (round-trips through the
   .dsn like everything else). A parse error is a marker, not a crash.
3. It composes with the library: `place openuc2.cube.mirror_1x1 @ +30mm`
   drops a real catalog cube; `lens f=50` synthesizes an unbound primitive
   (WP-60) the way the palette lens does.
4. Reference the OpticsChainer relationship in the docs: this is the INVERSE
   authoring direction to chain inference — the user writes the sequence and
   the geometry follows, where inference reads the geometry and proposes the
   sequence. Same netlist model underneath.

Acceptance: a five-line script (source, filter, dichroic, objective, camera)
lays out the fluo-scope excitation arm; dragging the objective updates its
`@ +Nmm` in the script; a syntax error shows a marker and the rest still
lays out.
```

**For humans:** for people who think in code (and to paste a setup from a paper
or an Optiland notebook), a little scripting language that builds the optical
circuit line by line — and stays in sync when you drag things around.

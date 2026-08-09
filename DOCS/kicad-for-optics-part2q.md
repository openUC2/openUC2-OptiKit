# Part 2q — round-23 triage: the sync with Go, the sim loop, and the roadmap

Status of the previous plans: part2o and part2p are fully landed (WP-110..138,
see git log). This file is the CURRENT backlog, ordered by priority. Items
marked ⏳ came out of the August frames audit and are still open; everything
else is new from round 23 (2026-08-07).

Done during the round-23 triage itself, not WPs: datum rows measure in the
PART frame again with the world value read-only alongside (WP-139); the
compiler coerces every corpus spelling of ∞ (`.inf` / `inf` / `1e999`)
instead of crashing; `_optiland_or_501` is gone — optiland is assumed.

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

- **WP-149 · Multi-cube parts.** `footprint_grid` already spells N×M×K, but
  placement, DRC overlap, the T-rule and the mesh cell check all assume
  1×1×1. Define: anchor cell + span, port cells, and how verify-t1 measures
  a multi-cell envelope.
- **WP-150 · open-raman → UC2 importer.** The Optiland-setup importer
  (WP-87) already carries prescriptions in; the missing half is a mapping
  road from a published system (open-raman.org) to cubes: match elements to
  library records by vendor/EFL/diameter, propose holders for the rest.
- **WP-151 · Merit functions & optimization tables.** Expose optiland's
  operand formalism as a table (variable, target, weight — rows referencing
  parts/DOFs), stored in the design's `simulation:` block; `/v1/optimize`
  consumes it. Closer-to-optiland is the stated direction; WP-144 is the
  prerequisite.
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

# Part 2m · Feedback round 12 (2026-07-29) — the optimize loop, virtual detectors, and the benchmark suite

Continues `kicad-for-optics-part2l.md`. Source: a spoken walkthrough of the
vendor-integration workflow plus the three benchmark instruments that define
"done" for the MVP. WP numbering continues at **WP-93**.

**Status when triaged:** WP-74…WP-86 have all landed (physics correctness, the
verbs, part-first, the Inventor loop, hardware write-back, grouping). The open
set is Part 2l's WP-87…WP-92 plus Phase 7. So the amendments below target
packages that have **not** been worked on.

---

## 1. Coverage check — what the transcript asks for, and where it lives

Most of the workflow is already built or already specced. Only four items are
genuinely new.

| User story | Status | Where |
|---|---|---|
| Download a vendor Zemax file → import → place in a UC2 cube | ✅ **done** | `import zmx` + WP-82's drop-zone UI; WP-61 puts it in a cube |
| Import a STEP assembly (kinematic mirror holder) and define which surface is the reflective mirror | ✅ **done** | Parts editor → mechanics tab: load STEP, place a `reflective` datum; WP-83 ships the KM05 reference part |
| Import a laser housing STEP, define its optical axis, associate a laser primitive | ✅ **done** | same flow + WP-67 (housing without a cube) |
| Associate optical primitives with existing Inventor cube modules | ✅ **done** | WP-84 (export posed → attach back onto the same record) |
| Export optimized positions back into Inventor | ✅ **done** | WP-84 export + WP-85 fx parameters |
| Volume geometry for lenses that exist only as a prescription | ✅ **done** | WP-62 `solid_from_prescription`; WP-75 air-spaced groups |
| Set which optimizer variables are adjusted vs fixed | ⚠️ **half** — checkbox selection exists (`OptimizeDialog`), per-variable bounds/fixing do not | → **WP-93** |
| Generic T2 lens holders allowing **X/Y/Z** movement | ⚠️ **machinery yes, record no** — every T2 template in the library declares exactly ONE translation DOF | → **WP-90 amendment** |
| Switch holder type (T1/T2/T3) **late**, after optimizing | ⚠️ **two-step today** — unbind (WP-76) then generate (WP-77); no single "change holder" verb | → **WP-93** |
| **Break the optic↔holder link so the OPTIMIZER can move the optic** | ❌ **gap** — unbinding works, but `_free_dofs` only varies *declared DOFs*, and an unbound part declares none, so the optimizer cannot touch it | → **WP-93** |
| **Virtual detectors** (irradiance distribution, homogeneity) | ❌ **new** — nothing in the codebase; the merit function is hardcoded to RMS spot size | → **WP-94** |
| **Light-sheet** and **confocal** benchmark designs | ❌ **new** — only `golden/fluo-scope.dsn` exists | → **WP-95** |

Two things worth stating plainly, because they change what "optimize" means:

- **The optimizer's merit is hardcoded** to RMS spot radius at the last surface
  (`service/app.py:557-570`). Homogeneity in a sample plane — the fluo-scope's
  actual acceptance criterion — cannot be expressed at all today.
- **An unbound optic is invisible to the optimizer.** The "break the connection
  so the optimizer finds the ideal position" story needs free-space *pose*
  variables, not DOF variables. That is the core of WP-93.

---

## 2. Amendment to an existing, unstarted package

### WP-90 (amended) — multi-axis T2 authoring + the generic lens holder

Add to the existing WP-90 prompt (`kicad-for-optics-part2l.md`):

```
5. MULTI-AXIS DOFs, authored and shipped. Every T2 template in the library
   declares exactly one translation DOF (verified: lens_insert_25mm,
   z_motor, cublend12_7f40 — all single-axis), yet the placement machinery
   already projects a residual onto ALL declared axes
   (`constrainOffsetToTemplate`). So the gap is authoring + records:
   - the mechanics tab can declare N DOFs on a template (add/remove a DOF
     row: name, kind, axis, range, resolution, actuatable), which is also
     what makes WP-77's "no adaptive template with zero DOFs" guard
     satisfiable from the UI;
   - ship `openuc2.tpl.lens_holder_xyz` — a GENERIC T2 lens holder with
     independent dx/dy/dz travel (±5 mm each) for an UNMOUNTED lens, plus
     its module bound to the starter lens. This is the "generic T2 holder
     that lets me move the lens in X, Y and Z" the transcript asks for and
     the natural target for WP-85's Inventor parameterization.

Acceptance (added): author a 3-DOF template in the mechanics tab and save it;
place its module, drag the insert in x and y (not just z), and both clamp to
their declared ranges; `library validate` and `check_actuation` stay clean.
```

---

## 3. New work packages

### WP-93 — The optimizer becomes a design tool: free poses, constraints, and re-holding

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Today the optimizer varies DECLARED DOFs against a HARDCODED merit. The
transcript's workflow needs three things it cannot do: move a free optic,
constrain what it is allowed to touch, and re-hold the result.

1. FREE-SPACE POSE VARIABLES. `_free_dofs` (service/app.py:1256) iterates
   `comp.dof` only, so an unbound primitive (WP-60/76) has nothing to vary —
   which defeats the whole "break the connection so the optimizer can move
   the optic" story. Add synthetic variables for a TEMPLATE-LESS component:
   `<comp>.pose.x|y|z` (and, gated behind an opt-in, `.rx|.ry`), bounded by
   an explicit user-supplied range (default ±25 mm — half a cube — never
   unbounded). They vary `pose.translation.offset-mm` directly. A part WITH
   a template keeps using its declared DOFs; the two never mix, so T1 parts
   still cannot move.
2. CONSTRAINTS, per variable. The optimize dialog already selects WHICH
   variables participate; add per-variable bounds (narrower than the DOF
   range), a "fix at current value" toggle, and a "link to" that ties two
   variables to move together (the classic symmetric-pair constraint).
   Constraints ride in the request body and are echoed in the result so a
   run is reproducible.
3. MERIT CHOICE. Replace the hardcoded RMS-spot merit with a named merit
   selected per run: `rms_spot` (today's), `homogeneity` (WP-94's virtual
   detector — minimize the irradiance CV over the probe area),
   `encircled_energy`, or `custom_target` (drive a named measurement to a
   value). The merit is part of the result's provenance, so
   back-annotation records WHAT was optimized, not just the deltas.
4. RE-HOLD AFTER OPTIMIZING — "change the holder…". After the optimizer
   moves parts, the newly-placed optics need mechanics again. One verb on a
   placed part switches its template class in place: T1 → T2 → T3, keeping
   the pose, as ONE undo step. Internally it is WP-76's unbind composed with
   the target class's bind path (T3 → generate a holder, T2 → the WP-85
   Inventor insert, T1 → attach an Inventor cube), so no new binding
   machinery — just the missing single verb, exposed in the WP-78 context
   menu, the WP-66 Modules panel row, and the part inspector's action row.

Acceptance: unbind a lens, mark its x and z free with ±10 mm bounds, fix its
y, optimize the fluo-scope emission path against `homogeneity` measured by a
virtual detector in the sample plane — the lens moves, the CV drops, the
result records the merit; then "change the holder… → T3" regenerates a
cavity at the optimized pose in one undo step; a T1 part offered the same
verb converts to T3 rather than silently refusing to move.
```

**For humans:** the optimizer stops being "nudge the declared knobs" and becomes
"find where this lens should actually be". You break it loose from its holder,
say what it may and may not change, choose what *good* means (spot size, or an
even illumination across the sample), let it solve — and then press one button
to build a new holder at the position it found.

### WP-94 — Virtual detectors: measurement probes in the beam

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Every benchmark in the transcript measures something — homogeneity in the
sample plane, the light-sheet profile inside the aquarium, the confocal PSF.
None of it is expressible: the only "detector" is a physical part, and the
only number the engine reports is RMS spot size.

1. A PROBE is a non-physical, placeable measurement plane: position + normal
   + extent (circular Ø or rectangular w×h) + a sampling grid. It is a
   design-level object (`probes:` alongside `paths:`), NOT a library record —
   it consumes no cube, appears in no BOM, and DRC ignores it. It may sit
   anywhere, including inside a sample volume.
2. Core: `measure(decl, path, probes)` traces the path and, per probe,
   returns the irradiance distribution on its grid plus derived scalars:
   total power, centroid, RMS spot, D86/encircled energy, peak-to-mean, and
   **homogeneity** (coefficient of variation over the probe area, and a
   uniformity ratio min/max). Expose as `POST /v1/measure` and
   `optikit-core measure <design> --path <p>`.
3. Frontend: place a probe from the schematic (a translucent plane glyph
   with its extent drawn), and a results panel showing the irradiance map as
   a heatmap + the scalars, refreshed on simulate. Probes are part of the
   .dsn, so they round-trip and ship in a share link.
4. Feeds WP-93: a probe scalar is selectable as the optimizer's merit
   (`homogeneity` on probe "sample-plane"), which is what makes the
   fluo-scope's stated acceptance criterion computable.
5. Scope guard: a probe MEASURES, it never blocks or refracts — the ray trace
   is unchanged by its presence (it is a query, not an element). Pin that
   with a test: adding a probe does not alter the traced rays.

Acceptance: drop a probe in the fluo-scope's sample plane, simulate, and read
an irradiance heatmap with a homogeneity number; move the objective and the
number changes; the probe survives a .dsn round trip; the traced rays are
bit-identical with and without the probe.
```

**For humans:** a camera you can put anywhere in the beam that isn't really
there — it tells you how much light arrives and how evenly it's spread, without
being a part you have to buy or mount. It's how you answer "is my illumination
flat across the sample?", and it's what the optimizer aims at.

### WP-95 — The benchmark suite: three instruments that define "done"

```
PROMPT (repo: optikit-core, fixtures + acceptance)

Three reference instruments, simple → hard, each a golden .dsn with a test
that proves the platform on it. They are the MVP's exit criteria.

1. FLUORESCENCE MICROSCOPE — the two-path test. EXISTS
   (`golden/fluo-scope.dsn`) but its acceptance is incomplete. Add: a
   virtual detector (WP-94) in the sample plane; an optimization run (WP-93)
   over the objective↔tube-lens distance with `homogeneity` as the merit;
   assert the CV improves and the accepted dof_value writes back. Also
   assert WP-74's spectral gate prunes the excitation arm's bleed-through at
   488 nm and retains it as a leakage warning.
2. LIGHT-SHEET MICROSCOPE — the independent-path test. NEW golden: two
   fully independent arms (illumination + detection) that share no
   component, crossing at a sample volume ("the aquarium" — a sample
   component with a real extent). Assert: both paths infer independently
   (WP-52's walk starts once per source), the light-sheet waist is measured
   inside the aquarium volume by a probe, and cubify places both arms on the
   grid without collision. This is the geometry-complexity test.
3. LASER-SCANNING CONFOCAL — the reference test, hardest. NEW golden:
   source → galvo (the WP-80 rotation DOFs, actually tilting) → scan/tube
   lens → objective → sample → back through a pinhole to a point detector.
   Assert: a galvo tilt of N degrees deflects the beam by 2N (WP-82a's
   reflection law), the pinhole's clear aperture gates the return beam
   (WP-79's DRC_APERTURE), and the descan path compiles as its own path.
4. Each benchmark ships as: the golden .dsn, a test in the core suite, a
   gallery entry so it opens in the editor, and a short DOCS page saying
   what it proves. Run them in CI — they are the regression net for every
   future WP.

Acceptance: all three designs validate, infer their paths, compile,
simulate, and cubify clean; the fluo-scope optimization improves its
homogeneity metric; the light sheet's two arms stay independent; the
confocal's galvo tilt deflects at 2x and the pinhole gates the return.
```

**For humans:** three real microscopes — a fluorescence scope, a light sheet,
and a confocal — built in OptiKit and checked automatically. When all three go
green, the platform demonstrably handles real instruments, not just demos. They
also become the examples users open first.

---

## 4. Where these land

| Package | Milestone | Note |
|---|---|---|
| **WP-90** (amended) | M8 · workflow polish | multi-axis authoring + the generic XYZ lens holder |
| **WP-93** optimizer | M9 · MVP proven | needs WP-94's probes for the homogeneity merit |
| **WP-94** virtual detectors | M9 · MVP proven | the shared measurement tool |
| **WP-95** benchmarks | M9 · MVP proven | the exit criteria; needs 93 + 94 |

M9 is the new **"MVP proven"** gate: when the three benchmarks pass, the
platform is demonstrably able to design, simulate, optimize, cubify and produce
real instruments. Everything after it (community, accounts, UX) is Phase 7 /
M10, unchanged.

E2 asks this round: **one** — `probes:` as a new design-level block alongside
`paths:` (WP-94). Additive; a Go loader round-trips it through `extra="allow"`
and can ignore it entirely (a probe has no geometry to render).

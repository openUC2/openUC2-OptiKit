# Part 2k · Feedback round 10 (2026-07-28) — optics groups, the unbind verb, and the physics gate

Continues `kicad-for-optics-part2j.md`. Status at triage: Part 2i (WP-60/61/62)
and most of Part 2j (WP-63/64/65/66/68/69) have landed; WP-67, 70, 71, 72, 73
remain queued. WP numbering continues at **WP-74**.

---

## Answers first (things that are answers, not work)

### "How do we include achromats or objective lenses with multiple elements? They need to be an optics group, yet they expose their own housing."

**An achromat already works today, and so does a multi-element objective — if you
have its prescription.** A component's `optics.fragment` is an Optiland surface
stack; a cemented doublet is a material change with no air gap
(`thorlabs.lens.ac254-050-a` is exactly this: 3 surfaces, N-BAF10 / N-SF10 /
air), and an air-spaced multiplet is just a surface whose `thickness` carries no
`material_post`. The compiler advances `local_z += thickness` regardless of
material (`compile/compiler.py:615`), so a 12-surface objective compiles and
traces correctly today. **The "optics group" you are asking for is the fragment.**

Three things genuinely break, and they are the WP-75 payload:

1. **You cannot generate mechanics for an air-spaced group.**
   `solid_from_prescription` refuses an air gap mid-stack —
   *"an air-spaced assembly is not one solid"* (`generators/optic_solid.py:135-142`).
   That refusal is correct as written (it is not one solid) but it is the wrong
   answer: an objective is *N* solids, one per glass group, and the holder wants
   all of them as cut bodies.
2. **You cannot model a catalog objective you have no prescription for.** The
   honest model of an Olympus 20× is a paraxial black box — EFL, NA, working
   distance, entrance pupil. Optiland ships `ThinLensInteractionModel` for
   exactly this, but the compiler **hardcodes** every emitted surface's
   interaction model to `RefractiveReflectiveModel`
   (`compile/compiler.py:596-601`), so an authored thin-lens surface is silently
   discarded. Coatings and BSDFs are dropped by the same three lines.
3. **The barrel housing has nowhere to live.** "Exposes its own housing" is the
   housing-without-a-cube case — already specced as **WP-67** and still queued.
   An objective barrel is a `mechanical_template` with no `footprint_grid` and
   no `cube_module`; today `bindToRecords` always emits a cube module, and an
   orphan template is invisible to the index.

Note what is **not** a problem: one component + one template is the right shape
for an objective (one optics group, one barrel). The 1:1:1 limitation from Part
2j's review bites when a cube holds *two independent optics at different poses* —
not here.

### "How do I place an unbound primitive freely and then put it in a cube after Optiland has drawn the rays?"

**That button shipped yesterday.** Place the primitive from the palette (it is
badged **UNBOUND**), chain and simulate it as usual, then go to
**Assembly → select the part → "generate a holder…"** (`AssemblyPage.tsx:373`).
You get a two-half printable holder whose cavity is carved at the pose you
actually left the optic at, and Accept materializes `template + module` and
re-points the part — it becomes a real T3 cube.

Two reasons you may not have found it:

- **The action only exists in the Assembly view**, not the schematic — where you
  were probably working when the ray diagram appeared. WP-76 puts it on both.
- **It needs the core service running with the `generate` extra**, and the
  service on port 8000 in this workspace is a long-lived process that predates
  `/v1/generate`. If the button 404s or the palette looks stale, restart it.

### "We should be able to place any optical primitive freely — even one that lives inside a fixed cube — and then hold it with T3."

**This is the one verb the system is missing, and it is the exact inverse of the
one that just shipped.** WP-61 goes *primitive → cube*. You are asking for
*cube → primitive*: take a placed `openuc2.cube.mirror_1x1`, throw away the T1
template, and keep the optical component at the same pose as a free part — the
KiCad move of detaching a symbol from its footprint.

Mechanically this is small, because WP-66 already built the machinery:
`swapPartModule()` re-points a placed part's `libraryRef` in place, keeping the
pose and re-clamping DOFs. Unbinding is the same operation with the target
computed as `module.component.ref` instead of another module. That is **WP-76**,
and it closes the loop: *unbind → move freely → re-hold with T3 → it is a cube
again*, every step one undo.

### "A quick lensmaker focus estimate inside the bind editor."

`paraxialEflMm(surfaces)` already exists (`model/componentRecord.ts:212`) and is
a real 2×2 ABCD walk, not the thin-lens approximation — it already drives the
optics tab's ray sketch and writes `effective_focal_length_mm` into the record.
It is simply not rendered in the mechanics tab. Folded into **WP-77**.

### "Is manual chaining still necessary? — *Chaining 'path-2': 1 port(s) — click further pins, then finish.*"

**Mostly no.** Inference already runs: `inferAndAdoptChains` adopts proposals
automatically (`serviceStore.ts:28`, called on import and on the chain action),
and every "check" does an inference dry run and reports *"chain inference
proposes N additional path(s)"* (`ServicePanel.tsx:170-173`). Manual chaining is
the deliberate fallback for the case where inference refuses to guess —
`E_AMBIGUOUS_CHAIN` (two candidates at the same distance) and `E_NO_TARGET`
(a dead end, with WP-52's escape rays showing you where the light leaves).

What you hit is a UX failure, not a capability gap: the manual chain draft is
**modal and sticky** (one stray pin click puts you in "path-2: 1 port(s)" with
no visible way out but Esc), the proposals are reported as *text* rather than as
a one-click **Adopt**, and nothing re-runs inference when you place a part. All
three are WP-78.

### "I'm in the component editor with `openuc2.lens.bd_any_lens_1x1@0.1.0` and want to associate T3 — why must I choose a record pair? How do I associate T3? It's still not quite clear how this tool works."

Your confusion is well-founded: **there is no way to associate T3 from the
component editor, and the class dropdown that suggests there is produces a record
that cannot work.** Concretely, the mechanics tab emits a template with
`class: generative` and **no `generator:` block** (`model/bindRecord.ts:402-424`
has no `generator`, no `dof`, no `grooves`) — a generative template that names no
generator can never generate anything. That is a bug, not a misunderstanding.

The "record pair · optical component" chooser is asking a question that has an
obvious answer in your situation. It exists because the mechanics tab was built
for *"I have a STEP file; tell me which library component it realizes"* — the
answer can legitimately be an existing published component. When you are editing
a draft, the default is already correct (the helper text says *"the module
references THIS draft"*, `MechanicsPanel.tsx:591`); it should not be a dropdown
you must confront.

The mental model, stated once:

| You have | You need | The tool |
|---|---|---|
| numbers (radii, thickness, glass) | a **symbol** | component editor, optics tab |
| a STEP file | a **footprint** for an existing symbol | component editor, mechanics tab (today's "bind") |
| a symbol and no mechanics | a **generated holder** (T3) | "generate a holder…" — today only on a *placed* part in the Assembly |
| an Inventor cube | a **T1 module** | `optikit-core import glb` (CLI) |

The missing cell is row 3 reached from the editor rather than from a placement.
**WP-77** adds "generate a holder…" to the component editor (same
`/v1/generate` call, driven by the draft's own prescription), collapses the
record-pair chooser to a single line when the answer is the draft you are
editing, and refuses to emit a generative template with no generator.

### The PyOpticL spectral finding

Confirmed independently, and it is worse than the note states. After WP-68's
archiving the live library has **no `filter` category at all** — every filter
record went to `library/archive/`, and the seed set does not include one. The one
live dichroic is a bare reflective flat with no cut-on. Verified:
`compiler.py:357` hardcodes `polarization: "ignore"`; `chain/infer.py` contains
zero wavelength terms; the schema has no band / cut-on / transmit-ratio /
polarization field anywhere.

One correction to the note's sequencing advice: it says to freeze the response
block *before* WP-68 or the seed set gets authored twice. WP-68 has shipped, so
the actionable form is now — **the seed set still needs a filter and a dichroic
exemplar, and those are exactly the records that need the block.** Freeze it
before authoring them. That is **WP-74**, and it goes first.

---

## Decisions I've assumed (veto anytime)

1. **The `response:` block lands on the SURFACE, not the port.** A dichroic's
   cut-on is a property of the coated surface; ports are where beams enter and
   leave. This also keeps it inside the Optiland-serialized fragment, where
   `extra="allow"` already carries it losslessly.
2. **Jones math is declared but not implemented.** `polarization_deg` gets a
   schema home so BB84-class designs can record it; the projection is deferred
   until a design needs it. Wavelength gating IS implemented — it is what
   fluorescence needs.
3. **Unbinding drops the template and keeps the component**, at the same world
   pose, as one undo step. It does not delete the module record from the
   library, and it does not ask (undo is the answer).
4. **A paraxial "black box" element is a first-class surface kind**, not a
   special component type — one surface with `ThinLensInteractionModel` and an
   EFL, so a catalog objective chains and traces like anything else.

---

## Work packages

### WP-74 — Spectral and polarization response: the physics gate (FIRST)

```
PROMPT (repo: optikit-core, then openUC2-OptiKit)

Fluorescence is openUC2's core application and the datamodel cannot express
spectral separation. Fix the response half (the source half already exists:
SourceSpec.wavelengths_um + CompSpec.wavelength-um from WP-47).

1. Schema: a `response:` block on a FRAGMENT SURFACE (schema/design.py,
   inside the opaque surface dict — validate it explicitly rather than
   letting extra="allow" swallow typos):
     kind: mirror | sampler | polarizing | dichroic | absorptive
     reflect_bands_um: [[lo|null, hi|null], ...]   # null = open-ended
     transmit_ratio: float|null                    # sampler / beamsplitter
     polarization_deg: float|null                  # PBS reflect axis (declared,
                                                   # not yet projected)
   A band list with no entries means "all wavelengths" (today's behavior), so
   every existing record keeps working unchanged.
2. chain/infer.py: the walk carries the propagating wavelength (from the
   source's active line, WP-47) and PRUNES a branch whose surface response
   excludes it — the reflected arm of a 505 nm dichroic is not proposed at
   488 nm. A pruned-by-band arm is reported as an INFO finding, not silently
   dropped ("reflected arm pruned: 0.488 um outside reflect band"), because a
   real leak is a legitimate finding. This is the fix for the fluo-scope
   bleed-through that ARCHITECTURE.md currently calls "a legitimate finding".
3. schema/checks.py: a filter-stack compatibility check — for every path,
   does each emission filter's band clear the dichroic's cut-on? Emit
   W_FILTER_STACK naming both records when a band pair cannot pass light.
4. Photon budget: beam power accumulates along a path (source power ×
   per-surface transmit/reflect ratio) and is reported per path — the direct
   analogue of the WP-50 live BOM, answering "how much light reaches the
   sensor". Surface it in the service panel next to the paraxial numbers.
5. Seeds: author `openuc2.filter.emission_525` and re-author
   `openuc2.dichroic.filter_dichroic` with a real cut-on, both to WP-68 seed
   quality (zero review flags). These are the exemplars users copy.

Acceptance: the golden fluo-scope infers ONE path at 488 nm (the reflected
excitation arm) and reports the transmitted arm as pruned-by-band; swapping
the source to 525 nm flips which arm survives; a filter stack that cannot
pass light raises W_FILTER_STACK naming both records; the photon budget
reports a number for the fluo-scope emission path; library validate stays
finding-free.
```

**For humans:** the tool currently cannot tell a dichroic from a beamsplitter —
it has no idea that a filter has a colour. This teaches it, which is what makes
a fluorescence microscope a fluorescence microscope rather than a box with
mirrors in it. The bonus is a photon budget: *how much light actually reaches
the camera* — the question every microscope builder asks and no configurator
answers.

### WP-75 — Optics groups: achromats, objectives, and black boxes

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Multi-element optics already compile (a fragment IS an optics group). Three
things break around them.

1. Air-spaced groups become MECHANICS. generators/optic_solid.py's refusal
   ("an air-spaced assembly is not one solid") becomes a decomposition:
   `solids_from_prescription(surfaces, ...) -> list[cq.Workplane]`, one solid
   per contiguous glass group, each at its own axial position. The single-
   solid `solid_from_prescription` stays as the one-group case (do not break
   WP-62's callers or tests). boolean_holder_1x1 then cuts EVERY returned
   solid, so a doublet-plus-singlet objective gets a cavity per element with
   the air gaps left as material — which is what actually holds them.
   The per-element edge-thickness guard (E_EDGE_THICKNESS) applies per group.
2. Paraxial black boxes. The compiler HARDCODES
   interaction_model: {type: RefractiveReflectiveModel, is_reflective: false,
   coating: null, bsdf: null} on every emitted surface (compiler.py:596-601),
   silently discarding whatever the record authored. Pass an authored
   interaction_model through instead, validated against optiland's registry
   (DiffractiveInteractionModel | RefractiveReflectiveModel |
   ThinLensInteractionModel) with a typed E_INTERACTION for anything else —
   the same safety-net shape WP-63 gave materials. Then a catalog objective is
   ONE surface: Plane geometry + ThinLensInteractionModel + EFL, with NA and
   working distance as record facts.
3. Editor: the component editor gains an "element" grouping view over the
   surface table (which surfaces form which glass element, air gaps visible as
   gaps) and an "ideal / paraxial element" row kind for the black-box case.
   The seeds `openuc2.lens.achromat_starter` (cemented) and
   `openuc2.objective.paraxial_20x` (black box) ship as the exemplars.
4. The barrel: an objective exposes its own housing — that is WP-67
   (housing without a cube). Do not duplicate it here; WP-75 assumes a
   template with no footprint_grid once WP-67 lands, and until then an
   objective binds as an ordinary cube module.

Acceptance: a 4-surface air-spaced doublet+singlet generates a holder with two
cavities and passes the envelope check; `openuc2.objective.paraxial_20x`
chains, compiles and traces with a sensible back focal distance; an authored
coating survives compilation instead of being dropped; a bogus interaction
model raises E_INTERACTION naming the component and surface.
```

**For humans:** achromats already work — you just cannot print a holder for
anything with an air gap in it, and you cannot describe an objective you do not
have the recipe for. This fixes both: air-spaced assemblies get one cavity per
element, and a catalog objective can be honestly modelled as "a 9 mm lens in a
barrel" without inventing surfaces you do not know.

### WP-76 — The unbind verb: take the optic out of the cube

```
PROMPT (repo: openUC2-OptiKit)

WP-61 goes primitive -> cube. This is the inverse, and it completes the KiCad
symbol/footprint separation.

1. `unbindPart(partId)` in src/document (next to WP-66's swapPartModule,
   which already does the hard part): resolve the placed part's module to its
   component id via the index (module.component.ref minus the @range) and
   re-point libraryRef at it. Pose, ref, params and paths are untouched;
   template-bound DOF values are dropped (the component declares none) and
   reported. ONE undo step. Refuse with a clear message when the module's
   component does not resolve (an archived record -> the WP-68 E_ARCHIVED
   hint).
2. The part immediately behaves as a WP-60 unbound primitive: continuous mm
   movement, no grid claim, DRC-invisible, UNBOUND badge, and the
   "generate a holder…" affordance — so unbind -> move -> re-hold is a
   complete round trip, each step undoable.
3. "generate a holder…" moves to BOTH editors. Today it only exists in the
   assembly panel (AssemblyPage.tsx:373); the schematic property panel gets
   the same action for unbound parts, because that is where the user is
   standing when the ray diagram tells them where the optic belongs.
4. Surface both verbs where they are discoverable: the WP-66 Modules panel
   row menu and the WP-78 context menu get "take out of cube" / "put in a
   cube…" alongside swap.

Acceptance: place openuc2.cube.mirror_1x1, unbind it -> the part keeps its
exact pose and cell, becomes UNBOUND, moves in continuous mm, and DRC no
longer claims its cell; generate a holder from the SCHEMATIC panel, accept,
and it is a T3 cube again at the same pose; one undo per step walks the whole
round trip backwards; a chain through the part survives unbinding (the port
names come from the component either way).
```

**For humans:** right now a lens that lives in a cube is stuck in that cube. This
lets you pull the glass out, move it to where the simulation says it should be,
and then print a new holder around it — which is the whole promise of separating
the optics from the mechanics, and the last missing half of it.

### WP-77 — The component editor learns the T3 verb (and stops asking pointless questions)

```
PROMPT (repo: openUC2-OptiKit)

The reported confusion is a real bug plus a real missing action.

1. BUG: the mechanics tab can emit `class: generative` with no `generator:`
   block (model/bindRecord.ts:402-424) — a generative template that names no
   generator can never generate anything. Either emit a generator block or
   refuse the class; never write the dead record. Same for `class: adaptive`
   with zero DOFs (it silently degrades to free movement and exports nothing
   through fx) — warn in the panel and block the save.
2. MISSING ACTION: "generate a holder…" in the component editor, driven by
   the DRAFT's own prescription — the same /v1/generate call and the same
   GenerateHolderDialog preview/accept the assembly uses (WP-61), with
   part_prescription taken from the draft rather than a placed part's pose
   (no placement exists yet, so the cavity is carved at the record's own
   frame). Accept writes template + module and the draft becomes a real cube
   module in the palette.
3. The record-pair chooser collapses. When the mechanics tab is opened on the
   draft you are editing, show ONE line — "mechanics for &lt;draft id&gt;" — with a
   "bind to a different published component…" link that expands the dropdown.
   The current default is already correct; it should not present as a decision.
4. Live focus estimate in the mechanics tab: render paraxialEflMm(surfaces)
   (model/componentRecord.ts:212 — a real 2x2 ABCD walk, already used by the
   optics tab) next to the mesh so you can sanity-check the glass you are
   holding without switching tabs. Show "—" for a reflective stack, where it
   is undefined.
5. Rename per WP-67's confirmed decision if WP-67 lands first; otherwise keep
   the current names and let WP-67 do it once.

Acceptance: opening mechanics on a draft shows one line, not a dropdown;
choosing T3 and pressing "generate a holder…" produces the two halves,
previews them, and accepting yields a template WITH a generator block plus a
module that `library validate` accepts; the EFL readout matches the optics
tab; saving a generative template with no generator is impossible.
```

**For humans:** you asked how to associate T3 from the component editor. The
answer was "you cannot, and the dropdown that implies you can produces a broken
record." This adds the actual verb — press one button and the holder is
generated from the lens you just described — and stops the editor asking you
which component your component is.

### WP-78 — Schematic ergonomics: context menu, copy/paste, chaining that proposes

```
PROMPT (repo: openUC2-OptiKit)

1. Right-click context menu on a placed part (there is no onContextMenu
   handler anywhere in the schematic today): copy · paste · duplicate ·
   delete · open in library (WP-64's deep link) · take out of cube (WP-76) ·
   put in a cube… (WP-61) · swap module… (WP-66). Right-click on empty canvas:
   paste · paste here.
2. Copy/paste/duplicate with keyboard parity (Ctrl/Cmd+C, +V, +D): copies the
   part's libraryRef, ref (uniquified), params, DOF values and rotation —
   NOT its chain membership (a pasted part is unwired). Paste lands at the
   pointer on the active working plane (WP-65's active-layer rule), or offset
   one cell from the original when pasted by keyboard. One undo step per
   paste. Multi-select paste follows if WP-71 lands first; do not block on it.
3. Chaining stops being modal. (a) Inference re-runs on document change
   (debounced) and proposals surface as a one-click "Adopt" chip per proposed
   path — today they are reported as text (ServicePanel.tsx:170-173) while
   inferAndAdoptChains (serviceStore.ts:28) already exists to do the work.
   (b) The manual chain draft shows its own escape hatch: "Esc to cancel ·
   or let inference propose it" instead of only "click further pins, then
   finish". (c) Starting a manual chain when inference already proposes a
   path containing that port offers the proposal first.
   Manual chaining REMAINS — it is the answer to E_AMBIGUOUS_CHAIN, which
   exists precisely because the engine refuses to guess.

Acceptance: right-click a placed lens -> menu with all eight entries, each
working; Ctrl+C/Ctrl+V duplicates it one cell over with its DOF values and
without its chain; placing a part re-runs inference and an "Adopt" chip
appears for the new proposal; clicking Adopt declares the path; a stray pin
click can be escaped without knowing that Esc is the answer.
```

**For humans:** the small stuff that makes the tool feel finished — right-click
menus, copy/paste, and a chaining flow that offers you the answer instead of
demanding you click every pin. Manual chaining stays for the genuinely ambiguous
cases; it just stops being the default experience.

### WP-79 — The lossy channel: frames, apertures and interaction models must travel

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

Three fields are authored carefully and then silently dropped between the
record and the engine. Every one of them is load-bearing for Part 2k's
scenarios.

1. Frame ROTATION. FrameSpec carries an [x,y,z,w] quaternion whose docstring
   says "a tilted frame tilts the beam", and the compiler honours it — but
   library/build.py::_component_ports never reads it (grep: zero `rotation`
   hits in the file) and convert.ts::paletteOpticsOf rebuilds frames as
   {x-mm, y-mm, z-mm}. Consequence: a WP-41 whole-module part whose 45 degree
   mirror you placed with the gizmo SIMULATES AXIS-ALIGNED when placed from
   the palette. Ship `rotation` in the index's port entries and preserve it
   through paletteOpticsOf. Pin with a test that a 45 degree bound mirror
   folds the beam after a palette placement.
2. CLEAR APERTURE. FrameSpec.clear_aperture_mm is populated by the Inventor
   importer, is authored in the bind workbench (`areaDiameterMm`) and then
   NEVER WRITTEN to the record (bindRecord.ts never reads it), never shipped
   in the index, and never checked — geometry/cubify.py::_check_aperture is a
   stub returning []. Close the whole chain: write it, ship it, and implement
   DRC_APERTURE (beam vs clear aperture at each traversed port) using it.
3. INTERACTION MODEL — shared with WP-75 step 2; whichever lands first
   implements it, the other drops the item.

Acceptance: a bound 45 degree mirror placed from the palette folds the beam in
simulation (it does not today); a beam wider than a declared clear aperture
raises DRC_APERTURE naming the component and port; the bind workbench's
diameter field appears in the emitted record.
```

**For humans:** three fields you already fill in by hand get thrown away before
the physics sees them — most visibly, a mirror you carefully placed at 45° is
simulated as if it were flat-on. This makes what you author actually count, and
finally implements the aperture check that has been a named-but-empty rule since
the beginning.

### WP-80 — Rotation DOFs reach geometry

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

A rotation DOF is declarable, validated, firmware-bindable, sliderable,
sendable to a device, and writable by back-annotation — and then the compiler
throws it away: "only translation DOFs move poses yet — ignored"
(compile/compiler.py:258-259). back_annotate can WRITE a rotation dof_value
that the forward path then IGNORES. That is the sharpest asymmetry in the
WP-26/42 chain, and it is why a kinematic mirror or a galvo cannot be
simulated at a tilt.

1. compiler._apply_dof_values gains a rotation branch: rotate the component's
   pose about the DOF's axis, honouring `pivot_frame` (the component frame the
   rotation pivots about) and `surface` (WHICH fragment surface moves, for a
   dual-axis galvo). Both fields exist in DofSpec, are validated by
   check_actuation, ship in the index — and have no geometry consumer today.
2. Per-surface rotation requires breaking the fragment's shared-cs assumption
   (compiler.py:585 overwrites every surface's cs from the entry port). Scope
   it narrowly: a surface named by a rotation DOF's `surface` index gets its
   own rx/ry on top of the traversal's, everything else unchanged.
3. cubify._check_t2_offsets projects the residual ROTATION onto declared
   rotation DOFs the way it already projects translation residuals onto
   translation axes; a T2 with only rotation DOFs stops reporting
   "no translation DOF declared".
4. Frontend: listPartMechanics stops filtering to translations; the assembly
   gets a rotation handle (an arc drag about the pivot) alongside
   InsertHandle; constrainOffsetToTemplate stops collapsing a rotation-only
   T2's offset to zero.
5. fx.py emits `value-deg` for rotation DOFs instead of labelling degrees as
   `value-mm`.

Acceptance: openuc2.cube.galvo with tilt_x = 5 degrees compiles to an optic
whose first mirror is tilted 5 degrees about pivot_x and whose traced beam
deflects by 10 degrees; the second mirror is unaffected; cubify accepts a
rotation residual that fits a declared rotation DOF and flags one that does
not; the optimizer's TILT_UPDATE round-trips through a re-compile.
```

**For humans:** you can declare that a mirror tilts, bind it to firmware, drag
the slider and send the command to hardware — but the simulation has always
pretended the mirror never moved. This connects the last wire, which is what
makes a galvo or a kinematic mount mean anything in the ray trace.

### WP-81 — Beam-aware generators: the optical axis as a boolean

```
PROMPT (repo: optikit-core)

Round 9 asked for "the optical axis as an additional boolean subtraction" and
it is genuinely absent. boolean_holder_1x1 subtracts exactly three things:
the clearance-offset part solid, M3 through-holes, M3 tap pockets. With the
default 30 mm body a lens is sealed inside solid material — the printed holder
blocks its own optical axis. round_optic_insert_1x1 DOES cut a through-bore
and plate_nxm cuts per-cell apertures, so the idea exists; the freeform holder
just never got it.

The blocker is plumbing, not geometry: pose_params_from_component passes ONLY
position and rotation, the params schema is additionalProperties: false, and
TemplateRecord.optical_ports has no reader in generate/ or generators/.

1. Generator params gain an optional `beam:` block — {axis: [x,y,z],
   through_point_mm: [x,y,z], diameter_mm, both_ways: bool} — schema'd and
   validated like every other param.
2. The harness derives it from the record when not given explicitly: the
   component's port directions + frames + clear_aperture_mm (WP-79 makes the
   aperture actually available) become the bore axis and diameter. A part with
   two collinear ports gets one through-bore; a fold gets one bore per arm.
3. boolean_holder_1x1 cuts the bore(s) after the part cavity and before the
   split, and the meta records what it cut so the review flag can say so.
4. Guard rail: a bore that would leave a wall thinner than 1 mm, or that
   breaks the holder into disconnected pieces, is a typed error naming the
   port — not a silently unprintable part.

Acceptance: the AC254-050-A holder gains a clear through-bore at the optic's
clear semi-diameter and light can physically pass; a 45 degree fold mirror's
holder gets two bores meeting at the mirror; a bore that would undercut the
body raises the typed error; existing holders regenerate to a NEW cache key
(the geometry changed) and still fit the 50 mm envelope.
```

**For humans:** the holders we print right now would work fine except that they
have no hole for the light to go through. This carves the beam path out of them,
derived from the record's own ports rather than typed in by hand.

---

## Order and dependencies

| Phase | Packages | Why |
|---|---|---|
| Physics first | **WP-74** spectral response | Blocks the filter/dichroic seeds; everything spectral is wrong until it lands |
| Make authored data count | **WP-79** lossy channel · **WP-80** rotation DOFs | Both are "you already authored this and we throw it away"; WP-79 also unblocks WP-81 |
| The verbs | **WP-76** unbind/re-hold · **WP-77** editor T3 | The two questions from this round that are pure capability |
| Mechanics quality | **WP-81** beam bore · **WP-75** optics groups | WP-81 needs WP-79's aperture; WP-75 needs WP-67 for the barrel |
| Ergonomics | **WP-78** context menu, copy/paste, chaining | Independent, can slot anywhere |

Relationship to earlier packages: **WP-67** (housing without a cube, already
specced in Part 2j) is a hard prerequisite for WP-75's objective barrel and
should move up with it. WP-75 step 2 and WP-79 step 3 are the same change —
whichever lands first implements it. WP-76 builds directly on WP-66's
`swapPartModule`. WP-77 reuses WP-61's dialog verbatim. The Part 2j review's
open structural question — a `cube_module` binding ONE component and ONE
template — is **not** raised by this round: an objective is one optics group in
one barrel, which the current shape already fits. It stays open for the
two-independent-optics-in-one-cube case and still wants a ratification call with
Ethan.

E2 asks this round: **one new.** WP-74's `response:` block is a fragment-surface
extension that the Go side will round-trip through `extra="allow"` but should
know about, since it changes which chains are legal.

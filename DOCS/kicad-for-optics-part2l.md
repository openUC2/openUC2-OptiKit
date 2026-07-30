# Part 2l · Feedback round 11 (2026-07-29) — optiland import, the part inspector, and a bug sweep

Continues `kicad-for-optics-part2k.md`. Collected while driving the editor
through the real scenarios: an optiland-import wish, a beam-path scripting wish,
a cluster of concrete bugs, and several "I expected to see X" gaps. WP numbering
continues at **WP-87** (WP-82a is an amendment to WP-80, not part of this run).

These slot into the MVP phases of `kicad-for-optics-roadmap.md`, **before** the
UX/community phase — the bug sweep (WP-92) is high-priority alongside Phase 1's
correctness work; the rest are Phase 2–3 workflow and part-first items.

> **Coordination note:** a parallel session is implementing Phase 6 (WP-71
> grouping, WP-86 hardware write-back). Nothing here touches those files.

---

## Answers first (things that are answers, not work)

### "Do we still need ports in the frontend? I haven't fully understood the concept."

**Keep them — they are the pins, and the KiCad analogy is exact.** A port is
one end of a beam connection: a named point on a component, with a direction and
a clear aperture, that the netlist connects to another component's port. In
KiCad terms `interfaces()`/ports = the symbol's **pins**, the fragment surfaces
= the footprint pads, the housing mesh = the courtyard.

Four things in the engine would break without ports, so they are not cosmetic:

1. **Chain inference** walks port-to-port — a source's `out` port emits a ray
   that snaps to the port facing it (`chain/infer.py`). No ports, no netlist.
2. **Compilation** unfolds the path by traversing `port_in>port_out` pairs; the
   `after-surface` on a port is what tells the compiler which fragment surface a
   beam leaves after.
3. **WP-74's spectral gate** reads the port *role* (`reflected`/`transmitted`)
   to decide which arm a dichroic passes — because a 45° fold makes both exits
   geometrically identical, the port name is the only signal.
4. **The fold geometry** (a mirror's reflected arm) is the reflected *port's*
   direction; WP-82a will derive it from the surface normal, but the port is
   still where the beam leaves.

What is fair is that ports are **under-explained in the UI**. That is a UX
clarity item, not a removal: WP-89 puts the port list into the part inspector
(what each port is, where it faces, its aperture) so the concept becomes visible
instead of implicit. Ports stay; we make them legible.

### "main.py step_infer snaps within 20° — why not 45°? After flattening isn't everything within ~20°?"

`ANGLE_TOL_DEG = 20°` (`chain/infer.py:39`) is the **facing tolerance** for
snapping a chief ray to a port. Your intuition is right and it is exactly why
20° is the correct number, not 45°: after grid placement, ports are axis-aligned,
so a port the beam actually hits is either **~0° off** (aligned, the real
target) or **≥90° off** (a perpendicular port that is not in the beam at all).
There is a wide empty band between them. 20° sits in that band: generous enough
to tolerate a small residual tilt (a WP-80 rotation DOF, a fabrication error, a
gizmo-placed datum a couple of degrees off) without ever matching a
perpendicular port. **45° would start matching ports that are not really in the
beam** — a mirror's side port, an adjacent cube's face — and produce bogus
chains. So 20° is deliberately tight, and the same constant is the compiler's
`advance_to` facing check so inference and compile agree.

### "Can the source be multispectral / have multiple lines? Add a representation."

**Already multi-line in the datamodel** — `SourceSpec.wavelengths_um` is a
*list* (WP-47), so a laser can declare `[0.488, 0.561, 0.640]` and a placement
picks the active one (`CompSpec.wavelength-um`). What is missing is the
*representation*: a UI to see all the lines a source carries, pick the active
one, and — the real gap — simulate a path at **every** line at once (a
fluorescence design cares about excitation AND emission through the same optics).
That is WP-91's source-lines item.

### "How do I add the Inventor parts to `openuc2.source.laser_488`? I have the assembly (laser in a housing, held by an insert in the cube) in Inventor."

Today that record is **optics only** — frames + ports + the emission line, no
mechanics. Two roads, both already on the roadmap:

- **The housing is a bare template (WP-67):** author a `mechanical_template`
  that carries your Inventor STEP/GLB (the laser body + mount) and reference the
  component from it (`template.component`). This is the "housing without a cube"
  path — the part places on the grid with its real mesh, no cube required.
- **Attach the Inventor files onto the record (WP-84):** in the Parts editor,
  load the STEP/GLB and "attach Inventor files" — the mechanics land on the
  existing record id, the optical model untouched (you said this is fine, the
  optics don't change). If it should also become a grid cube, "package as a cube
  module" hands the STEP to the T3/T2 flow.

The one missing convenience: a **YAML-side** way to say "here is the STEP for
this component" without the workbench. WP-90 adds a `mechanics:` reference the
Parts editor writes, so hand-authored records can point at their Inventor assets.

### "I imported the AC254-075-A zmx and placed it freely — great. After generating a holder I expected to see the holder + cube, and to see the lens in the Parts editor."

Both expectations are right and mostly work — with two bugs in the way:

- **The lens DOES appear in the Parts editor** (your screenshot shows
  `thorlabs.lens.ac254-075-a-ml` in the published list). Good.
- **The holder + cube not appearing** is almost certainly the **WebGL context
  loss** bug (WP-92): after the holder-preview canvas mounts, the main scene's
  GL context is lost and the assembly stops rendering until a reload. So the
  cube *is* created (the records are written) but the canvas is dead. Fixing the
  context loss should make the new cube appear.
- **Matching it with a lens template (Inventor or CadQuery):** the T3 holder is
  the CadQuery road (done). The Inventor/adaptive **T2** road — "fit this lens
  into the master insert, parameterized by its prescription" — is WP-85, and
  WP-90 makes the Parts editor's mechanics tab offer a *template class* choice
  (T2 · adaptive) that routes there.

---

## Work packages

### WP-87 — Import an Optiland setup: a system JSON becomes free primitives

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

The zmx importer turns ONE lens into a component. This turns a whole Optiland
SETUP (its serialized system JSON — a source, a surface stack, an image) into
a set of PLACED FREE PRIMITIVES on the schematic, so a user can import an
existing optical design and then cubify it piece by piece.

1. Core: `importers/optiland_setup.py::setup_to_components(optic_json) ->
   list[ComponentRecord] + a placement plan`. Split the serialized
   surface_group into optical elements (a contiguous glass group = one lens
   component, a reflective surface = a mirror, the object/image planes = the
   source/detector), each a normal optical_component with NO template
   (T-class unbound). The placement plan carries each element's z along the
   axis, so the frontend drops them in a straight line matching the design.
   Reuse the WP-62 grouping logic (a material change with no air gap is one
   element) and the zmx importer's material normalization.
2. Each imported primitive becomes a TEMPORARY workspace component (browser-
   local, like a draft) that the user can promote permanently ("save to
   library") one at a time or all at once — nothing is written to the shared
   library without an explicit accept.
3. Frontend: an "import Optiland setup…" wizard (in the Parts editor's
   import menu and the schematic File menu): drop the JSON → preview the
   parsed elements (a row per element: kind, EFL/curvature, the surfaces) →
   place them all as unbound primitives on the schematic in their axial
   order. They are ordinary WP-60 unbound parts from that moment: movable in
   continuous mm, chainable, simulatable, and cubifiable via "generate a
   holder" — the T-class binding happens ONLY after the user cubifies, never
   at import.
4. Round-trip sanity: importing Optiland's own serialization of the golden
   fluo-scope's compiled optic and re-simulating it must reproduce the same
   paraxial numbers (the import is lossless w.r.t. the prescription).

Acceptance: drop a two-lens relay's Optiland JSON → two unbound lens
primitives appear on the schematic at the right spacing, chain laser→L1→L2→
camera, and simulate; each can be saved to the library and given a holder;
nothing is written to the shared library until accepted.
```

**For humans:** you already have optical designs in Optiland — this imports one
wholesale as a row of loose lenses and mirrors you can then arrange on the grid
and turn into cubes, instead of re-authoring every element by hand.

### WP-88 — Script the beam path: a sequential authoring mode

```
PROMPT (repo: openUC2-OptiKit, thin core support)

Optiland and PyOpticL let you BUILD a system in code, sequentially — add a
source, then a lens 40 mm downstream, then a mirror. Offer the same for the
schematic: a text/script pane that authors the design programmatically, as
an alternative to dragging.

1. A small, safe DSL (NOT arbitrary JS): line-oriented commands mirroring the
   Optiland/PyOpticL vocabulary — `source 488nm`, `lens f=50 @ +40mm`,
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

### WP-89 — The part inspector shows the optics (and makes ports legible)

```
PROMPT (repo: openUC2-OptiKit)

Clicking a placed part shows its POSE today, but none of its OPTICS. Surface
the optiland facts so the schematic answers "what is this lens?" without
opening the Parts editor.

1. On selection, an "Optics" section in the property panel (schematic AND
   assembly) reads the part's record (via the index component/module) and
   shows: effective focal length, clear aperture / diameter, per-surface
   radius · thickness · material · conic, the substrate/element count, and
   for a source its emission line(s), for a detector its sensor size — i.e.
   everything the record's fragment + frames carry. A tiny ray-sketch
   thumbnail (reuse the component editor's `RaySketch`) sits alongside.
2. PORTS become legible (the answer to "do we need ports?"): a compact port
   list — name, which way it faces, its clear aperture, its role
   (entry/exit/reflected/transmitted) — so the KiCad-pin concept is visible.
3. Everything is READ-ONLY here with a "edit in Parts…" deep link (WP-64's
   ?open= link) — the inspector explains, the editor changes.
4. For an unbound primitive the same facts come from the record's own
   fragment (WP-60 already ships it in the index); for a cube module they come
   from the resolved component. One code path over the index.

Acceptance: click a placed AC254-075 lens → the panel shows EFL 74.9 mm,
Ø25.4, its 3 surfaces with radii/materials, and a ray sketch; click the
dichroic → its cut-on and the front/reflected/transmitted ports with their
directions; the numbers match the record YAML.
```

**For humans:** click a lens and actually see it's a 75 mm achromat with these
three glass surfaces — the optical properties, right there in the schematic,
instead of a bare position readout. And the ports finally explain themselves.

### WP-90 — Parts editor: per-category authoring, substrates, rectangular apertures

```
PROMPT (repo: openUC2-OptiKit, schema note to core)

The Parts editor's optiland fields do not adapt to the category, and a mirror
cannot express a substrate or a rectangular aperture. Fix the authoring model
so every optic can be described honestly.

1. Category-driven fields: selecting "mirror" in the optics tab must change
   the surface fields — a mirror needs a SUBSTRATE (a reflective front
   surface + a thickness + a back surface / material), not the lens biconvex
   default. Today the fields do not change (screenshot). Each category
   (lens/mirror/filter/beamsplitter/dichroic/window) seeds the right surface
   stack and shows the fields that matter for it (a mirror: reflectivity band
   via WP-74 `response`, substrate thickness, coating; a filter: transmit
   band; a lens: radii/conic/material).
2. Rectangular apertures: a surface's clear aperture may be circular
   (diameter) OR rectangular (width × height) — Optiland supports both. Add
   the aperture-shape choice to the surface row and the frame's
   `clear-aperture-mm`; carry it through the fragment (Optiland's own
   aperture serialization) and DRC_APERTURE (WP-79).
3. A `mechanics:` reference on the record (schema note to Ethan): a component
   may name its housing template directly, so a hand-authored record (the
   laser_488 case) can point at its Inventor STEP without going through the
   workbench. The mechanics tab writes it.
4. Template-class routing: the mechanics tab's "template class" choice (T1
   fixed / T2 adaptive / T3 generative) routes correctly — T3 → generate a
   holder (WP-77, done), T2 → the Inventor master insert (WP-85), T1 → attach
   an existing Inventor cube (WP-84). No dead records (WP-77 already refuses a
   generative template with no generator; extend the guard to T2).

Acceptance: pick "mirror" → the fields become a substrate (front reflective +
thickness + back), not a biconvex lens; author a rectangular-aperture fold
mirror and it validates + simulates; a lens with a chosen T2 class offers the
Inventor-insert route; a hand-authored record can name its housing STEP.
```

**For humans:** when you pick "mirror" the editor should ask you about a
mirror — a reflective surface on a substrate — not show you a lens's two radii.
And a beam-fold mirror is often rectangular, which the tool cannot say today.

### WP-91 — Library UX: list view, and multispectral sources

```
PROMPT (repo: openUC2-OptiKit)

1. The schematic palette gets a VIEW TOGGLE: the current icon grid, plus a
   compact LIST view (small icon + name + key facts: category, T-class, EFL/
   Ø, vendor) for scanning many parts. The Parts editor's published list is
   already list-shaped; unify the two so the palette can be either.
2. Multispectral source representation: a source that declares several
   `wavelengths_um` lines shows them all in the property panel with a picker
   for the ACTIVE line (WP-47 stores it), plus a "simulate all lines" option
   that traces the path once per line and overlays the spot per wavelength —
   the fluorescence case (excitation + emission through the same optics) that
   a single active line cannot show.

Acceptance: toggle the palette to list view and back; a placed 3-line laser
shows all three lines with the active one selectable, and "simulate all"
returns a spot per line.
```

**For humans:** a list view for when the icon grid gets crowded, and a source
that emits three colours should look like it emits three colours — with the
option to trace them all at once.

### WP-92 — Editor bug sweep, round 2

```
PROMPT (repo: openUC2-OptiKit — bugs found in real use)

Five concrete defects, each with a repro:

1. WebGL CONTEXT LOSS after the holder preview. Generating an insert mounts
   the GenerateHolderDialog's 3D preview canvas; afterwards the main
   schematic/assembly canvas logs "THREE.WebGLRenderer: Context Lost" and
   stops rendering until a reload/tab-switch. Root cause: too many live WebGL
   contexts (each R3F <Canvas> is one; the browser caps ~8–16). Fix: the
   dialog's preview must share/dispose its context — render the preview in the
   SAME canvas or tear it down on close (dispose the renderer, useGLTF cache),
   and/or gate the preview behind an explicit "show 3D" so it is not a second
   permanent context. Verify: generate a holder, accept, and the assembly
   keeps rendering with no reload.
2. DECIMAL COMMA in number inputs. Typing "0,15" (German locale) into a
   number field (clearance in GenerateHolderDialog, thickness/radius in
   SurfacesTable) yields NaN, while the same value loads fine from JSON. Fix:
   parse locale decimals (accept "," as "."), or use a text input with a
   tolerant float parser, everywhere a physical number is entered. Values must
   round-trip as floats.
3. YAW SNAPS with snap OFF. Rotating an unbound lens (bd_any_lens_1x1) snaps
   the rendered orientation to N·90° even with snap-yaw disabled, though the
   stored pose is correct (yaw 55° = discrete +90° + residual −35°,
   `mapping.ts::splitDocYaw`). The residual yaw is not applied to the RENDERED
   glyph for a part with no cube shell (the shell/insert split assumes a
   cube). Fix: an unbound/template-less part renders at its FULL world yaw
   (discrete + residual), not the snapped shell orientation. Verify: type
   yaw 55 on an unbound lens → it visibly sits at 55°, not 90°.
4. INTERFACE PARTS (puzzle/plate) still invisible. WP-64 added
   `interfaceKindOf` + `InterfaceGlyph`, but a placed miniframe's puzzle
   joints still render as generic ghosts (screenshot). Investigate: does
   `interfaceKindOf` match the joint records' libraryRef
   (openuc2.cube.puzzle_1x1 / the group's joint_module), and does the ghost
   cube (no template mesh) render ON TOP of the glyph and occlude it? Fix so a
   placed group visibly reads as cubes + plates + joints. Verify on the
   miniframe-brightfield group.
5. GENERATED CUBE does not appear after holder-accept. Likely a consequence
   of (1); confirm that with the context-loss fixed, accepting a holder shows
   the new T3 cube in the assembly without a reload (the records are written;
   the canvas was dead).

Acceptance: all five reproduce before, pass after; tsc + vitest + lint clean
(lint stays at ZERO per WP-69).
```

**For humans:** the paper-cut bundle — the canvas dying after you make a holder,
commas breaking number fields on a German keyboard, a lens snapping to 90° when
you told it not to, the puzzle pieces you still can't see, and the cube that
doesn't show up until you reload. Individually small, together the difference
between "demo" and "tool".

---

## Where these slot into the roadmap

| Package | Roadmap phase | Rationale |
|---|---|---|
| **WP-92** bug sweep | with Phase 1 (correctness) | daily-use blockers; the WebGL loss makes the holder flow look broken |
| **WP-89** part inspector | Phase 2 (the verbs, in the UI) | pairs with the WP-76/77 verbs; makes optics visible |
| **WP-90** Parts authoring | Phase 3 (part-first) | extends WP-67/WP-77; honest per-category optics |
| **WP-87** Optiland import | Phase 3–4 (part-first + CLI→UI) | a third import road beside zmx (WP-82) and glb |
| **WP-88** beam scripting | Phase 4 (ergonomics, with WP-78) | an authoring surface alongside drag + inference |
| **WP-91** library UX | Phase 4 (ergonomics) | palette polish; multispectral representation |

All land **before** Phase 7 (community/accounts/UX), per the instruction.

E2 asks this round: **one** — WP-90's `mechanics:` reference on a component
record (a component naming its housing template directly). Additive; Go
round-trips it through `extra="allow"`.

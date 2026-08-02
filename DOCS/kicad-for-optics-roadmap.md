# OptiKit — the MVP roadmap: Scenarios 1–5, end to end through the UI

**Consolidates** the open packages from `kicad-for-optics-part2j.md` (WP-67, 70,
71, 55, 56, 59, 72, 73) and all of `kicad-for-optics-part2k.md` (WP-74…81),
plus the new packages this round adds (WP-82…86), into ONE dependency-ordered
sequence. The verbatim per-WP prompts still live in 2j/2k and the main ledger
(`kicad-for-optics-execution.md`); this file is the map that says **what to
build, in what order, and why** — so that when it is done a user can drive every
one of the five scenarios through the editor, then simulate → optimise → cubify
→ produce.

**Status date:** 2026-07-29. Everything through **WP-86** has landed (Parts
2a–2k: the physics-correctness round, the verbs, part-first, the Inventor loop,
hardware write-back, grouping). Open: Part 2l's **WP-87…92** and Part 2m's
**WP-93…95**, then Phase 7. This roadmap is the work *from here to the MVP*.

---

## 0a. The schedule — milestones M0…M10

Eleven milestones covering **every** work package, past and coming. M0–M7 are
delivered; **M8 + M9 are the MVP finish line**; M10 is deliberately after it.

> Dates: M0–M7 are the actual delivery dates from the ledger (compressed —
> they were AI-paced implementation sessions). M8–M10 are **estimates in
> working weeks** for a human-paced team; treat the ordering as firm and the
> durations as provisional.

```mermaid
gantt
  title OptiKit — road to the MVP (M8/M9 = finish line)
  dateFormat YYYY-MM-DD
  axisFormat %b %d

  section M0 · foundations
  schema · engine · service · editors (WP-1…33)   :done, m0, 2026-07-12, 4d

  section M1 · library & T-classes
  records · palette · T1/T2/T3 · actuation (WP-34…48) :done, m1, 2026-07-16, 4d

  section M2 · design tooling
  BOM · groups · carriers · fibers · STEP export (WP-50…58) :done, m2, 2026-07-20, 6d

  section M3 · free placement
  unbound symbols · T3 holders · prescription solids (WP-60…62) :done, m3, 2026-07-26, 2d

  section M4 · correctness & cleanup
  materials 500 · layers · modules panel · starter lib · legacy sweep (WP-63…69, 71) :done, m4, 2026-07-27, 1d

  section M5 · physics lossless
  spectral response · lossy channel · rotation DOFs (WP-74, 79, 80, 82a) :done, m5, 2026-07-28, 1d

  section M6 · verbs & part-first
  unbind · editor T3 · beam bore · optics groups · housings · refs (WP-75,76,77,81,67,83) :done, m6, 2026-07-28, 1d

  section M7 · reach & Inventor loop
  import UI · ergonomics · round-trip · T2 bridge · hardware (WP-82,78,84,85,86) :done, m7, 2026-07-29, 1d

  section M8 · workflow polish
  bug sweep round 2 (WP-92)                        :active, m8a, 2026-07-30, 5d
  part inspector · optics visible (WP-89)          :m8b, after m8a, 5d
  Parts authoring · multi-axis T2 (WP-90)          :m8c, after m8b, 7d
  Optiland setup import (WP-87)                    :m8d, after m8c, 5d
  beam-path scripting (WP-88)                      :m8e, after m8d, 7d
  palette list view · multispectral (WP-91)        :m8f, after m8e, 4d
  MILESTONE M8 — the editor is pleasant            :milestone, m8done, after m8f, 0d

  section M9 · MVP proven
  virtual detectors / probes (WP-94)               :m9a, after m8done, 7d
  optimizer: free poses · constraints · re-hold (WP-93) :m9b, after m9a, 10d
  benchmark suite: fluo · light-sheet · confocal (WP-95) :m9c, after m9b, 10d
  MILESTONE M9 — MVP PROVEN (3 instruments green)  :milestone, mvp, after m9c, 0d

  section M10 · post-MVP
  publish loop · docs sideload · viewer (WP-70,55,56) :m10a, after mvp, 14d
  OSHWLab phases · accounts ADR (WP-59, 72)        :m10b, after m10a, 14d
  UX overhaul (WP-73)                              :m10c, after m10b, 21d
```

### Milestone definitions

| # | Milestone | Exit criterion | Packages |
|---|---|---|---|
| **M0** | Foundations | a `.dsn` validates, flattens, compiles, simulates; both editors render | WP-1…33 |
| **M1** | Library & T-classes | records drive the palette; T1/T2/T3 enforced; actuation contract | WP-34…48 |
| **M2** | Design tooling | live BOM, groups/carriers, fibers, STEP assembly, community mount | WP-50…58 |
| **M3** | Free placement | an unbound optic places freely and gets a generated holder | WP-60, 61, 62 |
| **M4** | Correctness & cleanup | simulate works; layers; module swap; starter library; lint at zero | WP-63…69, 71 |
| **M5** | Physics lossless | authored data reaches the engine; the right physics runs | WP-74, 79, 80, 82a |
| **M6** | Verbs & part-first | unbind/re-hold; editor-side T3; housings; beam bore | WP-75, 76, 77, 81, 67, 83 |
| **M7** | Reach & Inventor loop | CLI reachable from the UI; the T2/T1 Inventor round trip; hardware write-back | WP-82, 78, 84, 85, 86 |
| **M8** | **The editor is pleasant** | no daily-use paper cuts; optics visible on click; every optic authorable honestly; three import roads | WP-92, 89, 90, 87, 88, 91 |
| **M9** | **MVP PROVEN** | fluorescence + light-sheet + confocal all design→simulate→optimize→cubify→produce, green in CI | WP-94, 93, 95 |
| **M10** | Post-MVP | community loop, accounts, the UX overhaul | WP-70, 55, 56, 59, 72, 73 |

**The gate that matters is M9.** M8 makes the tool pleasant; M9 *proves* it — when
the three benchmark instruments pass end to end, every one of Scenarios 1–5 has
been exercised by a real design, not a demo.

---

## 0. The North Star

A user can, entirely in the browser:

1. **get an optic in** by any of five roads (author it, import a `.zmx`, assign
   optics to a STEP, import an Inventor cube, or import an Inventor cube with
   moving axes);
2. **place it freely** on the schematic as a primitive, with no cube yet;
3. **wire and simulate** the optical circuit (chain inference + Optiland);
4. **optimise** the free parameters;
5. **cubify** — snap each optic into a real cube module, generated (T3),
   parametric (T2), or fixed from Inventor (T1);
6. **produce** — BOM, STEP assembly, printable holders, firmware.

Everything below is scoped to make exactly that true. Anything that is not on
that path (accounts, the public website, the OSHWLab social layer) is
explicitly deferred to the last phase.

### The five scenarios, and what each still needs

| Scenario | One line | Works today | Remaining packages |
|---|---|---|---|
| **1 — pure primitive** | author a lens/mirror by its numbers, place it, wrap it in a cube | author ✅, place ✅, T3 wrap ✅ | T2 wrap (WP-85), editor-side T3 (WP-77), black-box paraxial (WP-75) |
| **2 — housed device** | a galvo/laser STEP with optics assigned, on the grid | assign optics ✅ | mesh travels with a free part (WP-67), beam bore (WP-81), Inventor round-trip (WP-84), moving axes (WP-80), lossy frames (WP-79) |
| **3 — Optiland import** | `.zmx` / base-class primitive → part | `.zmx` engine ✅ (CLI only) | import UI (WP-82), per-class T2 insert (WP-85) |
| **4 — Inventor T1 cube** | predesigned cube → fixed module | ✅ (CLI) | import UI + viewer (WP-82) |
| **5 — Inventor variable axes** | T1 cube whose optic moves | translations ✅ | rotation DOFs reach geometry (WP-80), the T2 Inventor bridge (WP-85), hardware write-back (WP-86) |

The through-line: **almost every scenario is blocked by the same handful of
plumbing gaps** (authored data not reaching the engine, verbs living in only one
view, CLI power not reachable from the UI). Fix those first and four scenarios
light up at once. That is why the phases are ordered by *how many scenarios each
unblocks*, not by scenario number.

---

## 1. How everything fits together

The integration model, from "where an optic comes from" to "a built instrument".
The five scenarios are the five entry arrows on the left; they all converge on
one **optical component** (the symbol), which is placed **freely** on the
schematic, then **bound** into a cube by one of three template classes, then
**produced**.

```mermaid
flowchart TB
  classDef inlet fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
  classDef record fill:#fff3e0,stroke:#ef6c00,color:#e65100
  classDef design fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
  classDef produce fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c
  classDef gap fill:#ffebee,stroke:#c62828,color:#b71c1c

  subgraph INLETS["① get an optic in — the five roads"]
    S1["S1 · author by numbers<br/>Ø · R · thickness · glass<br/><i>component editor, optics tab</i>"]:::inlet
    S3["S3 · import Optiland<br/>.zmx / base class<br/><i>WP-82 import UI</i>"]:::inlet
    S2["S2 · assign optics to a STEP<br/>galvo · laser · kinematic mount<br/><i>mechanics tab (bind)</i>"]:::inlet
    S4["S4 · import Inventor cube<br/>datum markers → T1<br/><i>WP-82 import UI</i>"]:::inlet
    S5["S5 · Inventor cube + moving axes<br/>δz · tip/tilt<br/><i>WP-80 · WP-85</i>"]:::inlet
  end

  COMP[("optical_component<br/><b>the SYMBOL</b><br/>surfaces · frames · ports · response<br/><i>Optiland-serialized fragment</i>")]:::record
  HOUS[("mechanical_template<br/><b>the HOUSING</b><br/>STEP/GLB · envelope · DOFs<br/><i>footprint OR bare (WP-67)</i>")]:::record

  S1 --> COMP
  S3 --> COMP
  S2 --> COMP
  S2 --> HOUS
  S4 --> COMP
  S4 --> HOUS
  S5 --> COMP
  S5 --> HOUS

  COMP -->|"WP-60 UNBOUND<br/>+ mesh travels (WP-67)"| PLACE["② place FREELY on the schematic<br/>continuous mm · no grid claim · no cube yet<br/><i>the optical circuit / 'schematic'</i>"]:::design

  PLACE --> SIM["③ chain + simulate<br/>inference (spectral-aware, WP-74)<br/>Optiland trace"]:::design
  SIM --> OPT["④ optimise free params<br/>δz · tilt · spacing"]:::design
  OPT -->|"back-annotate"| PLACE

  PLACE -->|"⑤ cubify — pick a template class"| BIND{"how are the<br/>mechanics made?"}:::design

  BIND -->|"T3 · generate"| T3["boolean holder around the optic<br/>+ optical-axis bore (WP-81)<br/><i>'generate a holder…' both editors (WP-76/77)</i>"]:::produce
  BIND -->|"T2 · parametric"| T2["Inventor master-insert<br/>fx params ← prescription<br/><i>WP-85 PyInventor bridge</i>"]:::produce
  BIND -->|"T1 · fixed"| T1["Inventor cube, as-is<br/><i>WP-82 · WP-84 round-trip</i>"]:::produce

  T3 --> MOD[("cube_module<br/>a real openUC2 cube on the grid")]:::record
  T2 --> MOD
  T1 --> MOD

  PLACE -.->|"unbind (WP-76)<br/>cube → free primitive"| COMP

  MOD --> ASM["⑥ assembly on the 50/50/55 grid<br/>DRC · groups · carriers"]:::design
  ASM --> PROD["⑦ produce<br/>BOM · STEP assembly · printable halves · firmware"]:::produce
  PROD -.->|"⑧ build it, then measure it<br/>calibration write-back (WP-86)"| PLACE
```

Three things this picture makes explicit, and that the work packages exist to
enforce:

- **The symbol is the hub.** Every road produces the same `optical_component`;
  everything downstream (place, simulate, cubify) only ever sees the symbol. A
  Thorlabs KM05 and a printed holder are interchangeable because the beam only
  touches the optic at its datum — that is the property WP-76/77/81 protect.
- **"Freely placeable" and "in a cube" are two states of one part**, connected
  by two inverse verbs: **cubify** (WP-61, shipped) and **unbind** (WP-76). Both
  are one undo step; the round trip is the whole "KiCad for optics" claim.
- **Any part reaches the grid.** A bare housing (Thorlabs laser body, kinematic
  mount) is not an exception — it is placed as a symbol whose mesh travels
  (WP-67), then either gets a generated T3 holder or is exported at its
  cube-relative pose for an ME to build the module around and re-attach (WP-84).
  **No part is left off the grid.**

---

## 2. The phases

Ordered by dependency and by scenario-unblock count. Phases 1–6 are the MVP;
Phase 7 is explicitly after it.

### Phase 1 — Make authored data correct and lossless *(blocks all five scenarios)*

Nothing above the datamodel can be trusted until what the user authors actually
reaches the engine, and until the physics the engine runs is the right physics.
These three are prerequisites for everything and are mostly mechanical.

- **WP-74 — Spectral & polarization response** *(the physics gate; do first)*.
  A `response:` block on a fragment surface (`kind`, `reflect_bands_um`,
  `transmit_ratio`, `polarization_deg`); consumed by inference pruning
  (a 505 nm dichroic's reflected arm is not proposed at 488 nm), a filter-stack
  compatibility check, and a **photon budget** (how much light reaches the
  sensor — the BOM analogue). Wavelength gating is implemented; Jones is
  declared only. Ships the filter + dichroic reference seeds. *Full prompt:
  2k WP-74.* **Unblocks:** every fluorescence and BB84 design; scenario-agnostic.

- **WP-79 — The lossy channel: authored data must travel.** Three fields are
  authored and then silently dropped between record and engine: frame
  **rotation** (a bound 45° mirror simulates axis-aligned — the index and
  `paletteOpticsOf` drop the quaternion), **clear aperture** (authored in the
  bind workbench, never written; `DRC_APERTURE` is a stub), and the
  **interaction model** (hardcoded to `RefractiveReflectiveModel`). Ship all
  three through the index and preserve them through placement; implement
  `DRC_APERTURE`. *Full prompt: 2k WP-79.* **Unblocks:** S2 (assigned mirror
  poses), S4/S5 (Inventor frames), and honours the "don't lose Optiland detail"
  principle directly.

- **WP-80 — Rotation DOFs reach geometry.** ✅ *done (`6265e9b` + `5e5aba7`).*
  A rotation DOF is declarable, validated, firmware-bindable, sliderable,
  sendable, and *back-annotation can write one* — but the compiler dropped it
  (*"only translation DOFs move poses yet"*). The rotation branch, the cubify
  residual-tilt projection, `value-deg` in fx, and the panel counterparts
  landed. *Full prompt: 2k WP-80.* **Unblocks:** S5 (a galvo/kinematic mirror
  that actually tilts in the trace).

- **WP-82a — Reflection from normals: a tilted mirror deviates by 2θ.**
  *(carved out of WP-80 during implementation — the remaining Phase-1 item.)*
  WP-80 delivers a **rigid θ rotation**, which is correct for a refractive
  tilt, a tip/tilt platform and a rigid kinematic mount — but wrong by a factor
  of two for a **reflective** surface, and it leaves `DofSpec.surface` (which
  mirror of a dual-axis galvo a DOF drives) still inert. The reflection law
  already exists in the repo as a *validator* (`library/derive.py`, WP-40);
  this promotes it to the geometry source whenever a reflective element is off
  its nominal pose, and gives DOF-named surfaces their own tilt. Sharpest
  motivation: the browser's fast 2D preview **already applies 2θ**, so the
  approximation and the "authoritative" trace disagree today — and the
  approximation is the correct one. *Full prompt: 2k, amendment section.*
  **Unblocks:** S5 properly (independent galvo axes), and restores
  preview↔trace agreement.

### Phase 2 — The core verbs, in the UI where the user stands *(S1, S2, S3)*

The capabilities that exist but live in the wrong place, plus the one genuinely
missing verb.

- **WP-76 — The unbind verb: take the optic out of the cube.** The inverse of
  WP-61's cubify. `unbindPart(partId)` re-points the placed part at its module's
  component (reusing WP-66's `swapPartModule` machinery) — same pose, becomes a
  free UNBOUND primitive, one undo. "generate a holder…" moves to **both**
  editors (today it is Assembly-only). Completes the *unbind → move → re-hold*
  round trip. *Full prompt: 2k WP-76.* **Unblocks:** the S1/S2 "place any
  primitive freely even if it lives in a fixed cube" ask.

- **WP-77 — The component editor learns T3 (and stops asking pointless
  questions).** Fixes the real bug behind "how do I associate T3?" — the
  mechanics tab emits a `generative` template with *no generator block* (a dead
  record). Adds "generate a holder…" driven by the draft's own prescription
  (same `/v1/generate`), collapses the record-pair chooser to one line when the
  answer is the draft you are editing, refuses to save a generative template
  with no generator, and renders the live `paraxialEflMm` focus estimate in the
  mechanics tab (the "quick lensmaker focus" ask). *Full prompt: 2k WP-77.*
  **Unblocks:** S1 authored-lens → cube from the editor.

- **WP-81 — Beam-aware generators: the optical axis as a boolean.** The T3
  holder currently seals its own beam path — it subtracts the part cavity and
  M3 features but *no bore*. Pass ports/directions/aperture into generator
  params (they never reach a generator today) and cut the optical-axis
  channel(s), derived from the record's own ports + WP-79's aperture.
  *Full prompt: 2k WP-81.* **Unblocks:** S1/S2/S3 — the generated holders become
  physically usable.

- **WP-75 — Optics groups: achromats, objectives, black boxes.** An achromat
  already compiles (a fragment *is* an optics group); what breaks is (a) solid
  generation for **air-spaced** groups (`solids_from_prescription` → one solid
  per glass group, each cut by the holder), (b) the **paraxial black box** — one
  surface with `ThinLensInteractionModel` + EFL for a catalog objective you have
  no prescription for (needs WP-79 step 3 to let the interaction model travel),
  and (c) the barrel housing (→ WP-67). Ships achromat + paraxial-20× reference
  seeds. *Full prompt: 2k WP-75.* **Unblocks:** the "multi-element lens /
  objective" ask directly.

### Phase 3 — Part-first library: any part reaches the grid *(S2, S4)*

- **WP-67 — The "Parts" editor + housing without a cube** *(carried from 2j,
  extended)*. One nav entry **"Parts"** replaces "Components" + "Bind" (tabs
  "optics (symbol)" / "mechanics (housing)"); `footprint_grid` becomes optional
  so a template can be a **bare housing** with no cube; the index ships a
  `housings` section so the frontend can tell bare symbol / symbol+housing /
  cube module apart; and an unbound part's mesh **travels with it** (today
  unbound palette entries hardcode `glbUrl: null`). *Full prompt: 2j WP-67.*
  **Extension for this round (the user's explicit ask):** *every* part is
  grid-compatible in the end — a Thorlabs kinematic mount holding a mirror, a
  bare laser body — via **either** an auto-generated T3 holder **or** the export
  path in WP-84. There is no "lives off the grid forever" state; housing-without-
  a-cube is a *stage*, not a destination. **Unblocks:** S2 (a housed device
  visible with its mesh in free space), and the whole part-first philosophy.

- **WP-83 — The reference/test parts corpus.** *(new — the user's "add the
  important reference parts so we can test everything" ask.)* One reviewed,
  zero-flag reference record per scenario branch, committed to the library so
  every WP has something real to test against and the golden designs exercise
  the real paths:
    - S1: `openuc2.lens.starter_50mm` (exists), `openuc2.lens.achromat_starter`
      (cemented doublet, WP-75), `openuc2.objective.paraxial_20x` (black box).
    - S2: a Thorlabs kinematic-mirror **assembly** reference (KM05-class mount +
      circular mirror, STEP + assigned reflective datum + tip/tilt DOFs) and a
      laser-body reference (bare housing, WP-67).
    - S3: `thorlabs.lens.ac254-050-a` (exists, `.zmx` provenance).
    - S4: an Inventor-datum-marker cube reference (the `MAS-2000-CUSTOM.stp` /
      marker-stamped GLB from `~/Downloads/PyInventor`, imported via `import
      glb`).
    - S5: `openuc2.galvo.dual_axis` (exists) + `openuc2.stage.z_motor` (exists).
    - Spectral: `openuc2.filter.emission_525`, the re-authored dichroic (WP-74).
  Each is an acceptance fixture: a golden `.dsn` per scenario that a test
  compiles/simulates/cubifies. **Unblocks:** trustworthy testing of all of the
  above; this is the safety net the other packages lean on.

- **WP-84 — Inventor round-trip: identity-preserving re-attach.** *(new —
  the user's "attach the Inventor zip+stp back onto the same record" ask.)* A
  per-part STEP export **posed w.r.t. its cube frame** (`optikit-core export
  step --component <key>`, and a `/v1/export/step/part` endpoint + a frontend
  "export for Inventor" button), so an ME can design the cube module around the
  device in Inventor; and the return leg — **attach** the resulting STEP + GLB
  (or a zip) back onto the **existing** record id rather than minting a fresh
  one, keeping the optical model untouched (the user's explicit simplification:
  "we're fine attaching files back since the optical model doesn't change"). No
  merge logic, no fresh ids — just "here are the mechanics for the part you
  already assigned." **Unblocks:** S2's hand-crafted-in-Inventor path and S4's
  rework loop.

### Phase 4 — Reach the CLI from the frontend *(S3, S4; general usability)*

- **WP-82 — CLI ↔ frontend parity: importers, viewers, editors.** *(new — the
  user's "reach most CLI commands from the frontend, with viewers and editors"
  ask.)* Today `.zmx` and `import glb` are **CLI-only** with no UI and an
  auto-write-with-no-confirmation into `library/`. This package:
    - a **`/v1/import/zmx`** and **`/v1/import/glb`** endpoint pair (the CLI
      importers already exist; wrap them), returning the *proposed* record trio
      for review rather than writing blindly;
    - a frontend **import drop-zone** (drag a `.zmx` or a marker-stamped GLB →
      preview the parsed surfaces / datum frames / review flags → accept into
      the library via the existing dev-write / zip exits);
    - a read-only **viewer** for the other engine outputs that are today
      terminal-only: the compiled optic (2D layout PNG the engine already draws),
      the cubify/DRC report, the photon budget (WP-74), and the `optikit-fx.json`
      changeset (WP-85). The principle: **anything the CLI can produce, the
      editor can at least view.**
  **Unblocks:** S3 and S4 become real UI flows instead of terminal rituals.

- **WP-78 — Schematic ergonomics: context menu, copy/paste, chaining that
  proposes.** Right-click menu on a placed part (copy · paste · duplicate ·
  delete · open in library · take out of cube · put in a cube… · swap module…),
  keyboard copy/paste/duplicate, and chaining that surfaces inference proposals
  as one-click **Adopt** chips with a non-modal manual fallback (answering "is
  manual chaining still necessary?" — no, it becomes the ambiguous-case
  fallback). *Full prompt: 2k WP-78.* **Unblocks:** daily usability across all
  scenarios; the copy/paste and "manual chaining" asks directly.

### Phase 5 — The T2 parametric-insert loop, hardware-in-the-loop *(S1, S3, S5)*

This is the one loop that touches a real Inventor install. The scripts already
exist on the Inventor machine (`~/Downloads/PyInventor/apply_fx_params.py`,
`batch_iam_to_stp_glb.py`) but have never been tested end to end against a live
Inventor — so this phase is a **human-driven** test package plus the service
that makes it callable from OptiKit.

- **WP-85 — PyInventor parametric-insert bridge (human WP + FastAPI Inventor
  service).** *(new — the user's explicit ask.)* Two halves:
    1. **The connection that already exists, verified by a human.** A step-by-
       step manual test the user runs on the Inventor machine: take the
       master-insert `.ipt`, set the fx user parameters (`lens_diameter`,
       `radius`, `thickness`, and the placement `dz`/pose) to match a specific
       lens (e.g. `starter_50mm`), confirm the lens mounts inside the cube
       module, run `batch_iam_to_stp_glb.py` to produce the STP/GLB/thumbnail
       trio, and confirm `apply_fx_params.py` consumes an `optikit-fx.json`
       changeset. This closes the T2 loop the ledger claims (WP-35) but which was
       never exercised. **Deliverable from the human:** the run log + one golden
       marker-stamped `.iam → STP/GLB` pair, which becomes the WP-83 S1-T2
       reference fixture and unblocks WP-20.
    2. **A FastAPI Inventor bridge** so OptiKit can drive that loop remotely: a
       small service that runs on the Inventor/Windows machine and exposes
       `POST /inventor/apply-fx` (takes a changeset + a template id → sets the
       user parameters, exports the trio, returns the files) and
       `POST /inventor/batch-export`. OptiKit's `/v1/generate` gains a `T2`
       branch that, instead of running CadQuery, calls this bridge — and the
       `pocket_params()` → fx wiring (which exists but has no caller) becomes its
       input: a placed lens's prescription derives the insert's fx parameters
       automatically. When the bridge is unreachable, the editor falls back to
       "download the fx changeset" (which already works).
  **Unblocks:** the T2 branch of S1 and S3 (the last unimplemented cell of every
  scenario matrix), and S5's parametric-insert story.

### Phase 6 — Grouping and the hardware return leg *(polish + S5 closure)*

- **WP-71 — Ad-hoc grouping** *(carried from 2j)*. Shift-select, Ctrl+G to group
  a selection with a name (WP-44's instance mechanism, no library record), Ctrl+
  Shift+G to ungroup, and "save as group record…" to graduate an ad-hoc cluster
  into a reusable OPM. *Full prompt: 2j WP-71.* **Unblocks:** building
  arbitrarily complex setups without pre-authoring every subassembly.

- **WP-86 — Calibration write-back: derive from a running instrument.** *(new —
  the user confirmed adding this.)* Back-annotation exists for the *optimiser*
  leg only (a simulation result → `dof_value`). Add the **hardware** leg: a
  measured axis position from a running instrument (via the WP-26 UC2-REST
  device link, read direction) writes back into the design's `dof_values` with
  `provenance: {source: instrument, run: …}`, the exact same classified-delta
  path the optimiser uses. So a focus found by turning a real motor is captured
  in the design, not just a simulated one. **Unblocks:** the "code → CAD →
  running instrument → back" closure that is OptiKit's genuine differentiator
  over PyOpticL/KiCad.

### Round-11 additions (Part 2l, 2026-07-29) — folded into Phases 1–4

Collected from real use; full prompts in `kicad-for-optics-part2l.md`. They
interleave with the phases above (all **before** Phase 7):

- **WP-92 — Editor bug sweep, round 2** *(with Phase 1)*. WebGL context loss
  after the holder preview (the canvas dies until reload — this is also why a
  generated cube doesn't appear); decimal-comma number inputs yielding NaN;
  an unbound lens's yaw snapping to N·90° with snap off (the residual yaw is
  not rendered for a part with no cube shell); interface-part (puzzle/plate)
  glyphs still invisible. The daily-use blockers.
- **WP-89 — The part inspector shows the optics** *(Phase 2)*. Clicking a part
  surfaces its optiland facts (EFL, aperture, per-surface radius/thickness/
  material, source lines) + a legible port list + a ray sketch — and answers
  "do we still need ports?" by making them visible (yes; they are the pins).
- **WP-90 — Parts editor per-category authoring** *(Phase 3, extends WP-67/77)*.
  Category-driven fields (a mirror gets a substrate + reflective surface, not a
  lens's radii); rectangular apertures; a `mechanics:` reference so a hand-
  authored record can name its housing STEP; template-class routing (T1→WP-84,
  T2→WP-85, T3→WP-77).
- **WP-87 — Import an Optiland setup** *(Phase 3–4)*. A whole Optiland system
  JSON → a row of unbound free primitives on the schematic (no T-class until
  cubify), each a temporary component promotable to the library. The third
  import road beside zmx (WP-82) and glb.
- **WP-88 — Sequential beam-path scripting** *(Phase 4, with WP-78)*. A small
  Optiland/PyOpticL-style DSL that builds the circuit line by line and stays
  two-way in sync with the canvas — the inverse authoring direction to chain
  inference.
- **WP-91 — Library UX + multispectral sources** *(Phase 4)*. A list view for
  the palette beside the icon grid; a multi-line source shows all its lines
  with an active-line picker and "simulate all lines".

Answers (not work) also in Part 2l: why ports stay (they are the pins — chain
inference, compilation, the WP-74 spectral gate all walk them); why inference
snaps within 20° not 45° (after grid placement a real target is ~0° off and a
non-target ≥90°, so 20° is the tolerant-but-safe band); sources are already
multi-line in the datamodel; and how to attach Inventor mechanics to an
optics-only record (WP-67 housing / WP-84 attach).

### Round-12 additions (Part 2m, 2026-07-29) — M9, the "MVP proven" gate

From the spoken workflow walkthrough + the three benchmark instruments. Full
prompts in `kicad-for-optics-part2m.md`. Most of that transcript is already
built (vendor zmx→cube, STEP+datum assignment, housing association, Inventor
export/attach, prescription→volume); four items were genuinely new:

- **WP-93 — The optimizer becomes a design tool** *(M9)*. Free-space **pose
  variables** for unbound optics — today `_free_dofs` varies only *declared*
  DOFs, so "break the optic loose so the optimizer finds its ideal position"
  silently does nothing; plus per-variable **constraints** (bounds, fix, link),
  a **merit choice** (rms spot / homogeneity / encircled energy) instead of the
  hardcoded RMS-spot, and the **"change the holder…"** verb so parts moved by
  the optimizer get new T1/T2/T3 mechanics in one undo step.
- **WP-94 — Virtual detectors** *(M9)*. Non-physical measurement probes placed
  anywhere in the beam (including inside a sample volume) returning an
  irradiance map + **homogeneity**, power, D86. Consumes no cube, appears in no
  BOM, never perturbs the trace. Feeds WP-93's merit — this is what makes the
  fluo-scope's stated acceptance criterion computable at all.
- **WP-95 — The benchmark suite** *(M9)*. Three instruments as goldens + CI
  tests: the fluorescence scope (exists; gains the optimization + probe
  acceptance), the **light sheet** (two fully independent arms crossing at the
  "aquarium" — the geometry-complexity test), and the **laser-scanning
  confocal** (galvo tilt deflecting at 2θ, pinhole gating the return — the
  reference test).
- **WP-90 amendment** *(M8)*. Multi-axis DOF authoring plus a generic
  `openuc2.tpl.lens_holder_xyz` T2 holder with independent dx/dy/dz — every T2
  template in the library today declares exactly one translation axis, though
  the placement machinery already handles N.

### Round-13 additions (2026-08-01) — the contract, the architecture, the review lifecycle

Three items from the "what is the common ground?" conversation. The first two
are **done** (this round); the third is scoped and unscheduled.

- **WP-96 — DSN-first architecture** *(done, 2026-08-01)*. The editor's design
  state IS the `.dsn` now: `src/document/documentStore.ts` holds `DsnPart[]`
  (`cell` + `offset-mm`, `rot24` + `offset-deg`) with the selection and a real
  undo stack; `appStore` keeps only catalog, layers, metadata, notifications
  and the legacy interchange. The old `PlacedModule[]` shape survives *as a
  file format* in `legacyLayout.ts` (layout JSON, share links, ImSwitch, the
  one-shot localStorage migration). Shook out two latent bugs: the yaw of a
  discrete orientation is coset arithmetic, not a euler-triple field
  (`rot24.ts::yawStepOfRot24`), and `tsc -b` had been failing on three
  pre-existing type errors nobody was running.
- **The DSN contract manifest** *(done)*. `../optikit-core/DOCS/DSN-CONTRACT.md`
  — one normative document for the frontend↔backend common ground (rank order
  of truth, document frame, pose composition, ports, record trio, API
  surface, extension protocol), with `rot24.svg` and `part-anatomy.svg`. This
  is what external contributors get pointed at.
- **WP-98 — Bundle-aware .dsn import** *(done, 2026-08-01)*. A `.dsn` zip's
  `library/` half registers BEFORE the design places: components → the
  browser-local workspace (persistent), modules → a session bundle registry
  (`dsn/bundleImport.ts`) with the template's GLB served from a blob URL and
  the record's `docs:` markdown resolved from the zip (rendered by the
  inspector). Refs the bundle carries no longer get substituted by lookalike
  modules; export is symmetric (workspace/bundle records the design uses
  travel in the zip → a self-contained SETUP bundle). Second community
  template added: `setups/demo-bench.dsn/` — a whole assembly in one zip.
- **WP-98b — The E_NO_OPTICS chain** *(done, 2026-08-01)*. Field-found triple:
  (1) a design must compile STANDALONE — neither the core compiler nor an app
  that imported a `.dsn` resolves library refs into optics, so the template
  designs now inline their fragments (and the demo record's physics was fixed:
  it claimed f=50 with radii giving 32.9 mm and the pre-WP-63 `type: ideal`
  material — now a ray-trace-verified singlet focusing one grid cell behind
  its front vertex, EFL 47.54); (2) a HOLLOW registry module (indexed without
  its component/template) is now enriched from the index components, workspace
  drafts, or an imported bundle (`enrichEntry`) instead of simulating as
  E_NO_OPTICS and rendering as a ghost; (3) `/v1/simulate` on a system with
  no real surfaces answers 422 `E_EMPTY_SYSTEM` instead of a numpy traceback.
- **WP-97 — The review lifecycle** *(proposed, Phase 3–4)*. `review:` notes
  exist on every record kind and reach the index and the palette chip, but
  they are a flat list of free-text strings with **no severity and no
  resolution path**: "placeholder CAD, do not print" and "confirm the glass
  name" are indistinguishable, nothing aggregates them per design, and no
  outward-facing exit consults them. Three parts: (1) an optional structured
  form (`{level: blocker|verify|note, text}`) that stays backward-compatible
  with plain strings; (2) a **design-level review panel** listing every note
  of every placed part, so "what is unfinished in this instrument?" is one
  click; (3) **gate the outward exits** — release bundle, STEP assembly,
  "publish to community" — on an explicit acknowledgement when a blocker-level
  note is in the BOM. Motivation: community forks legitimately ship
  placeholder CAD (the template does), and the failure mode is someone
  printing or ordering from it. Validation must stay permissive — a record
  that admits incompleteness is honest and must keep validating; this is
  about making the admission *visible at the moment it matters*.

### Round-14 additions (2026-08-01) — the flow round · WP-99…WP-109

Full prompts and evidence in **`kicad-for-optics-part2n.md`**. Source: a session
driving the whole loop (import a community `.dsn` → open a part → author a
mirror → attach Inventor CAD → place on the grid) and finding it "very confusing
to navigate". Ten symptoms were traced to code and independently re-verified;
**five turned out to be bugs, not missing features** — the flow is not only
under-explained, it is currently lying in four places, and no mental model can
survive that.

Tier 0 — *stop the app lying* (contained, two of them under ten lines):

- **WP-99 — The assembly draws the mesh you attached.** `AssemblyScene.tsx:382`
  tests `templateClass === null` **before** it reaches `render.glbUrl`, and that
  class is read off the exported service design, which never carries a
  `template:` block for palette-placed parts. So no library GLB has ever
  rendered for a palette part, WP-98's bundle mesh donation has never been
  visible, and WP-67's housing meshes are swallowed. Take the T-class (and the
  DOFs, same cause, which kills every T2 handle) from the palette registry,
  reorder the ladder so a mesh wins, and give the four ghost branches distinct
  labels so this is self-diagnosing next time. ✅ *(done, 2026-08-01)*
- **WP-100 — Open the part you clicked.** The `?open=` deep link resolves ids
  through the published registry only and swallows the 404 twice, leaving a
  blank new record on screen that looks like a corrupted version of your part.
  Resolve workspace → bundle → registry → index-summary, and never present a
  blank draft as the requested record.
- **WP-101 — A dropped part lands where you dropped it.** `addPart` skips
  `constrainOffsetToTemplate`; the "snap" users see on first drag is the T1
  constraint firing late. Same bug in paste and in the inspector's numeric
  fields; the `snapGrid` toggle is mislabelled.
- **WP-102 — Publishing to the library must not destroy records.** The write is
  a wholesale replace from a draft that never reads `tags`/`docs`/`review`; it
  has already destroyed curated data in the working tree. Merge before adding
  any easier write button. Plus: `app.py:1140`'s `setdefault` makes the
  documented read-only-in-containers promise false, and with `CORS: *` and no
  auth, any page can POST YAML into a running user's library.

Tier 1 — *the mental model* (the user's own words: library → T1 in a cube → T2/T3
loose → place on the grid → author optic ⊂ housing ⊂ cube):

- **WP-103 — Three states, said out loud.** optikit-core ships `components`,
  `housings` and `modules` as three index sections *precisely* so the frontend
  can tell them apart; the frontend flattens them into `templateClass|null` +
  `unbound`, where `null` means three different things. Introduce a real `mount`
  discriminator, segment the palette by it, and draw the cube envelope around
  parts that have one.
- **WP-104 — The anatomy view.** One `PartAnatomy` component (palette hover,
  schematic inspector, third parts-editor tab) drawing optic → housing → cube
  with each layer labelled, clickable, and greyed when absent — the greyed
  layers *are* the authoring to-do list.
- **WP-105 — Where your work lives.** Sixteen localStorage keys, one blind 5 s
  autosave, four stores that never persist, and three menu items called "Save"
  that do not save the document. Rename, confirm-before-replace on all five
  import doors (two fire silently on page load), undo brackets, a `savedAt`
  chip, then a real document identity.

Tier 2 — *ergonomics that compound*: **WP-106** (parts search + one naming
convention + list modules/housings), **WP-107** (the 45° glyph, the optic drawn
inside the pseudo cube, honest mesh-status), **WP-108** (`review` ≠ `draft` —
one boolean with four meanings badges a shipping €650 laser as a draft),
**WP-109** (optikit-core library hygiene: one mirror cube instead of three, a
`step:` that points at a `.glb`, and a `library validate` check for the two
undeclared mesh conventions).

Deliberately **not** done this round: emitting `template:` in the exported
`.dsn` (schema-invalid today), a `mesh-frame` record field (validate the
ambiguity away instead), and hiding record ids behind display names (they
collide).

### Phase 7 — After the MVP: community, accounts, UX *(explicitly last)*

None of these are on the Scenario 1–5 path; they are the product layer on top of
a working editor. Per the user's instruction, they come last.

- **WP-70 — The publish loop** (Store-repo CI index + live Explore fetch +
  prefilled-PR "Publish to community"). *2j WP-70.*
- **WP-55 — GitHub docs sideload**; **WP-56 — embedded viewer v2** (`.dsn` in a
  static page). *2j WP-55/56.*
- **WP-59 — OSHWLab-for-optics** phased plan (design pages → BOM→cart ordering →
  social). *2j WP-59.*
- **WP-72 — Accounts & user-owned storage ADR** (GitHub App vs OAuth vs Google —
  a decision document + thin prototype, no UI investment yet). *2j WP-72.*
- **WP-73 — The UX overhaul** (website ↔ editor split, the design system
  everywhere). Deliberately last, on a working machine. *2j WP-73.*

---

## 3. Dependency graph of the packages

```mermaid
flowchart LR
  classDef p1 fill:#ffebee,stroke:#c62828
  classDef p2 fill:#fff3e0,stroke:#ef6c00
  classDef p3 fill:#e8f5e9,stroke:#2e7d32
  classDef p4 fill:#e3f2fd,stroke:#1565c0
  classDef p5 fill:#f3e5f5,stroke:#7b1fa2
  classDef p6 fill:#eceff1,stroke:#455a64

  WP74["WP-74 spectral ✅"]:::p1
  WP79["WP-79 lossy channel ✅"]:::p1
  WP80["WP-80 rotation DOFs ✅"]:::p1
  WP82a["WP-82a reflection from normals"]:::p1

  WP76["WP-76 unbind"]:::p2
  WP77["WP-77 editor T3"]:::p2
  WP81["WP-81 beam bore"]:::p2
  WP75["WP-75 optics groups"]:::p2

  WP67["WP-67 Parts / housing"]:::p3
  WP83["WP-83 reference parts"]:::p3
  WP84["WP-84 Inventor round-trip"]:::p3

  WP82["WP-82 CLI→UI import/viewers"]:::p4
  WP78["WP-78 ergonomics"]:::p4

  WP85["WP-85 PyInventor T2 bridge"]:::p5
  WP71["WP-71 grouping"]:::p6
  WP86["WP-86 hardware write-back"]:::p6

  WP80 --> WP82a
  WP40["WP-40 derive_port_directions (done)"] --> WP82a
  WP79 --> WP81
  WP79 --> WP75
  WP74 --> WP83
  WP75 --> WP83
  WP67 --> WP75
  WP66["WP-66 swap (done)"] --> WP76
  WP61["WP-61 cubify (done)"] --> WP76
  WP61 --> WP77
  WP67 --> WP84
  WP82 --> WP83
  WP26["WP-26 device link (done)"] --> WP86
  WP80 --> WP86
  WP35["WP-35 fx (done)"] --> WP85
  WP83 --> WP85
```

Read it as: **Phase 1 (red) feeds everything.** WP-79 in particular gates the
mechanics phases (a bore needs the aperture; a black box needs the interaction
model). WP-83 (reference parts) depends on the physics being right first, then
becomes the test bed everything else leans on. WP-85 sits at the end because it
needs a real Inventor and a verified reference lens.

---

## 4. Decisions confirmed this round

1. **`response:` on the surface, not the port** — a cut-on is a surface
   property; stays inside the Optiland-serialized fragment. ✅
2. **Jones declared, not implemented** — `polarization_deg` gets a schema home;
   wavelength gating is implemented (it is what fluorescence needs). ✅
3. **Unbind drops the template, keeps the component** at the same pose, one undo
   step; does not delete the module record, does not prompt. ✅
4. **Paraxial black box is a first-class surface kind** — one surface,
   `ThinLensInteractionModel` + EFL. ✅
5. **Lose no Optiland detail** — records store the Optiland serialization
   verbatim; every new field (response, interaction model) lives inside the
   fragment where `extra="allow"` carries it losslessly, and the importers keep
   following Optiland's own parser rather than re-deriving. ✅ *(new this round)*
6. **CLI power is reachable from the UI** — anything the CLI produces, the editor
   can at least view; the import commands get real UI with a review step instead
   of a blind auto-write. ✅ *(new this round)*
7. **Every part reaches the grid** — housing-without-a-cube is a stage, not a
   destination; a T3 holder or the WP-84 export path always lands it on the
   50/50/55 grid. ✅ *(new this round)*
8. **Identity-preserving re-import is file attachment, not a merge** — attach the
   Inventor STP/GLB/zip back onto the existing record; the optical model is
   untouched, so no reconciliation is needed. ✅ *(new this round)*

---

## 5. A note to Ethan (the Go side)

The Go `.dsn` renderer has stalled, so this roadmap **deliberately diverges**
where waiting on a ratification call would block the MVP. Specifically:

- The `response:` block (WP-74), the surviving `interaction_model` (WP-75/79),
  the frame `rotation`/`clear_aperture_mm` that now travel (WP-79), and the
  rotation-DOF geometry (WP-80) are all implemented on the Python side first.
  They live inside the Optiland-serialized fragment or as additive record
  fields, so a Go loader with `extra="allow"` round-trips them losslessly — but
  the Go renderer will not *act* on them until it is caught up.
- The multi-part-in-one-cube question (`module.parts: {…}`, flagged in
  `GO_INTEGRATION.md:130`) is **not** taken up in this MVP — an objective is one
  optics group in one barrel, which the current 1:1:1 shape already fits, so no
  schema break is forced. It stays open for the two-independent-optics-in-one-
  cube case and still wants a joint call.

Action: fold this divergence note into `optikit-core/DOCS/GO_INTEGRATION.md` as
the current E2 delta, and package the E2 asks (#1–11 + WP-74's new `response`
ask) for Ethan when he re-engages.

---

## 6. Suggested build order (one line)

~~**WP-74 → WP-79 → WP-80**~~ ✅ *(physics correct & lossless — done)* →
**WP-82a** *(the 2θ reflection fix carved out of WP-80)* → ~~**WP-76 → WP-77**~~ ✅
→ **WP-81 → WP-75** *(the verbs, in the UI)* → **WP-67 → WP-83 → WP-84**
*(part-first + test bed + round-trip)* → **WP-82 → WP-78** *(CLI→UI +
ergonomics)* → **WP-85** *(the human-tested T2 Inventor loop)* → **WP-71 →
WP-86** *(grouping + hardware closure)* → **WP-70/55/56/59/72/73** *(community,
accounts, UX — last)*.

At the end of Phase 6, all five scenarios are drivable through the editor and the
North Star holds: design the optical circuit, simulate it, optimise it, cubify
it, produce it — and measure it back.

# Part 2o · Feedback round 15 (2026-08-02) — three roads into the library, one door

Continues `kicad-for-optics-part2n.md`. Source: driving `/configurator/components`
after the round-14 fixes and finding that the *machinery* is all there but the
*route through it* is not. WP numbering continues at **WP-110**.

The observation, in the user's words: *"I think it is all inside the frontend
already, but very confusing."* That is exactly right, and it shapes every
package here. **Almost nothing below is new capability.** It is re-composition:
the same stores, the same service calls, the same records — reached through a
question the user can actually answer instead of a form that assumes they
already know the answer.

---

## 0. Answers first — what already exists for each road

Worth reading before the packages, because it says how much of each wizard is
assembly rather than construction.

The parts editor today is **two tabs over one shared `RecordDraft`** (plus
WP-104's anatomy tab): "optics (symbol)" authors the Optiland fragment, datum
frames and ports; "mechanics (housing)" is the former bind workbench — upload a
STEP, place it against a ghost cube, click datums, pick a template class, emit
the record trio. Every road below already passes through those two tabs. The
problem is that the tabs are **orthogonal to the question the user is asking**:
they split by *which half of the record* you are editing, when the user is
thinking about *what kind of thing they have*.

Concretely, the three roads and what is already built for each:

| The user has… | Existing surface | Existing service call | What is missing |
|---|---|---|---|
| **numbers** (a lens: Ø, R₁, R₂, t) and wants a cube insert | `RecordForm` + `SurfacesTable`; `MechanicsPanel` mount = **"insert in a cube"**; `GenerateDraftHolderDialog` (WP-77) | `POST /v1/generate` — the **T2 branch** (`_generate_t2`, `app.py:900`) drives the Inventor bridge and returns `.stp`/`.glb` base64; the T3 branch cuts a boolean holder | a guided **placement w.r.t. the cube origin** (today the cavity is hardcoded "front vertex at the cube centre"), the optiland-optimised position, and a one-part design to hand the bridge |
| **a STEP of a device** (a Thorlabs mount, a laser body) | `MechanicsPanel` mount = **"housing only (no cube)"** (WP-67); `BindScene` datum mode | `POST /v1/convert/step-to-glb` | the **alignment step** — "this face is the reflective plane / this axis is the beam" — is a bare click-the-mesh interaction with no guidance, and the source-side optics (beam diameter, intensity) have no fields |
| **an Inventor cube** already built | `MechanicsPanel` mount = **"whole cube module"** (WP-41); `AttachInventorDialog` (WP-84) | `POST /v1/import/glb` extracts datum frames from marker-stamped exports | associating the **optics** with the mesh is unguided, and `verify-t1` (the check that the record and the mechanics agree) only exists in the CLI |

So: one genuinely new backend path (params-only → Inventor insert, WP-111.4),
one genuinely new interaction (axis alignment, WP-112.3), one CLI check that
needs to reach the UI (WP-113.4). Everything else is a wizard around code that
already runs.

### Why the tabs stay

The wizards are the **creation** path. Editing an existing record stays on the
tabs — they are the right shape for "I know this record, change this field", and
WP-102's merge-on-write means an edit there is now safe. The failure mode to
avoid is a wizard that becomes the only way in and then has to grow every
advanced field back. WP-110 makes the wizard the *default door* and leaves the
tabs as the *expert view*, reachable in one click from any wizard step.

---

## 1. The question the wizard asks

The whole design collapses to getting one question right, up front:

> **What do you have?**
>
> - I know the optical numbers, and I want it in an openUC2 cube → **WP-111**
> - I have a CAD file of a device (a mount, a laser, a camera) → **WP-112**
> - I have an Inventor cube that already contains the optic → **WP-113**
> - I have a vendor file (`.zmx`, an Optiland setup, a marker-stamped GLB) → the existing importers

Note what that question is NOT. It does not ask "T1, T2 or T3?" — the user
learns that from the answer, not before it. It does not ask "component,
template or module?" — the record trio is an *output* of the wizard, shown as it
fills in (WP-104's anatomy view is the progress bar). And it does not ask
"optics tab or mechanics tab?", which is the split that made the current editor
feel like it needed prior knowledge.

---

## 2. The work packages

### WP-110 — "New part…": one door, three roads

```
PROMPT (repo: openUC2-OptiKit, frontend only)

The parts editor's entry point is a form that assumes you already know what
you are making. Put a question in front of it, and a shared shell behind it.

1. THE DOOR. Replace the bare "new" button (ComponentEditorPage's header) with
   a dialog that asks WHAT THE USER HAS, in their words, with one line of
   consequence under each choice:
     · "I know the optical numbers"  → a lens/mirror/source from its
        prescription, placed in an openUC2 cube. Ends with a cube + insert.
     · "I have a CAD file of a device" → a Thorlabs-style mount, a laser body:
        real mechanics, no cube yet. Ends with a part you can place freely.
     · "I have an Inventor cube"       → the optic is already inside a printed
        cube. Ends with a T1 module.
     · "I have a vendor file"          → routes to the EXISTING importers
        (ImportVendorDialog for .zmx and marker-stamped GLB,
        ImportOptilandDialog for a serialized Optiland system).
   Each row names what it produces in record terms as SECONDARY text
   ("component + template + module"), so the vocabulary is taught by use rather
   than assumed. The dialog is also the empty state of the drafts tab.

2. THE SHELL. One `PartWizard` component the three roads share:
     · a stepper with named steps and a per-step help paragraph (not a tooltip
       — the explanation is the point, so give it room);
     · a persistent right-hand panel showing WHAT YOU WILL GET, using
       `PartAnatomy` (WP-104) with the layers filling in as steps complete —
       the anatomy drawing is already the right picture, and here it doubles as
       a progress indicator;
     · "open the full editor" on every step, which drops the in-progress draft
       into the existing tabs — the escape hatch that keeps the wizard from
       having to grow every advanced field;
     · ONE terminal step with the three destinations spelled out (WP-105's
       naming): save to this browser · publish to ../optikit-core/library ·
       download the YAML for a pull request.

3. PERSIST THE DRAFT. A wizard that loses work on a reload is worse than the
   form it replaced. Persist the in-progress wizard state (which road, which
   step, the RecordDraft, the bind transform/datums) under
   `optikit-parts-wizard` — WP-105 flagged the parts-editor draft as one of the
   four stores that hold real work and never persist; this is that fix, scoped
   to the wizard.

4. ROUTE, don't duplicate. Each road MOUNTS the existing panels inside a step
   (RecordForm, SurfacesTable, BindScene, MechanicsPanel's viewport) with the
   irrelevant controls hidden — no second copy of the surfaces table, no second
   datum editor. If a step needs a control the panel does not expose, add a
   prop; do not fork the component.

Acceptance: from an empty library, a user who has never seen the app picks a
road, is told at every step what the step is for and what it will produce, and
ends with a record trio they can name. The existing tabs still open any record
for editing, unchanged.
```

**For humans:** one dialog that asks "what do you have?" instead of a form that
asks you to already know the answer — and a wizard frame that shows the part
being assembled while you fill it in.

---

### WP-111 — Wizard A · an optic in a cube (the insert Inventor builds)

```
PROMPT (repos: openUC2-OptiKit + optikit-core)

The road for "I know the numbers": a prescription becomes a real cube module
with a printable/machinable insert, without the user touching CAD.

Steps, in order:

1. WHAT IS IT. Category first (start with LENS — Ø, R1, R2, thickness,
   material — because it is the case with the least ambiguity), then the
   fields for that category. Reuse `SurfacesTable` preset to a single element;
   do NOT show datum frames or ports here — the wizard derives the default
   ports from the surfaces (`derivedPortWarnings` already knows the rules) and
   shows them read-only as "what this will do to a beam".

2. WHERE DOES IT SIT. A 3D step showing ONE 50 × 50 × 55 mm cell with the
   optic inside it, and the number that matters: the offset of the optic's
   front vertex from the CUBE ORIGIN along the optical axis. Draggable in the
   viewport, typed in a field, and — the interesting one — "find the best
   position": build a one-part design, POST /v1/optimize with the vertex
   offset as the free variable, write the result back into the field. Say
   plainly what was optimised (RMS spot at the exit face) and let the user
   override it; an optimiser result the user cannot argue with is a black box.
   Default: front vertex at the cube centre, which is what
   GenerateDraftHolderDialog assumes today.

3. HOW IS IT HELD. Two choices with their consequence, not their letter:
     · "fixed in place" (T1) — one insert, the optic cannot move.
     · "adjustable along the beam" (T2) — declare a dz range; the insert is
       parameterized and the position becomes a knob in the assembly.
   T3 (generate a printable holder) stays available but is NOT the headline
   here — it is the fallback when no Inventor machine is reachable (step 4).

4. BUILD IT. POST /v1/generate. For T2 this is the `_generate_t2` branch
   (app.py:900) — the Inventor bridge parameterizes the master insert from the
   prescription and returns `.stp`/`.glb` artifacts base64-inline.
   THE GAP TO CLOSE: that branch requires `files` + `component` — a PLACED
   design — and the wizard has no design. Synthesize a one-part design in the
   same shape `serviceFiles()` emits (one component, the inline fragment from
   step 1, the pose from step 2, `instantiation.dof_values` from step 3) and
   pass `component` = its single key. Do this in the FRONTEND, not by
   loosening the endpoint: the design is exactly the contract the bridge wants
   and a params-only side door would be a second way to describe the same
   thing.
   No bridge is a TYPED outcome, not an error: E_NO_BRIDGE / E_BRIDGE_UNREACHABLE
   come back 503/502, and the step must offer the fx-changeset download the
   assembly page already falls back to (AssemblyPage's regenerateT2), plus the
   T3 boolean-holder road as the "I just want to print something" answer.

5. REVIEW AND ACCEPT. Render the returned GLB in the wizard viewport next to
   the cube outline, run WP-109's mesh check on it before offering to publish
   (a returned mesh that does not measure a cell is a bridge misconfiguration,
   and it is much cheaper to catch here than in the assembly), then write the
   trio: component (the prescription) + template (the insert, with the real
   measured envelope) + module (the binding).

Acceptance: a user who knows only "50 mm plano-convex, Ø25.4, N-BK7" ends with
a placeable cube module and a downloadable STEP of its insert, having answered
four questions. With no Inventor bridge reachable, the same four questions end
with a printable T3 holder and an honest explanation of the difference.
```

**For humans:** type the lens you want, say where in the cube it should sit (or
let the optimiser choose), and get back the cube with an insert built for it —
with a printable fallback when the Inventor machine is not reachable.

---

### WP-112 — Wizard B · a device in its own housing (no cube yet)

```
PROMPT (repo: openUC2-OptiKit, frontend; one additive schema field)

The road for "I have a CAD file of a device" — a Thorlabs kinematic mount, a
laser body, a camera. The output is WP-103's `mount: 'housed'` state: real
mechanics, real optics, no cube. That state exists in the datamodel and in the
palette and today has exactly two library parts, because nothing makes one
easy to author.

Steps:

1. THE MECHANICS. Drop the STEP (or GLB). Reuse `convertStepToGlb` and the
   BindScene viewport. Show the measured bounding box immediately — it is the
   first thing that tells the user the file is the one they meant.

2. THE OPTICS. Category, then the fields that category actually needs:
     · source — emission lines / spectrum, divergence, BEAM DIAMETER, optical
       power. `SourceSpec` carries `wavelengths_um` and `divergence_deg`
       already; beam diameter and power are additive fields (the schema is
       extra=allow, so this is a record addition, not a break — declare them in
       optikit-core's `SourceSpec` so they are typed rather than folklore).
     · lens — radii, thickness, material, clear aperture.
     · mirror — mount angle, reflect band, substrate.
   This is the same per-category form WP-90 built; mount it, do not rewrite it.

3. ALIGN THE OPTICS TO THE MECHANICS — the step that makes this a part rather
   than two unrelated files, and the one with no guidance today. The user must
   say WHERE on the mesh the optics live:
     · pick the face/plane that is the optical surface (a mirror's reflective
       plane, a lens's front vertex, a laser's emission aperture) by clicking
       the mesh in datum mode;
     · confirm the optical AXIS direction — draw it on the mesh, with the beam
       rendered live so a wrong normal is visibly wrong;
     · for a fold (a mirror), show the incoming and outgoing arms updating as
       the plane is picked. WP-107 made the glyph and the ray sketch agree on
       the fold; this step is where that pays off.
   Guidance is the deliverable here, not the interaction: name what a datum IS
   ("the point on the part the optical model is measured from"), and refuse to
   advance with a sentence that says which one is missing — `bound` is already
   null until a datum exists (MechanicsPanel), which is the silent version of
   this rule.

4. THE RESULT. component + mechanical_template with `footprint_grid: null` —
   that null is what makes it a HOUSING rather than a cube (it is how
   optikit-core's index sorts `housings` from `modules`). Say so on the final
   step: this part places freely on the grid, carries its own mesh, and is not
   yet buildable into a cube.

5. WHAT NEXT, signposted but not done here: "wrap it in a cube" (T3 generate,
   or the WP-84 Inventor round trip). One button that starts WP-111's road
   with this part's optics prefilled.

Acceptance: a user drops a KM05 STEP, says "mirror, 45°, this face is the
reflective plane", and ends with a housed part that places on the grid with its
real mesh and folds a beam correctly in the schematic — with no cube and no
pretence of one.
```

**For humans:** upload the CAD of a real part you own, describe what it does to
light, and point at the surface that does it — and you get a part the editor can
place and simulate, before anyone has designed a cube for it.

---

### WP-113 — Wizard C · an Inventor cube you already have (T1)

```
PROMPT (repos: openUC2-OptiKit + optikit-core)

The road for "the cube already exists": an Inventor export of a whole openUC2
cube with the optic already in it. The output is a T1 module — fixed, no knobs,
the state 27 of 33 curated modules are in.

Steps:

1. THE CUBE. Drop the STEP/GLB. Mount mode is "whole cube module"
   (`bindStore.wholeModule`) — the mesh IS the cube, so the template gets
   `provenance: whole-module` and WP-109's validator will hold it to measuring
   one 50 × 50 × 55 cell. Run that check HERE, at import: a mesh that does not
   measure a cell is the wrong file or the wrong units, and finding out in the
   wizard beats finding out when it renders on its side.

2. THE DATUMS. If the export is marker-stamped (the Inventor naming contract —
   `DOCS/inventor-naming-contract.md`), POST /v1/import/glb extracts the datum
   frames automatically; show what was found and let the user confirm it. If
   not, the user clicks them, with the same naming help as WP-112.3.

3. THE OPTICS. What is inside this cube — the same per-category form as the
   other two roads — and WHERE its surface sits relative to the datums: the
   reflective plane for a mirror, the front vertex + axis for a lens, the
   emission plane for a source.

4. VERIFY BEFORE PUBLISH. `verify_t1` (optikit-core's `library/verify.py`) is
   the check that the optical model and the mechanics agree: the component's
   optical frame and the template's declared insert frame must be within
   POSE_TOL_MM (0.05 mm). It exists only as a CLI command today. Expose it as a
   service endpoint (`POST /v1/library/verify-t1` over a proposed trio, not a
   published id — the wizard has not written anything yet) and run it as the
   last step, showing each finding in plain words. W_NO_INSERT_FRAME in
   particular must be surfaced, not swallowed: a template with no `frames:`
   makes verify-t1's "OK" VACUOUS — it passes without ever comparing a pose,
   which is precisely how a wrong record ships (WP-109 hit exactly this).

5. THE RESULT. The full trio, with the mesh, the states (a mirror's XY/YZ
   planes), and the honest review notes (WP-108's structured form) for anything
   the user could not confirm.

Acceptance: an ME hands over `ASS - 2004 - CUBMIR45TH1 - V03.stp`; six steps
later it is a curated T1 mirror cube that renders its real mesh, folds a beam
at 45°, and passes a non-vacuous verify-t1 — or fails it with a sentence saying
which frame disagrees and by how much.
```

**For humans:** the road for cubes that already exist in CAD — drop the file,
say what optic is inside and where its surface is, and the editor checks that
the model and the metal actually agree before it publishes.

---

## 3. Build order

```
WP-110 (the door + the shell)        ← first: the other three mount inside it
   │
   ├─► WP-112 (housed device)        ← cheapest: every piece exists, needs guidance
   ├─► WP-113 (Inventor cube)        ← next: adds one service endpoint (verify-t1)
   └─► WP-111 (optic → insert)       ← last: the only road with a real backend gap
                                        (a one-part design for the bridge) and the
                                        only one that needs an Inventor machine to
                                        be fully testable
```

WP-112 first is deliberate. It is the road where nothing is missing except the
explanation, so it validates the wizard shell against real use before WP-111
spends effort on the bridge. WP-111 last because it is the only one whose happy
path needs hardware in the loop; its fallback (T3) must be built and proven
first, which WP-112's "wrap it in a cube" signpost already exercises.

## 4. What this round deliberately does not do

- **Retire the tabs.** They are the right editor for changing a field on a
  record you already understand, and WP-102 made writing from them safe. The
  wizard is the way IN, not the only way.
- **Add a fourth road for T2-from-scratch.** "Adjustable along the beam" is a
  step inside WP-111, not its own wizard — the user's question is still "I know
  the numbers", and the DOF is an answer, not a starting point.
- **Loosen `/v1/generate` to accept bare parameters.** The one-part design the
  wizard synthesizes IS the contract; a params-only side door would be a second
  way to say the same thing, and the two would drift.
- **Automate the Inventor step.** WP-111 hands parameters to the bridge and
  shows what comes back; the human-guided, step-by-step debugging of that
  hand-off is explicitly the near-term mode, and the wizard's job is to make
  each step inspectable rather than to hide it.

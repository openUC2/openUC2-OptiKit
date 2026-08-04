# Part 2p · Feedback round 16 (2026-08-04) — the frames were never named

Continues `kicad-for-optics-part2o.md` (the wizard rounds) and the WP-114
hotfix batch. Source: a full walkthrough of the "an Inventor cube you already
have" road with `ASS - 2004 - CUBMIR45°TH1 - V03.glb`, ending in a published
trio (`user.mirror.mirr-test-editor-2`) whose mirror *simulates* correctly and
*renders* in the wrong orientation. WP numbering continues at **WP-115**.

The user's closing sentence is the diagnosis: *"I think there are some
fundamental issues with the coordinate system."* Correct — and the issue is
not that a conversion is wrong somewhere (though one is, WP-120); it is that
the system runs on **four coordinate frames and has never written down which
artifact lives in which frame**. Every symptom in this round is a place where
two subsystems disagree about that unwritten answer.

---

## 0. The investigation — four frames, three contracts, no treaty

The four frames:

| # | frame | definition | who defines it |
|---|---|---|---|
| F1 | **document** | z up, grid 50/50/55, world coordinates | `DSN-CONTRACT.md` §1, `src/document/types.ts` |
| F2 | **record / part-local** | **+z is the optical axis**, front vertex at origin; `rot24 · ΔR` maps F2→F1 | `DSN-CONTRACT.md` §"record's local frame" |
| F3 | **cube / mesh** | the Inventor export's axes: z = pin axis (vertical when mounted), origin at the cube centre | the Inventor naming contract, `library/mesh.py` |
| F4 | **viewer** | three.js y-up render space | `BindScene.tsx` header comment |

The three load-bearing contracts the code actually implements:

1. **The schematic and assembly treat component `optics.ports` as F2.**
   `src/components/schematic/ports.ts` header: *"Local coordinates here are
   DOCUMENT-frame local"* — part-local, mapped to F1 by the part's `rot24`.
   The curated reference record agrees: `openuc2.mirror.flat_45` declares
   `front: -z, reflected: +x` — a 90° fold *in the record frame* — plus
   `mount_angle_deg: 45`, and its own comment says the `reflected` port
   *states* the fold.

2. **The assembly renders the template GLB in F2 with `rot24` alone.**
   `AssemblyScene.tsx:405` — `<group quaternion={shellQuat(rot24)}>
   <GLBModel/>`. There is **no field anywhere in the trio that records an
   F3→F2 rotation**, so this only looks right when the export happens to be
   authored in F2 (the older Rx(−90)-wrapper exports) — `library/mesh.py`'s
   `W_MESH_AXES_PERMUTED` text admits both conventions ship and "a placement
   rotation compensates". The workbench writes `mesh-offset` (the transform
   the user dialled in — this round: rot −89.9/−135/−45) onto the template,
   and **nothing reads it back**: `renderInfoOf` serves a position-only
   `glbOffset` from the palette definition; `bindRecord.ts:499` documents the
   field as read-by-nothing. That is the whole story of *"I have tried
   matching the mirror … it seems that the orientation did not get stored, it
   is sitting in the wrong place still"* — it was stored, into a field with
   no reader.

3. **The bind workbench speaks F3 and re-derives optics from clicks.**
   `bindRecord.ts` `bindToRecords`: *"Records speak the CUBE frame"* — datums
   travel mesh-transform→F3, ports are then **derived from the datum
   direction with a hardcoded `incoming = +x`** (`bindRecord.ts:396`,
   "canonical cube optical axis"). So the fold the user already declared on
   the optics step (`mount_angle_deg`, `reflected` port, F2) is recomputed
   from a click normal in a different frame with a beam axis nobody chose.
   WP-114's `withBoundOptics` then overwrites the record-frame ports with
   these F3 ports — it makes component and template agree (verify-t1 goes
   green) at the price of a **mixed-frame record**: fragment + mount angle in
   F2, frames + ports in F3.

Every reported symptom drops out of the table above:

| symptom (user's words) | root cause |
|---|---|
| step 1 already renders a mirror at 45° with rays | `OpticsOverlay`'s WP-107 record-fallback draws the *seeded draft* (`defaultDraft('mirror')`, 45°) at the origin whenever datums are empty — right for the expert tabs, phantom noise in a wizard step where the user has declared nothing yet |
| "fit to cube" + "add optic" visible in step 1 | WP-114 hoisted ONE `MechanicsPanel` for all viewport steps (to stop WebGL context churn) but the `wholeModule` row (`MechanicsPanel.tsx:438`) and the datum-kind select are not step-scoped |
| "why do we still need the direction +x?" | because `bindToRecords` *derives* the ports from the datum direction instead of *posing* the record — under contract 1 the fold belongs to the record and the datum should only carry WHERE the record frame sits in F3. The user's instinct is exactly the contract's position |
| "would the 24 rotations matter?" | yes — the insert's F2→F3 orientation is precisely a rot24-style discrete rotation (+ residual), and today it is captured nowhere (the click normal and the free gizmo approximate it, unquantized) |
| glyph at 45° but ray sketch folds differently | three preview sources: glyph fold = `foldDegOfDraft` (ports); ray sketch = `mount_angle − 90` plate convention (`RaySketch.tsx`); overlay = record fallback. With mixed-frame ports (contract 3) they cannot agree |
| verify step is opaque | it returns sentences; nothing draws the two frames it compared |
| mechanics tab still editable after publish; save greyed | opening a record **clears datums** (`bindStore.loadMesh`), so the tab shows an empty workbench for a bound part, `bound` is null, and "Package · write" is disabled with only a tooltip saying why; nothing rehydrates the binding from the published template frames, and nothing freezes a published pair |
| assembly shows the cube in the wrong orientation | contract 2: no F3→F2 field, `mesh-offset` unread |
| measured box 49.8 × 54.4 × 49.8 vs core's 49.8 × 49.8 × 54.4 | `BindScene.tsx:156` reports the bbox through a y/z swap (F4→F1) that optikit-core does not apply — the filed axis-basis task |

**The one-sentence treaty this round must ratify:** *component optics live in
F2; the mesh lives in F3; the binding (template/module) carries the explicit
F2→F3 pose; renderers compose pose ∘ rot24; nothing derives optics from
geometry clicks.* Everything below is that sentence, cut into packages.

---

## 1. The work packages

### WP-115 — Ratify the frame treaty (schema + core + docs)

```
PROMPT (repos: optikit-core first, then openUC2-OptiKit; blocking for the rest)

Name the frames, once, normatively, and give the F2→F3 pose a home in the
record trio.

1. DSN-CONTRACT.md gains a "Frames" section: F1 document, F2 record (+z
   optical axis), F3 cube/mesh (z = pin axis, origin = cube centre), F4
   viewer. State the treaty sentence. The rot24.svg drawing gets a sibling
   showing F2 sitting inside F3 for the 45° mirror cube — the picture this
   round was missing.

2. The BINDING carries the pose. On `mechanical_template` (the insert side is
   mechanical truth): a typed `insert-pose` block —
     insert-pose: {rotation: {grid: {z: +x, x: -z}, offset-deg: {...}},
                   translation: {offset-mm: {...}}}
   — the SAME rot24 + residual spelling the design pose uses (§3 of the
   contract), because the insert-in-cube orientation IS a 24-fold discrete
   rotation plus residuals (the user said this verbatim: "N*90° in X/Y/Z
   around the origin"). `template.frames` stays as the F3 positions verify-t1
   compares; `insert-pose` is what MAKES them from the component's F2 frames.

3. verify_t1 uses it: pose ∘ component.optics.frames must equal
   template.frames within POSE_TOL_MM — and W_NO_INSERT_FRAME gains a
   sibling W_NO_INSERT_POSE (a template with frames but no pose is the new
   vacuous-adjacent state). A missing pose defaults to identity so every
   published record stays valid.

4. The mesh declares its frame: `mesh-frame: cube | record` on the template
   (default `cube` — the Inventor convention). `library validate`'s
   axes-permuted warning upgrades to a plain error when the declared frame
   makes the envelope check unambiguous.

5. Retire `mesh-offset` (write-only since WP-109, and this round proved a
   user can pour real work into it and lose it). The bind workbench's mesh
   transform must either become part of `insert-pose`/`mesh-frame`
   normalization at save time, or be refused with a sentence — never
   silently recorded into a dead field again.

Acceptance: the contract names the four frames; a trio can state "this F2
record sits in this cube rotated grid {z:+x, x:-z}"; verify-t1 checks through
the pose; `optikit-core library validate` over the existing library passes
with identity poses everywhere.
```

**For humans:** we write down, once, which coordinate system each file speaks
— and give the record trio the one field it always needed: how the optic's
frame sits inside the cube.

---

### WP-116 — The datum step becomes "place the record frame" (kill the click-derived optics)

```
PROMPT (repo: openUC2-OptiKit; needs WP-115's insert-pose)

The datum step stops asking physics questions the optics step already
answered.

1. bindToRecords: DELETE the port-derivation path — the hardcoded
   `incoming = +x`, the reflection-law recomputation, the datum-direction →
   port mapping (bindRecord.ts:394-412). The component's ports are the
   optics step's ports, verbatim, in F2, always. (This also reverts
   WP-114's withBoundOptics port overwrite — it was the honest fix for the
   wrong layer; keep the function, but it merges FRAMES-VIA-POSE now, never
   ports.)

2. What the step authors instead: the F2→F3 pose of WP-115 —
     · a rot24 stepper for the orientation (24 poses, the user's "N*90°";
       the four z-yaws first since pins constrain the cube, the rest behind
       "more…"), residual pitch/roll/yaw typed fields for the off-axis case;
     · the frame origin: click the mirror surface / front vertex on the mesh
       to set translation (the click is a POSITION picker now, not a
       direction oracle);
     · a live AS-MOUNTED readout derived from pose ∘ record ports: "beam
       enters the cube's -x face, leaves through -z" — the sentence that
       replaces the direction dropdown.
3. The datum list rows show pose (position + rot24 + residuals), not
   kind/direction; the beam overlay renders pose ∘ record optics so the fold
   the user typed in step 2 is what folds on screen — one source of truth.
4. templates emit: frames = pose ∘ component frames (F3 numbers verify-t1
   compares), insert-pose = the pose itself.

Acceptance: binding the 45° mirror cube requires ZERO direction choices —
category + mount angle (optics step), then one click for the origin and one
rot24 pick; the emitted trio passes verify-t1 non-vacuously; the as-mounted
sentence matches what the assembly then renders.
```

**For humans:** you tell the optics step what the mirror does, and the datum
step only where its frame sits in the cube — position plus one of 24
rotations — and the beam directions are computed for you instead of asked of
you.

---

### WP-117 — The wizard viewport tells only the step's story

```
PROMPT (repo: openUC2-OptiKit)

The shared viewport (kept for WebGL-context sanity, WP-114) must scope its
CONTROLS and OVERLAYS per step.

1. Step 1 "the cube": mesh + ghost cell + fit-to-cube ONLY. No optics
   overlay (the seeded 45° phantom with beam arrows is gone — OpticsOverlay
   is gated off until the optics step is COMPLETE), no add-optic select, no
   datum-kind select, no datum list.
2. Step 2 "the optics": the record-frame preview belongs to the RIGHT panel
   (glyph + ray sketch already there); the viewport keeps showing the plain
   mesh. The "what this will do to a beam" chips say, explicitly, "in the
   record frame — where it points inside the cube is the next step".
3. Step 3 "the datums": the pose tools of WP-116 appear; fit-to-cube
   disappears (the cube is already fitted or step 1 refused).
4. MechanicsPanel embed prop grows the scoping switches this needs
   (showMountRow / showDatumTools / showOverlay) — the expert tab keeps
   everything, unchanged.

Acceptance: at every step, every visible control acts on that step's
question; a user who has declared nothing sees nothing optical.
```

**For humans:** no more 45° mirror floating in an empty cube before you have
said anything — each step shows only its own tools.

---

### WP-118 — Reopening a bound part restores the binding (and freezes it)

```
PROMPT (repo: openUC2-OptiKit)

Opening a published pair currently clears the workbench (datums wiped on
loadMesh), leaves every control live, and greys the save with only a tooltip
saying why — the user read it as "cannot save, can still corrupt".

1. REHYDRATE: opening a record whose template is resolvable reconstructs the
   bind state — mesh (already done), insert-pose + template frames back into
   the pose tools, category datum shown at its pose. The mechanics tab of a
   bound part shows the binding as it is, not an empty workbench.
2. FREEZE by default: a resolvable published pair opens read-only — viewport
   navigable, fields disabled, one primary "edit the binding…" button that
   unlocks and bumps the draft version. (The wizard's roads are unaffected —
   they always author.)
3. SAY WHY, in place: the Package/write button's disabled reasons move from
   the tooltip into a visible sentence under the button (the same
   refuse-with-a-sentence rule the wizard steps follow).

Acceptance: open user.cube.mirr-test-editor-2 → the mirror's pose is on
screen, everything is read-only, "edit the binding…" unlocks, and a save is
either possible or refused with a visible sentence — never silently greyed.
```

**For humans:** opening a finished part shows the finished binding, locked;
one button starts a deliberate edit; and when saving is impossible the reason
is written next to the button, not hidden in a hover.

---

### WP-119 — Verify you can see

```
PROMPT (repo: openUC2-OptiKit; optikit-core response shape is sufficient)

verify-t1's findings become something to LOOK at.

1. The verify step renders the viewport with BOTH frames drawn: the
   component's optical frame carried through the insert-pose (F2→F3) and the
   template's declared frame — two axis triads, connected by a delta arrow
   labelled in mm (and degrees when WP-115's pose lands).
2. Agreement (≤ 0.05 mm) draws them merged in green; disagreement draws the
   arrow in red with the offending axis named — the E_POSE_MISMATCH sentence
   stays underneath, now with a picture.
3. The vacuous-OK warning (W_NO_INSERT_FRAME / W_NO_INSERT_POSE) renders as
   an empty dashed triad where the template frame should be — absence you
   can see.

Acceptance: the mirr-test-editor-2 failure from this round would have shown
two triads 5 mm apart with a red arrow — no reading required.
```

**For humans:** the verify step draws the two frames it compares — matching
frames merge in green, disagreeing ones are joined by a red arrow with the
distance on it.

---

### WP-120 — One measurement basis (the y/z swap and the wrapper nodes)

```
PROMPT (repo: openUC2-OptiKit; extends the filed axis-basis task)

The frontend measures meshes through the viewer basis; optikit-core reads
file-native axes. Same GLB, two different boxes (49.8 × 54.4 × 49.8 vs
49.8 × 49.8 × 54.4) — and the workbench WRITES its version into published
envelopes.

1. BindScene reports bbox size AND centre in the file's native axes (drop
   the [s.x, s.z, s.y] swap and the threeToDoc on the centre) so frontend
   and core agree on every mesh.
2. Detect the Rx(−90) wrapper node at load (the two-conventions case
   mesh.py warns about) and NORMALIZE: bake the wrapper away so F3 is the
   one mesh frame downstream code sees; record `mesh-frame` (WP-115.4).
3. cellMismatch / insertFit / offCentreNote drop their orientation-
   independence workaround (kept honest by a comment pointing here) once the
   basis is single — the regression tests flip from "accept both bases" to
   "there is only one basis".

Acceptance: the frontend chip and `library validate` print the same three
numbers for every GLB in the library; the orientation-independent check is
gone and openuc2.tpl.mirror_1x1 still passes.
```

**For humans:** the size the editor shows becomes the size the validator
checks — one set of numbers per mesh, whichever tool prints them.

---

## 2. Build order

```
WP-115 (frame treaty: contract + schema + verify)   ← blocking, smallest code
   │
   ├─► WP-116 (pose-based datum step)               ← the road's core fix
   │      └─► WP-117 (step-scoped viewport)         ← UX cleanup on top
   ├─► WP-118 (rehydrate + freeze + visible reasons)
   ├─► WP-119 (verify drawn)                        ← after 115's pose exists
   └─► WP-120 (one basis + wrapper normalization)   ← independent, any time
```

WP-115 first because every other package writes or reads the pose; it is
also the only one that touches optikit-core's schema and must not be designed
twice. WP-120 is independent and can run in parallel.

## 3. What this round deliberately does not do

- **Migrate the existing library.** Identity poses keep every published trio
  valid (WP-115.3); records get true poses as they are next edited. A bulk
  migration is a later, mechanical PR once the treaty has survived use.
- **Make the wizard place the insert in the SCHEMATIC's rot24.** The
  insert-pose (F2→F3) and the part pose (F2→F1) are different rotations that
  happen to share arithmetic; conflating them is how this mess started.
- **Auto-detect the mirror plane from the mesh.** Tempting (the Inventor
  naming contract's PLN markers already do it for stamped exports); for
  unstamped files the click stays — but as a position picker, not a
  direction oracle.

## 4. Open questions (answers change WP-115/116 details)

1. **Insert rotations — all 24, or fewer?** The cube's pins fix F3's z
   vertical; if inserts can also mount sideways (optical axis vertical), all
   24 apply; if inserts only ever yaw about the pin axis, 4 suffice and the
   stepper gets much simpler. Which is mechanically true for the current
   cube generation?
2. **Where does the pose live** — on the `mechanical_template` (the insert
   is a mechanical fact, one pose per template) or on the `cube_module` (the
   same optic+insert could bind at different poses)? WP-115 assumes the
   template; a module-level override can come later if a real part needs it.
3. **Freeze scope (WP-118):** freeze any record opened from the published
   library, or only trios that pass verify-t1? (A failing pair arguably
   *should* open editable.)
```

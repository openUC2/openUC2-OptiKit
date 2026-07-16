# Mechanical engineering guide

**Status:** guide · 2026-07-15
**Audience:** the mechanical engineer modelling openUC2 holders in Inventor
**Companion:** [`inventor-naming-contract.md`](inventor-naming-contract.md) — the
naming rules this guide tells you *how* to work with. Where the two disagree,
the contract wins.

Your holder is only half the deliverable. The other half is telling optikit
**where the light goes** — which surface is the optical datum, which way the beam
runs, how wide the clear aperture is. This guide covers the three ways to produce
a holder, and the one rule that decides whether your intent survives export.

---

## The one rule

> **A datum must be a placed part occurrence.**
> Not a work plane. Not a body. An occurrence.

Everything else here is detail. This is the part that silently bites.

**Work planes, work axes and work points do not survive export.** They are
construction geometry. Inventor's STEP translator never writes them, and neither
cascadio nor Inventor's own glTF exporter emits a node for them. A part carrying
`PLN - SRC - out` as a work plane exports to a GLB containing exactly one node:
the solid. Your datum is gone, with no warning anywhere.

**Named bodies don't survive either.** Body names *do* reach the STEP file, which
makes this one especially convincing — right up until GLB conversion collapses a
multi-body part into a single node and discards them.

Only **occurrence names** survive, with their full transform. So a datum has to be
real geometry: a tiny marker part, placed, and renamed in the browser tree.

You do not have to give up work planes as a modelling tool — see
[Path A](#path-a-inventor-first), step 3. Author them however you like, then
convert them.

---

## Which path

| | You have | You want | Path |
|---|---|---|---|
| **A** | An optic, and freedom to design the mount | Full control of the mechanics | [Inventor-first](#path-a-inventor-first) |
| **B** | An optical part already in the optikit library | A holder that fits it exactly | [optikit-first](#path-b-optikit-first) |
| **C** | A STEP of the optic and no appetite for CAD | A printable holder, now | [T3 generative](#path-c-t3--no-cad-at-all) |

Try them in reverse order. **C costs minutes and no CAD**; if the generated
holder fits, you are done. A is the most work and the most control.

---

## Path A: Inventor-first

Model the holder, mark the optics, export.

### 1. Model the holder

Normal work. Keep it inside the 50 × 50 × 55 mm grid cell (that is one UC2
footprint; multiples are fine). Name occurrences per the
[contract](inventor-naming-contract.md#node-prefixes): `PRT - …` for printed
parts, `BUY - …` for the purchased optic, `TP …` for screws.

The `BUY` name carries the prescription, and it is worth getting right — it is
where the optical model comes from:

```
BUY - Lens - f40 D12.7 sI2.8 R25 pl-cx
```

### 2. Get the marker parts

Once per workstation:

```
python stamp_datums.py --init-lib
```

This writes `DATUM-DISC.ipt`, `DATUM-AXIS.ipt` and `DATUM-PT.ipt` into
`./datum-markers`. Keep them somewhere shared and point `--marker-lib` at it.

### 3. Mark the optics

Either place the marker parts directly, or — the easier habit — **model with work
features and convert them**:

```
python stamp_datums.py --from-work-features
```

Any work plane named `PLN - <ROLE> - <frame>`, work axis named `AXIS - <ROLE>` or
work point named `PT - <name>` becomes a real marker occurrence at the same pose.
Author with the tool that feels natural; ship geometry that actually exports.

A minimal lens cube wants three:

| Marker | Says |
|---|---|
| `PLN - OPT - optical` | where the optical datum sits — **and its disc diameter is the clear aperture** |
| `AXIS - OPT` | which way the beam runs |
| `PT - FOCUS` | where it focuses |

**Scale the disc to the true clear aperture.** That diameter is not decoration —
optikit reads it as the limiting aperture, and it outranks the nominal glass
diameter from the `BUY` prescription, because it is the number measured on your
mechanics.

### 4. Validate before exporting

```
python stamp_datums.py --validate
```

It reports exactly what optikit will complain about later — missing `PLN`/`AXIS`
markers, malformed names, duplicate frames, an axis that is not cube-aligned, and
markers mistakenly left as bodies. Fix them here; the feedback loop is seconds
rather than a round-trip through export and import.

### 5. Export

```
python batch_iam_to_stp_glb.py <iam_folder> <stp_out> <glb_out> --overwrite
```

STEP via Inventor, GLB via cascadio, and a `__mm_scale__` root node added so
downstream reads millimetres. **Do not hand-roll this step** — see
[Units](#units-the-1000-trap).

### 6. Import

```
cd optikit-core
uv run optikit-core import glb <glb_out>/ASS_-_2028_-_….glb
uv run optikit-core library validate
```

`import glb` prints a `review:` block listing everything it could not determine.
An unmarked part imports fine — it just falls back to guessing the optical frame
from the `BUY` node's origin and assuming the beam runs `+z`, and says so. **A
record with an empty review block is the goal**; markers are how you get there.

Some review items are expected and are yours to resolve by hand — glass is always
a placeholder (`N-BK7`), surface signs are always a guess, and a T2 insert's DOF
travel is always left blank.

---

## Path B: optikit-first

When the optic already exists in the library, build the holder around the real
solid instead of around a drawing of it.

### 1. Take the STEP from the library record

Optical components ship their geometry next to their YAML:

```
optikit-core/library/components/thorlabs.lens.ac254-050-a/
  component.yml
  model.step      <-- this
  model.glb
```

> **Note.** The bind workbench (`/configurator/bind`) is where an optic's STEP and
> its pose get *into* the library, and it is the right place to set that pose. It
> does **not** export an STP for you — it only re-emits bytes someone already
> uploaded. So take `model.step` from the record directly.

### 2. Import it into Inventor

Place it as a component and **constrain it, do not redraw it**. Its origin is the
component's optical datum, so keep it there rather than moving the optic to suit
the mount.

### 3. Model the holder around it, then mark it

As [Path A](#path-a-inventor-first) from step 3. One difference worth the
discipline: put `PLN - OPT - optical` on the surface the *library record* calls
the optical datum, not on whatever face is convenient. That is what makes the
holder and the optical model agree.

### 4. Export and import

Same as Path A steps 5–6.

---

## Path C: T3 — no CAD at all

Give a STEP of the optic to a generator and let cadquery carve a holder around it
(WP-21). No Inventor, no markers.

Write a template record — YAML only, no geometry:

```yaml
kind: mechanical_template
id: openuc2.tpl.holder_ac254_050_a
version: 0.1.0
class: generative
description: Printable boolean holder for the AC254-050-A doublet (two halves, M3 cut-offs)
tags: [holder, generated, insert/lens]
envelope: {x-mm: 50, y-mm: 50, z-mm: 50}
generator:
  script: generators/boolean_holder_1x1.py
  params:
    part_step: library/components/thorlabs.lens.ac254-050-a/model.step
    part_position_mm: {z: -5.75}
    clearance_mm: 0.15
    split_plane: xz
    body_height_mm: 30
optical_ports:
  front: {frame: optical, direction: -z}
  back: {frame: optical, direction: +z}
footprint_grid: [1, 1, 1]
```

Then:

```
cd optikit-core
uv run optikit-core generate openuc2.tpl.holder_ac254_050_a
uv run optikit-core generate openuc2.tpl.holder_ac254_050_a --param clearance_mm=0.25 --force
```

`boolean_holder_1x1.py` subtracts the optic (grown by `clearance_mm`) from a 1×1
insert body, splits it on `split_plane`, and adds M3 cut-offs. It emits **STEP,
STL and GLB per half** — `model.half-ypos.*` and `model.half-yneg.*` for the
default `xz` split — into `out/<template-id>/<param-hash>/`, plus a `meta.json`
carrying the bbox and a `fits_envelope` verdict. Generation **fails loudly** if
the result busts 50 × 50 × 50 mm.

Useful parameters: `clearance_mm` (0–1, default 0.15 — your printer's fit),
`split_plane` (`xz`|`yz`), `body_height_mm` (≤50), `part_position_mm` /
`part_rotation_deg` to pose the optic, `screw_positions`.

`out/` is **gitignored**. For T3 you commit the `template.yml` and nothing else —
the geometry is reproducible from it, and the param hash in the output path means
a given set of parameters always lands in the same place.

**If cadquery won't install** for your interpreter, the harness shells out to
`uv run --no-project --with cadquery …` automatically. You do not need cadquery
in your own environment.

---

## What to commit

| Path | Commit | Don't commit |
|---|---|---|
| A / B (T1, T2) | `template.yml`, `component.yml`, `module.yml`, plus `model.glb` / `model.step` beside them | the `.iam`/`.ipt`, intermediate STP |
| C (T3) | `template.yml` only | anything under `out/` |

Records live in `optikit-core/library/{components,templates,modules}/<id>/`. Ids
are `<namespace>.<kind>.<name>`; versions are strict semver and **CI rejects a
changed record that didn't bump its version**.

Finish with:

```
uv run optikit-core library build
```

which validates everything and regenerates `library/dist/index.json` — the index
the frontend reads. It refuses to write if validation fails.

---

## Units: the 1000× trap

Worth understanding, because it is silent.

STEP is millimetres. glTF has **no unit at all** — cascadio writes plain numbers
that happen to be metres. So a 12.5 mm datum arrives in the GLB as `0.0125`, and
optikit, reading millimetres, sees `0.0125 mm`.

The contract closes this with a `__mm_scale__` root node (scale 1000) that puts
the scene back in mm. `batch_iam_to_stp_glb.py` adds it after conversion; if you
call `cascadio.step_to_glb` yourself, you must too.

Nothing crashes when it's missing — that's the trap. The envelope calculation
clamps the resulting zero up to one grid cell, so a wrong import looks like a
plausible one. `import glb` now flags a GLB with no `__mm_scale__` root; if you
see that review item, **re-export rather than talk yourself into the numbers.**

## Known Windows annoyances

- `optikit-core --help` (top level only) crashes with `UnicodeEncodeError` on a
  cp1252 console — a Greek letter in the `cubify` help text. Subcommand help is
  fine. Workaround: `set PYTHONIOENCODING=utf-8`.
- `import glb` can hit the same thing when printing review text.

## Quirks worth knowing

Found the hard way against Inventor 2025.3, in case you script against the API:

- Inventor's internal API unit is **centimetres**, not mm.
- `Matrix.SetToRotation` / `SetToRotateTo` — there is no `SetRotation`.
- On an **assembly**, `WorkPlanes.AddByPlaneAndOffset` raises; use
  `AddFixed(point, uX, uY)`. It works on parts.
- `WorkAxes.AddFixed(point, vector)` rejects the obvious signature.
- `step:` on a template record is a **de-facto convention, not schema** — it
  survives because unknown keys are tolerated, and nothing in optikit-core reads
  it. Don't rely on it. The declared geometry-source fields are `glb:`,
  `inventor:` and `generator:`.

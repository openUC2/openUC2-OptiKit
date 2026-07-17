# Inventor → GLB node-naming contract

**Status:** contract · v2.1 · 2026-07-16
**Consumed by:** `optikit-core import glb` (`src/optikit_core/importers/glb2template.py`)
**Authored/validated by:** `stamp_datums.py` (PyInventor, runs on the Inventor machine)
**Exported by:** `batch_iam_to_stp_glb.py` (PyInventor — the `.iam → .stp → .glb` pipeline)
**How to work with it:** [`mechanical-engineering-guide.md`](mechanical-engineering-guide.md)

## The export pipeline (PyInventor)

Two scripts on the Inventor (Windows) machine own the boundary:

```bash
# 1 · stamp/validate datums on the OPEN assembly
python stamp_datums.py --init-lib              # once: generate DATUM-*.ipt marker parts
python stamp_datums.py --from-work-features    # contract-named work features → marker occurrences
python stamp_datums.py --validate --strict     # exit 1 on any contract violation

# 2 · batch-export a folder of assemblies
python batch_iam_to_stp_glb.py <iam_folder> [stp_out] [glb_out] --overwrite
```

`batch_iam_to_stp_glb.py` opens every `.iam` via Inventor COM and `SaveAs`-copies
it to `.stp` (per-file isolated, one bad file can't poison the batch), then
converts each STEP to GLB with **cascadio** and injects the **`__mm_scale__`**
root node (scale exactly 1000): STEP is millimetres but cascadio writes glTF
metres, and glTF carries no unit of its own. Without the node every length
reaches optikit 1000× too small — silently, because the envelope calculation
clamps the resulting zero up to one grid cell rather than failing.

> **v2 adds named datum markers.** Before v2 the optical frame was inferred from
> the `BUY` node's origin and ports were assumed `±z`. That guess is now a
> fallback that gets **review-flagged**; a part that carries datum markers states
> its frames, its optical axis, and its clear aperture explicitly. See
> [Datum markers](#datum-markers).

The openUC2 Inventor export pipeline names every node in the GLB by a fixed
convention. `glb2template` relies on it to derive a mechanical template, an
optical component, and a cube module from geometry alone — **no manual
annotation**. Keeping future exports faithful to this contract keeps ingestion
automatic; deviating from it forces the fields into the record's `review:`
block instead of failing.

Verified against `ASS - 2028 - CUBLEND12.7F40 - V04`
(the 12.7 mm f/40 plano-convex lens cube). The v2 datum-marker rules were
verified on Inventor 2025.3 by round-tripping stamped markers through the real
`.iam → .stp → .glb` pipeline (see [Datum markers](#datum-markers)).

## Node prefixes

| Prefix | Meaning | Role in ingestion |
|---|---|---|
| `__mm_scale__` | root scale node (authored in meters, scale ≈ 1000 → mm) | its transform is honored; all geometry is read in the resulting **mm** frame |
| `ASS - <num> - <name> - <rev>` | assembly root | supplies the record id slug and description |
| `SUB - <num> - <name> - virt ass` | sub-assembly | a SUB whose `<name>` contains **`MASINS`** is the master insert → template class **T2 (adaptive)**; its absence → **T1 (fixed)** |
| `PRT - <num> - <name>` | printed part | `CUBHLF*` = cube half, `MASLCK` = lock, `MASINS*` = insert body; contribute to the envelope bbox |
| `BUY - <descr>` | purchased part | if `<descr>` names an optic (`Lens`/`Mirror`/`Filter`/`Window`/`Prism`) it defines the optical component; the optical datum frame sits at this node's origin |
| `TP <descr>` | trade part (screws, adhesive pads) | ignored for optics |
| `PLN - <ROLE> - <frame>` | **datum marker** — plane | → `optics.frames.<frame>` (origin + rotation) and the clear-aperture disc |
| `AXIS - <ROLE>` | **datum marker** — axis | → `optics.ports.*.direction` |
| `PT - <name>` | **datum marker** — point | → `optics.frames.<name>` (origin only) |

Every node name may carry a glTF instance suffix `:N` (e.g. `…:1`); it is
stripped before matching.

Note `PT` and `PRT` are distinct prefixes, as are `PT -` (datum point) and
`TP ` (trade part). Matching is on the whole prefix token, so they never
collide.

## Datum markers

### Why markers and not work planes

**Inventor work planes, work axes and work points do not survive export.** They
are construction geometry: the STEP translator never writes them (their names do
not appear anywhere in the STEP text), and neither the cascadio STEP→GLB
converter nor Inventor's own glTF translator emits a node for them. Verified on
Inventor 2025.3 — a part carrying `PLN - SRC - out`, `PLN - SNS - sensor` and
`PT - FOCUS` as work features exported to a GLB containing exactly one node, the
solid.

So a datum has to be **real geometry** to cross the export boundary. A datum
marker is a tiny, dedicated **part** placed into the assembly, whose *occurrence
name* carries the datum name.

### The occurrence rule

> A datum marker MUST be a placed **part occurrence**. It MUST NOT be a solid
> **body** inside a larger part.

This is not a style preference. Body names reach the STEP file but are lost in
GLB conversion — OCCT collapses a multi-body part into a single node named after
the part, discarding body names. Occurrence names survive as node names with
their full transform. Verified both ways on Inventor 2025.3.

Marker parts live in the shared library and are placed repeatedly; only the
occurrence name and the placement change:

| Marker part | Geometry (as `--init-lib` creates it) | Carries |
|---|---|---|
| `DATUM-DISC.ipt` | disc, created ⌀ 1 mm × 0.1 mm thick — **scale each occurrence to the true clear aperture** | origin, normal, **aperture diameter** |
| `DATUM-AXIS.ipt` | rod along its local +z, ⌀ 0.1 mm × 5 mm long | origin, direction |
| `DATUM-PT.ipt` | stub cylinder, ⌀ 0.2 mm × 0.2 mm tall | origin only |

Because the disc's diameter *is* the clear aperture, one marker states the frame
and the aperture together — scale the placed disc to the true optical clear
diameter (`stamp_datums.py --init-lib` deliberately makes it 1 mm so an
unscaled disc is obvious in review).

### Semantics

`PLN - <ROLE> - <frame>` → an entry in `optics.frames` keyed `<frame>`:

- **origin** — the marker node's origin, in the `__mm_scale__` (mm) frame,
  expressed relative to the `ASS` root → `x-mm`, `y-mm`, `z-mm`.
- **rotation** — the marker's local +z (the disc normal) → `frames.<frame>.rotation`
  as a `[x, y, z, w]` quaternion. An axis-aligned disc yields identity.
- **clear aperture** — the disc's in-plane diameter → the frame's
  `clear-aperture-mm`.

`AXIS - <ROLE>` → a beam direction. The marker's local +z is mapped to the
nearest of the six axis literals `±x ±y ±z` that `ports.direction` accepts.
`ROLE = OPT` is the component's optical axis and sets the direction of both
ports. A marker more than **1°** off the snapped axis is review-flagged; more
than **20°** is an error (it exceeds the compiler's `ANGLE_TOL_DEG`).

`PT - <name>` → an entry in `optics.frames` keyed `<name>`, origin only,
identity rotation, no aperture. `PT - FOCUS` conventionally marks the focal
point of the component.

### Roles

| `<ROLE>` | Meaning |
|---|---|
| `SRC` | a source's emission datum |
| `SNS` | a sensor's active-area datum |
| `OPT` | the optical datum of a passive component; `AXIS - OPT` is its axis |

Worked example — a lens cube exporting an explicit datum set:

```
ASS - 2028 - CUBLEND12.7F40 - V04
├── PRT - 1003 - CUBHLF111 - V04
├── BUY - Lens - f40 D12.7 sI2.8 R25 pl-cx
├── PLN - OPT - optical      (DATUM-DISC ⌀12.7 @ z = 12.5)
├── AXIS - OPT               (DATUM-AXIS along +z)
└── PT - FOCUS               (DATUM-PT @ z = 52.5)
```

yields

```yaml
optics:
  frames:
    optical: {x-mm: 0, y-mm: 0, z-mm: 12.5, clear-aperture-mm: 12.7}
    focus:   {x-mm: 0, y-mm: 0, z-mm: 52.5}
  ports:
    front: {frame: optical, direction: -z}
    back:  {frame: optical, direction: +z, after-surface: 1}
```

### Markers are not geometry

Marker occurrences are excluded from the envelope bounding box and from the
mechanical template's mesh. They are metadata that happens to be shaped like a
solid; a marker must never be printed, and the ME guide's export step strips
them from the mechanical STP.

## BUY optic prescription

A lens BUY name encodes the prescription as space-separated tokens after the
category word, e.g.:

```
BUY - Lens - f40 D12.7 sI2.8 R25 pl-cx
```

| Token | Meaning | Unit |
|---|---|---|
| `f<n>` | effective focal length | mm |
| `D<n>` | clear diameter (→ semi-aperture = D/2) | mm |
| `sI<n>` | center thickness | mm |
| `sA<n>` | edge thickness | mm |
| `R<n>` | radius of curvature | mm |
| `<a>-<b>` | shape: `pl` plano, `cx` convex, `cv` concave, `bi` biconvex/biconcave | — |

Shape → surfaces (Optiland fragment):

- `pl-cx` → plano (∞) + convex; `pl-cv` → plano + concave
- `cx-pl` / `cv-pl` → curved + plano
- `bi-cx` → biconvex (±R); `bi-cv` → biconcave (∓R)

Mirror BUY names (`Mirror - 40x30x2`) yield a single reflective flat surface.

## What ingestion always flags for review

The parser never guesses these silently — they land in `review:` and on stderr:

- **glass** — set to `N-BK7` as a placeholder; the real material comes from the
  vendor datasheet.
- **surface orientation / radius signs** — the front/back assignment and sign
  convention is a best guess; verify by tracing the compiled path.
- **DOF range** — a T2 insert's travel (`dz.range`) is left `null`; measure the
  insert's mechanical travel and fill it in.
- Any **unparsed prescription token** or **missing thickness**.
- **datum fallback** — a component with no `PLN`/`AXIS` marker falls back to the
  pre-v2 behaviour (optical frame at the `BUY` node origin, ports assumed `±z`).
  This is a guess and is always flagged: *"no datum markers — optical frame fell
  back to the BUY node origin; add PLN/AXIS markers"*. Adding markers is how a
  part stops being a draft.
- **off-axis marker** — an `AXIS` marker more than 1° from the axis it snapped to.
- **missing aperture** — a `PLN` marker whose disc diameter could not be measured.

## fx parameters (WP-35 — the optikit → Inventor T2 loop)

The adaptive (T2) direction of the pipeline: optikit writes optimized dof
values, Inventor's parametric model follows.

**Naming rule: the Inventor USER PARAMETER (fx) name IS the dof name.** A
template record declaring `dof: [{name: dz, …}]` requires a user parameter
`dz` on the **master-insert part** (`PRT - … - MASINS…`). Units are always
millimetres in the changeset; `apply_fx_params.py` converts to Inventor's
internal centimetres.

Flow:

```console
# optikit side (after /v1/optimize wrote instantiation.dof_values):
optikit-core fx my-setup.dsn -o optikit-fx.json

# Inventor machine (assembly open):
python apply_fx_params.py optikit-fx.json --dry-run   # inspect
python apply_fx_params.py optikit-fx.json --export    # apply + re-export STP/GLB
```

The changeset (`optikit-fx/v0`) carries one entry per T2 part:
`{component, template-id, parameter, value-mm}` plus, for groove-lattice
templates (`TemplateRecord.grooves`), a `groove: {pair, midpoint-mm,
delta-mm}` decomposition — the **pair** is which grooves the holder clamps
(physical, not a dimension), and if the master insert declares
`<dof>_midpoint` / `<dof>_delta` user parameters they receive the decomposed
values instead of the raw dz.

T1 states (positional representations): a change with `parameter: state`
selects the Inventor positional representation named by its value (e.g. the
45° mirror's `XY` ⇄ `YZ`) before export — T1 has no dimensions to set, only a
configuration to pick. The motor/firmware alternative for actuated dofs is
WP-26 (same dof value, different actuator).

ME-guide warning (from the mechanical-templates doc): Inventor parts and
assemblies are cross-linked between designs — **always copy a design before
editing**; never apply fx changes to a library master in place.

## Adding new conventions

If a future part needs a field the contract cannot express (a new optic type, a
second DOF, a coating), extend this document *and* `glb2template.py` together,
and add the part's GLB to `tests/fixtures/glb/` with an assertion. The naming
contract is the interface — treat a change to it like a schema change.

# Inventor → GLB node-naming contract

**Status:** contract · 2026-07-13
**Consumed by:** `optikit-core import glb` (`src/optikit_core/importers/glb2template.py`)

The openUC2 Inventor export pipeline names every node in the GLB by a fixed
convention. `glb2template` relies on it to derive a mechanical template, an
optical component, and a cube module from geometry alone — **no manual
annotation**. Keeping future exports faithful to this contract keeps ingestion
automatic; deviating from it forces the fields into the record's `review:`
block instead of failing.

Verified against `ASS - 2028 - CUBLEND12.7F40 - V04`
(the 12.7 mm f/40 plano-convex lens cube).

## Node prefixes

| Prefix | Meaning | Role in ingestion |
|---|---|---|
| `__mm_scale__` | root scale node (authored in meters, scale ≈ 1000 → mm) | its transform is honored; all geometry is read in the resulting **mm** frame |
| `ASS - <num> - <name> - <rev>` | assembly root | supplies the record id slug and description |
| `SUB - <num> - <name> - virt ass` | sub-assembly | a SUB whose `<name>` contains **`MASINS`** is the master insert → template class **T2 (adaptive)**; its absence → **T1 (fixed)** |
| `PRT - <num> - <name>` | printed part | `CUBHLF*` = cube half, `MASLCK` = lock, `MASINS*` = insert body; contribute to the envelope bbox |
| `BUY - <descr>` | purchased part | if `<descr>` names an optic (`Lens`/`Mirror`/`Filter`/`Window`/`Prism`) it defines the optical component; the optical datum frame sits at this node's origin |
| `TP <descr>` | trade part (screws, adhesive pads) | ignored for optics |

Every node name may carry a glTF instance suffix `:N` (e.g. `…:1`); it is
stripped before matching.

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

## Adding new conventions

If a future part needs a field the contract cannot express (a new optic type, a
second DOF, a coating), extend this document *and* `glb2template.py` together,
and add the part's GLB to `tests/fixtures/glb/` with an assertion. The naming
contract is the interface — treat a change to it like a schema change.

# KiCad for Optics — Execution Plan v1 (Go-independent track)

**Status:** adopted · 2026-07-12 · supersedes the WP numbering in
[kicad-for-optics-workplan.md](kicad-for-optics-workplan.md) (strategy there still applies)
**Mode:** we **dictate the standard** (Pydantic → JSON Schema + golden corpus) and
negotiate with the Go repo later. Nothing below waits on Ethan.

## Decision record (M0 decisions, resolved 2026-07-12)

| # | Decision | Resolution |
|---|---|---|
| 1 | Grid pitch | **50 / 50 / 55 mm** (x/y/z), constant `UC2_GRID_MM = (50.0, 50.0, 55.0)` |
| 2 | Fragment storage | verbatim Optiland surface schema, opaque except surface count/order |
| 3 | Glass catalog | **Optiland's material names are canonical** (refractiveindex.info-backed); vendor imports normalize at ingestion |
| 4 | Library home | `library/` folder inside the new **`optikit-core`** Python repo; split out later |
| 5 | Engine home | **Python FastAPI service in `optikit-core`** — owns compile / chain / cubify / DRC / back-annotate and runs Optiland natively. **Absorbs `optikit_exporter`** (`/Users/bene/Downloads/OPTIKIT/optikit_exporter`): `beam_router.py` → chain inference, `vendor_catalog.py` → Thorlabs importer, `builders.py` + `optikit_to_optiland.py` → compiler |
| 6 | Normative schema source | **Pydantic v2 models** in `optikit-core` → exported JSON Schema → generated TS types. Ethan's Go conforms to JSON Schema + golden corpus |
| 7 | 2.5D canvas tech | evolve the existing three.js scene in this repo; no new engine |
| 8 | UI start | UI work starts **now** on the current `PlacedModule` store, behind a document-interface boundary (WP-11); backing model swaps to `.dsn` later without canvas changes |

## Repo topology

```
optikit-core/            NEW — Python. The standard + the engine.
  src/optikit_core/
    schema/              Pydantic v2 models  (= WS-A1..A3, dictated)
    geometry/            flatten, 24-rotations, cubify, DRC
    compile/             design → optic.json + manifest   (from optikit_exporter)
    chain/               inference                        (from beam_router)
    annotate/            back-annotation classifier
    service/             FastAPI app
    importers/           glb2template, thorlabs/zmx
  library/               components/ templates/ modules/  (records + CI)
  schema/dist/           generated JSON Schema (the negotiation artifact)
  golden/                example .dsn corpus incl. Ethan's examples/designs/**
openUC2-OptiKit/         THIS repo — React/TS editor pair (schematic + assembly)
optikit (Ethan, Go)      conforms to schema/dist later — see ETHAN TODOS
openuc2-cadquery         T3 generators, called by optikit-core CI
pyinventor               parked (WP-C5 of the old plan)
```

**Parallel start:** WP-1 (core schema) and WP-11 + WP-13 (UI) can begin **today,
independently**. Everything else keys off WP-1's schema or WP-11's boundary.

Dependency order:

```
core:      WP-1 → WP-2 → WP-3 → WP-4 → WP-5 → WP-6
                        ↘ WP-7 → WP-8, WP-9, WP-10
frontend:  WP-11 → WP-13 (today)         WP-12 (after WP-1)
           WP-12 → WP-14 → WP-15 → WP-16 → WP-17 → WP-18
```

## Status ledger (2026-07-14)

| WP | Deliverable | Status |
|---|---|---|
| WP-1…6 | schema v0, geometry, compiler, chain inference, back-annotation, FastAPI service | ✅ done (optikit-core `a6923d5`…`6dc677d`) |
| WP-7 | library records + semver index + CI governance | ✅ done (`fac85b5`) |
| WP-8 | glb2template Inventor ingestion | ✅ done (`3f032c4`; naming contract in `DOCS/inventor-naming-contract.md`) |
| WP-9 | Thorlabs/Zemax importer (`import zmx` / `import thorlabs`) | ✅ done (`3738142`) — ⚠ fixture shelf has 5 real .zmx files; drop more into `tests/fixtures/zmx/` to hit the ≥10 acceptance bar |
| WP-10 | CadQuery T3 harness (`generate`, keyed artifacts, CI job) | ✅ done (`c4bc01e`) |
| WP-11…13 | document boundary, generated TS types + .dsn zip, 2.5D schematic | ✅ done (this repo `c0fbdaf`→`86e5662`) |
| WP-14 | component ("symbol") editor `/configurator/components` | ✅ done (`5dd9908`) — AC254-050-A acceptance validated against optikit-core |
| WP-15 | service round trip in the UI (check / simulate / optimize) | ✅ done (`33f15f1` + core `611e332`) — acceptance verified live: fluo-scope imports, 127-ray fans, focus-DOF optimize with delta review |
| WP-16 | assembly ("board") editor: cubify review, GLB scene, DRC markers, T2 insert drag | ✅ done (`10094e4`) — acceptance verified live (cubify table, clamp at +7.5, undo bracket, export) |
| WP-17…18 | cross-probing + sync chip, manufacturing export | ⬜ next |

Nothing pushed to any remote yet — all of the above are local commits.

---

# Part 1 · optikit-core (Python) — work packages with Claude Code prompts

### WP-1 — Repo scaffold + schema v0 (this *is* WS-A1–A3, dictated)

The normative datamodel. A superset of Ethan's `.dsn` (`DesignDecl` in
`optikit-ethan/exp/designs/designs-decl.go`) so his examples remain valid, plus
the agreed extensions. Target YAML shape:

```yaml
# optikit-design.yml — schema v0
design: {name: fluo-scope, version: 0.1.0}
components:
  objective:
    type: primitive                      # design | primitive | location
    primitive: {type: step, model: "SUB - 0023 - LEND40F50.stp"}
    optics:                              # NEW (§7 unification doc)
      fragment:                          # verbatim Optiland surface schema
        surfaces:
          - {type: standard, geometry: {type: StandardGeometry, radius: 25.8, conic: 0.0},
             material_post: {type: Material, name: N-BK7}}
          - {type: standard, geometry: {type: StandardGeometry, radius: -25.8, conic: 0.0}}
      frames:                            # named datum frames, mm offsets in local coords
        optical: {z-mm: 0.0}
        mount:   {z-mm: 2.6}
      ports:
        front: {frame: optical, direction: -z}
        back:  {frame: optical, direction: +z, after-surface: 1}
    template:                            # NEW — T1/T2/T3 as DOF classes
      class: adaptive                    # fixed | adaptive | generative
      envelope: {x-mm: 50, y-mm: 50, z-mm: 50}
      # generator: {script: generators/lens_mount.py, params: {...}}   # T3 only
    dof:                                 # NEW — the load-bearing block
      - {name: dz, kind: translation, axis: z, range: [-7.5, 7.5],
         resolution: 0.05, unit: mm, actuatable: false}
    pose:
      translation: {anchor: cube1, offset-grid: [1, 0, 0], offset-mm: [0, 0, 1.85]}
      rotation: {type: grid, grid: {z: +x, x: +y}, offset-deg: [0, 0, 0]}   # offset-deg NEW
paths:                                   # NEW — the netlist
  emission:
    simulation:                          # verbatim Optiland global sections
      wavelengths: {wavelengths: [{value: 0.52, is_primary: true}]}
      aperture: {type: EPD, value: 10.0}
    chain: [sample.plane, objective.front>back, dichroic.front>transmitted,
            tube-lens.front>back, camera.sensor]
variants: {}                             # keep Ethan's overlay-merge semantics
instantiation:
  dof_values: {objective.dz: +1.85}      # instance data only, never library data
provenance: {optimized_by: null, run: null, merit: {}}
```

Rules encoded in validators: grid pitch 50/50/55 mm; `rotation.grid` = 24
axis-aligned rotations (z/x axis naming, right-hand y), `offset-deg` = extrinsic
ZXY residual; T1 must have empty `dof`; T2 `dof` ranges must fit `envelope`;
T3 requires `generator`; `dof_values` keys must resolve to declared DOFs;
`chain` entries must resolve to declared ports.

```
PROMPT (repo: create /Users/bene/Downloads/OPTIKIT/optikit-core)

Create a new Python repo "optikit-core" at /Users/bene/Downloads/OPTIKIT/optikit-core:
uv-managed, src layout (src/optikit_core), pytest, ruff, pydantic v2, pyyaml, FastAPI
pinned but unused for now. MIT or Apache-2.0 license matching openUC2 conventions.

Implement src/optikit_core/schema/: Pydantic v2 models for the "schema v0" YAML
format specified in DOCS/kicad-for-optics-execution.md §WP-1 of
/Users/bene/Downloads/OPTIKIT/openUC2-OptiKit (read that section first — it is the
spec, including the validator rules list). The format is a superset of the Go
DesignDecl in /Users/bene/Downloads/optikit-ethan/exp/designs/designs-decl.go —
read that file and keep every existing field/semantic (type design|primitive|location,
translation anchors with offset-grid/offset-mm, rotation type uc2|grid, variants,
instantiation) so all designs under /Users/bene/Downloads/optikit-ethan/examples/designs/**
still validate. Optiland fragments and per-path simulation sections are opaque
passthrough (dict[str, Any]) except: surfaces must be a non-empty list and surface
order is preserved byte-for-byte on round-trip.

Add: (a) yaml load/dump with stable key order and lossless round-trip;
(b) a CLI `optikit-core validate <design-dir>`; (c) scripts/export_schema.py that
writes JSON Schema for every top-level model to schema/dist/*.schema.json;
(d) a golden/ directory: copy Ethan's example designs plus author the
fluorescence-scope example from the spec as golden/fluo-scope.dsn/optikit-design.yml;
(e) pytest: every golden design round-trips losslessly, every validator rule in the
spec has one passing and one failing fixture (grid pitch constant, 24-rotation
enumeration, T1-no-DOF, T2-range-in-envelope, T3-needs-generator, dof_values
resolution, chain port resolution).

Constants: UC2_GRID_MM = (50.0, 50.0, 55.0) with a comment that the Go repo
currently has {5,5,5.5} mislabeled as centimeters and must migrate.
```

### WP-2 — Geometry engine: flatten, cubify, DRC

```
PROMPT (repo: optikit-core, after WP-1)

In optikit-core, implement src/optikit_core/geometry/:

1. rotations.py — the 24 axis-aligned rotation matrices addressed by (z-axis,
   x-axis) names as in the schema's rotation.grid; compose with offset-deg
   (extrinsic ZXY, degrees) to a full rotation matrix; and the inverse:
   decompose an arbitrary rotation matrix R into (nearest of the 24, residual
   ΔR as extrinsic-ZXY offset-deg). Property-based test: for random rotations,
   compose(decompose(R)) == R within 1e-9, and residual angles are minimal.

2. flatten.py — resolve the translation anchor digraph to absolute world poses
   in mm (grid offsets × UC2_GRID_MM + offset-mm), mirroring the semantics of
   Flattened() in /Users/bene/Downloads/optikit-ethan/exp/designs/ (read
   geometry.go + designs-.go for reference, but our 50/50/55 constant is
   normative). Detect cycles and missing anchors as typed errors. Output a
   FlatReport: per primitive component, world position mm + rotation matrix +
   extrinsic-ZXY euler (this is the analogue of Go's PrimReport — keep field
   names compatible where possible).

3. cubify.py — the inverse: given world poses (e.g. from a schematic layout),
   decompose p = S·g + δ with g = round(p/S) → offset-grid, δ → offset-mm; and
   R = R24·ΔR → rotation.grid + offset-deg. Then DRC checks, each returning a
   typed finding with component id and axis: DRC_RANGE (δ or a dof_value outside
   the template's declared dof range / envelope), DRC_T1_MOVED (nonzero δ or ΔR
   on a class:fixed component beyond tolerance), DRC_COLLISION (two cubes at the
   same grid cell), DRC_APERTURE (stub for now).

Table-driven tests: a lens 1.85mm off-grid lands in offset-mm; 30mm off-grid on
a T2 with range ±7.5 → DRC_RANGE naming the component and axis; golden designs
flatten to the same poses before and after a cubify→flatten round trip.
```

### WP-3 — Compiler: design → optic.json + trace manifest

```
PROMPT (repo: optikit-core, after WP-2)

Port the Optiland export pipeline from
/Users/bene/Downloads/OPTIKIT/optikit_exporter (read README.md, src/optikit_exporter/
builders.py, optikit_to_optiland.py, layout_loader.py first) into
optikit-core/src/optikit_core/compile/, replacing its ad-hoc layout JSON input
with the schema-v0 design record:

compile(design_dir, path_name) → (optic_dict, manifest):
- instantiate variant + dof_values, flatten poses (geometry engine from WP-2)
- walk paths.<name>.chain; for each port traversal emit the component's
  optics.fragment surfaces transformed into path coordinates: gap between
  consecutive port frames → thickness/cs, pose residual (offset-deg, off-axis δ)
  → cs tilt/decenter; a part may appear twice (double-pass) — emit twice
- prepend the path's simulation section (aperture/fields/wavelengths verbatim)
- manifest: list of {surface_index, component_id, port_traversal,
  fragment_surface_index} covering every emitted surface

Typed errors as exceptions with stable codes: E_NO_OPTICS (chain component
without optics.fragment, unless passthrough: true), E_BAD_PORT, E_GEOMETRY
(consecutive ports not mutually facing within tolerance — print both world
frames), E_UNSUPPORTED (surface type Optiland lacks). Write optic.<path>.json +
optic.<path>.manifest.yml via a CLI subcommand `optikit-core compile`.

Acceptance test (pytest, optiland as dev dependency): compiling
golden/fluo-scope.dsn path "emission" produces a dict that
optiland Optic.from_dict() loads and traces without error; the manifest covers
all surfaces; each E_* code has a failing fixture design. Keep the exporter's
summary.json paraxial report as an optional --summary flag.
```

### WP-4 — Chain inference

```
PROMPT (repo: optikit-core, after WP-3)

Port and generalize the beam router from
/Users/bene/Downloads/OPTIKIT/optikit_exporter/src/optikit_exporter/beam_router.py
(currently 2D, grid-cell hopping) into optikit-core/src/optikit_core/chain/:
full-3D chief-ray propagation over flattened world poses. Algorithm: start at
each source-category component's exit port; propagate the ray; among ports whose
frame faces the ray within angular tolerance and whose clear aperture (from
fragment semi-apertures, fallback envelope) contains the intersection, snap to
the nearest; mirrors/dichroics redirect via their port definitions
(front>reflected vs front>transmitted creates a branch point); stop at
detector-category ports.

Output: a paths: block proposal (one path per root-to-leaf walk).
Hard, named errors — never guess: E_AMBIGUOUS_CHAIN (two candidates within
tolerance: name both), E_NO_TARGET (ray escapes), E_LOOP. Branching at a
beamsplitter is NOT an error — emit both branches; ambiguity means two
candidates for the SAME branch.

CLI: `optikit-core chain --infer <design-dir> [--write]`.
Tests: fluo-scope infers its two paths correctly; an ambiguous two-lens fixture
raises E_AMBIGUOUS_CHAIN listing both ports; a mirror ring raises E_LOOP.
```

### WP-5 — Back-annotation

```
PROMPT (repo: optikit-core, after WP-3)

Implement optikit-core/src/optikit_core/annotate/: back_annotate(design_dir,
path_name, optimized_optic_json) using the trace manifest from WP-3. Diff every
surface of optimized vs freshly-compiled optic.json and classify per
DOCS/datamodel-unification.md §6.2 of the openUC2-OptiKit repo (read it):

- POSE_UPDATE: thickness/cs position delta between parts → candidate offset-mm
  change; run cubify DRC (WP-2); out-of-range → the delta is reported with a
  DRC_RANGE finding instead of applied
- TILT_UPDATE: tilt/decenter within a part → rotation.offset-deg or a declared
  rotation-kind dof
- PART_PARAM: radius/conic/material change → if the surface's component has a
  matching parameter-kind dof, propose a dof_values update; else classify
  PART_SUBSTITUTION (report only; library matching comes later)
- E_TOPOLOGY: surface count/order changed → reject the whole file

Two modes: --dry-run prints a classified delta table (component, dof, old,
new, classification); --apply writes accepted deltas into
instantiation.dof_values and stamps provenance {optimized_by, run, merit}.
Never write library-level fields. Table-driven tests: one fixture per
classification built by mutating the compiled fluo-scope optic.json.
```

### WP-6 — FastAPI service + Docker

```
PROMPT (repo: optikit-core, after WP-2..5; WP-4/5 endpoints may 501 until merged)

Implement optikit-core/src/optikit_core/service/: FastAPI app exposing the
engine over HTTP for the React editor. Designs travel in request bodies as a
JSON tree {path: file-content} of the .dsn directory (stateless; no server-side
project storage yet).

POST /v1/validate | /v1/flatten | /v1/cubify | /v1/drc | /v1/chain/infer |
/v1/compile (returns optic.json + manifest) | /v1/back-annotate |
POST /v1/simulate {design, path, actions:[trace|spot|paraxial]} → runs Optiland
in-process, returns ray fan polylines in WORLD coordinates (re-folded through
the manifest + flatten so the frontend can overlay them in 3D), spot diagram
points, paraxial summary | POST /v1/optimize {design, path} → free variables =
declared dof entries with their ranges as bounds, scipy/optiland optimizer,
returns optimized optic.json + the classified back-annotation delta (dry-run).

Typed engine errors → HTTP 422 with {code, message, context}. CORS for
http://localhost:5173. GET /v1/schema serves schema/dist/. Dockerfile +
compose; README curl walkthrough covering validate→chain→compile→simulate→
optimize→back-annotate on golden/fluo-scope.dsn. httpx-based API tests.
```

### WP-7 — Library folder + CI + index

```
PROMPT (repo: optikit-core, after WP-1)

Add the library to optikit-core: library/{components,templates,modules}/ holding
YAML records per DOCS/kicad-for-optics-workplan.md WS-C1 (openUC2-OptiKit repo).
Define the three record kinds as Pydantic models in the schema package:
optical component (id, version semver, category lens|mirror|filter|beamsplitter|
source|detector|stage, optics fragment/frames/ports, vendor {name,mpn}, docs),
mechanical template (id, version, class T1/T2/T3, envelope, dof, source refs:
inventor urn / glb file / cadquery generator, optical_ports), cube module
(id, version, component ref with semver range, template ref, optional
electronics {pcb, firmware_contract, axis_map}, footprint_grid).

Seed with: the schema-v0 example lens, a plain 45° mirror, a laser source, a
camera detector, and a T2 lens insert template. Build step
`optikit-core library build` → library/dist/index.json (flat list with resolved
latest versions, thumbnails paths, categories) consumed by the frontend.
CI (GitHub Actions): validate all records, enforce semver bump when a record
file changes, build index. Namespace ids openuc2.* / thorlabs.* / user.*.
```

### WP-8 — glb2template (Inventor ingestion)

```
PROMPT (repo: optikit-core, after WP-7)

Implement src/optikit_core/importers/glb2template.py + CLI
`optikit-core import glb <file.glb>`. Input: openUC2 Inventor GLB exports whose
node names follow the verified convention (sample:
/Users/bene/Downloads/ASS_-_2028_-_CUBLEND12.7F40_-_V04.glb — parse it in tests):
'ASS - <num> - <name> - <rev>' assembly root; 'SUB - <num> - <name> - virt ass'
sub-assembly (MASINS* = master insert = the DOF carrier); 'PRT - <num> - <name>'
printed parts (CUBHLF* cube halves, MASLCK lock); 'BUY - <descr>' purchased
optics where <descr> encodes the prescription, e.g.
'Lens - f40 D12.7 sI2.8 R25 pl-cx' → focal 40mm, diameter 12.7mm, center/edge
thickness 2.8mm, radius 25mm, plano-convex; 'TP <descr>' trade parts (screws);
'__mm_scale__' unit-scaling node (honor its transform).

Output (into library/): a mechanical template record — class T1 if no MASINS
sub-assembly else T2 (envelope from bbox rounded to grid cells; a dof stub
{name: dz, axis: z, range: null} flagged needs-review); an optical component
stub with fragment pre-filled from the parsed BUY prescription (pl-cx → one
curved + one plano surface, material stub N-BK7 flagged needs-review; frames:
optical at the BUY node's origin in cube coordinates); a module record binding
both; a thumbnail PNG (render with trimesh/pyrender or scene-bbox fallback).
Anything unparseable → explicit needs-review list on stderr and a
`review:` block in the record — never guess silently. Use trimesh or pygltflib.

Tests against the sample GLB: template class T2 detected via
'SUB - 0032 - MASINSLEND12.7F40', BUY prescription parsed to the values above,
records validate, envelope = 1x1x1 grid cell. Also write
DOCS/inventor-naming-contract.md documenting the convention as the contract
for future exports.
```

### WP-9 — Thorlabs / Zemax importer

```
PROMPT (repo: optikit-core, after WP-7)

Extend the vendor catalog approach from
/Users/bene/Downloads/OPTIKIT/optikit_exporter/src/optikit_exporter/vendor_catalog.py
(read it; it has a seeded Thorlabs index) into
src/optikit_core/importers/thorlabs.py + CLI `optikit-core import zmx <file>`
and `optikit-core import thorlabs <MPN>...`:

- .zmx → component record: use optiland's own Zemax file reader (check the
  installed optiland package for its zemax loader; do not hand-parse ZMX beyond
  what optiland lacks), extract the surface list into optics.fragment verbatim,
  materials normalized to names optiland's material database resolves
  (canonical per decision record; unknown glass → needs-review, no guessing),
  set vendor {name: Thorlabs, mpn}, effective focal length from paraxial calc.
- Every imported component gets datum frames: optical at first vertex, mount at
  the edge/shoulder plane derived from center thickness + diameter, ports
  front/back.
- Batch mode: given MPNs, look up local .zmx files in a --zmx-dir (downloading
  from thorlabs.com is out of scope; document where users get the files).

Acceptance: import ≥10 real Thorlabs singlet/achromat .zmx files (ask the user
to drop them in a fixtures dir if not present; AC254-050-A must be one of
them), records validate, and a pytest compiles a trivial design using
AC254-050-A and asserts EFL ≈ 50mm within 1% via optiland paraxial.
```

### WP-10 — CadQuery T3 harness

```
PROMPT (repos: openuc2-cadquery + optikit-core, after WP-7)

Formalize https://github.com/openUC2/openuc2-cadquery (clone it; read its
existing experiments) into versioned T3 generators callable from optikit-core:
a generator contract generators/<name>.py exposing
build(params: dict) -> cadquery.Workplane, plus a params JSON Schema per
generator. First generator: round-optic 1x1 insert
(clear_aperture_mm, optic_diameter_mm, edge_thickness_mm) fitting the UC2 cube
envelope (50mm, insert interface dimensions taken from the MASINS geometry —
measure from the WP-8 sample GLB).

In optikit-core: `optikit-core generate <template-id> --params ...` resolves a
class:generative template's generator ref, runs it headless, writes STEP+STL+GLB
into an out/ keyed by sha256 of canonicalized params, and a CI job regenerates
artifacts for all T3 templates in library/ when generators or params change.
Acceptance: changing clear_aperture_mm regenerates artifacts; GLB loads in
three.js (verify by file structure, no browser needed); generated insert bbox
fits inside the 50mm envelope.
```

---

# Part 2 · openUC2-OptiKit (React/TS) — work packages with Claude Code prompts

### WP-11 — Document interface boundary (**start today**)

```
PROMPT (repo: /Users/bene/Downloads/OPTIKIT/openUC2-OptiKit)

Introduce a document-interface boundary so the UI can be rebuilt now and the
backing model swapped to the .dsn schema later without touching components.

Read src/stores/appStore.ts and src/types/index.ts (PlacedModule et al.) first.
Create src/document/: an OptikitDocument facade with (a) read selectors —
listParts(): DocPart[] {id, ref, category, worldPose {positionMm:[x,y,z],
rotation: quaternion or matrix}, gridPose {cell:[x,y,z], rot24, offsetMm},
libraryRef, dofs: DocDof[] {name, range, unit, value}}, listPaths(): DocPath[]
{name, chain: portRef[]} (empty for now); (b) commands — addPart, movePartWorld
(mm), movePartGrid, rotatePart, setDofValue, removePart, renamePart; (c)
subscribe for React (implement over zustand). Back it with the CURRENT appStore
state (PlacedModule[] is the flattened form: grid x/y + layer → cell, three 90°
rotations → rot24 subset; document this mapping in the file header). Convert
mm→grid with UC2_GRID_MM = [50, 50, 55].

Hard rule to enforce from now on (add to CLAUDE.md): new editor components may
import only from src/document, never appStore directly. Do not migrate existing
components yet. Add unit tests for the pose mapping both directions.
```

### WP-12 — Generated TS types + .dsn import/export (after WP-1)

```
PROMPT (repo: openUC2-OptiKit, requires optikit-core WP-1 output)

Wire the dictated schema into the frontend. Add an npm script "gen:schema" that
reads JSON Schema files from ../optikit-core/schema/dist/ (path configurable via
env) and generates TypeScript types into src/model/dsn/generated/ using
json-schema-to-typescript; commit the generated output. Hand-write thin wrapper
types + a yaml (npm 'yaml') loader/serializer for the .dsn directory format
(optikit-design.yml + sidecars) with lossless round-trip.

Implement src/model/dsn/convert.ts: OptikitDocument snapshot ↔ DesignDecl.
Export: every DocPart becomes a component with pose.translation
{anchor: origin, offset-grid, offset-mm} and rotation {type: grid, grid, offset-deg},
dof values into instantiation.dof_values. Import: flatten (grid × [50,50,55] +
offsets) into worldPose — reuse the WP-11 mapping helpers.

Tests: golden fixtures copied from ../optikit-core/golden/** round-trip
import→export semantically identically (deep-equal on parsed YAML, ignoring key
order); a current demo setup exports to .dsn and re-imports to an identical
document snapshot. Add File menu actions: "Export .dsn (zip)" and "Import .dsn".
Keep the legacy JSON format working as a converter.
```

### WP-13 — 2.5D schematic canvas (**start today**, on WP-11)

```
PROMPT (repo: openUC2-OptiKit, after WP-11; do NOT wait for WP-12)

Build the schematic ("optical layout") view — the 3DOptix-like editor — as a new
page alongside the existing ones. Read src/components/Editor3DPage.tsx and
src/three/ first and reuse the scene/camera/gizmo infrastructure; read
DOCS/kicad-for-optics-workplan.md WP-D3 for intent.

Requirements:
- Talks ONLY to src/document (OptikitDocument).
- Parts render as schematic glyphs, not cubes: lens = biconvex disc, mirror =
  angled plate, source = cone + axis arrow, detector = plane; category from
  DocPart.category; fallback = labeled box. Optical axis (+z of part frame)
  always drawn as an arrow.
- 2.5D interaction: default drag moves in the XY working plane (mm,
  continuous — grid snap is a toggle, default OFF in this view); a
  layer/height control moves the working plane in z; Shift-drag moves along z.
  Rotation gizmo allows free yaw plus 90° snapping toggle.
- Ports: render as small directional pins at part frames (until WP-12 supplies
  real port data, derive front/back pins from the part's axis). Click a pin,
  then subsequent pins, to build a chain; store it via a new
  document command setPath(name, chain). Render active paths as polylines
  through the pins.
- Property panel (reuse PropertyPanel patterns): numeric world pose mm fields,
  rotation, dof sliders clamped to range.
- Keep the existing RayOpticsAdapter 2D preview working: render its in-plane
  rays as an overlay toggle in this view (read src/simulation/RayOpticsAdapter.ts
  and adapt input from the document selectors).

No backend calls in this WP. Acceptance: build a laser → lens → mirror →
camera layout by dragging from the existing PartLibrary sidebar, chain it by
clicking pins, see the 2D ray overlay react while dragging the lens.
```

### WP-14 — Component ("symbol") editor (after WP-12, WP-7)

```
PROMPT (repo: openUC2-OptiKit, requires WP-12 types + optikit-core WP-7 index)

Build the component editor page: create/edit optical component records
(the "symbol editor"). Read the component record Pydantic models via the
generated TS types (src/model/dsn/generated) and the library index format from
../optikit-core/library/dist/index.json.

Per-category forms (lens, mirror, filter, beamsplitter, source, detector):
a surfaces table editing the verbatim Optiland fragment (radius, thickness,
material name with autocomplete from a bundled list of optiland material names,
semi-aperture, conic), category-specific fields (mirror: reflective flag +
angle; source: wavelengths/divergence; detector: sensor size/pixel pitch),
datum frames (optical/mount z-offsets), and ports (name, frame, direction,
after-surface). Live schematic glyph preview + a 2D single-element ray sketch
(reuse RayOpticsAdapter with a synthetic collimated beam; label it
"approximate — authoritative sim comes from the service").

Actions: "Download record YAML" (library-PR-ready file with semver field) and
"Save to workspace library" (local persistence, merged into the PartLibrary
sidebar under user.*). Load the built library index from a configurable URL and
render components with category filters and vendor/MPN badges.
Acceptance: recreate Thorlabs AC254-050-A from its datasheet values in the form,
download the YAML, and `optikit-core validate` passes on it.
```

### WP-15 — Service round trip in the UI (after WP-13 + core WP-6)

```
PROMPT (repo: openUC2-OptiKit, requires the optikit-core service running locally)

Wire the schematic view to the optikit-core FastAPI service
(http://localhost:8000, configurable). Read its OpenAPI (/docs) and
DOCS/kicad-for-optics-workplan.md WP-D4 first. Add src/api/coreClient.ts (typed
fetch wrappers, zod-validated responses, typed E_*/DRC_* error surface).

Features, all operating on the current document exported via WP-12 convert:
1. "Check" button = /v1/validate + /v1/chain/infer dry-run: ERC-style marker
   list panel (KiCad-like), each finding clickable → selects/zooms the part.
2. Authoritative simulation: /v1/simulate returns world-coordinate ray
   polylines → render as three.js lines over the schematic (distinct from the
   approximate 2D overlay; the approximate one auto-hides when authoritative
   rays are fresh, reappears as "stale" greyed when the document changes).
   Spot diagram + paraxial summary in a results panel per path.
3. Optimize dialog: lists declared DOFs with ranges (from the document),
   checkboxes to include, runs /v1/optimize, then shows the classified
   back-annotation delta table (component, dof, old→new, classification) with
   Accept/Reject per row; accepted rows apply via document setDofValue and
   stamp provenance on export. Rejected rows do nothing. Never auto-apply.

Debounce simulate on document changes (500ms) behind a "live" toggle.
Acceptance: with the service running, the fluo-scope golden design imports,
simulates with visible ray fans, and a focus-DOF optimization round-trips with
the delta review step.
```

### WP-16 — Assembly ("board") editor (after WP-15, core WP-2/WP-8)

```
PROMPT (repo: openUC2-OptiKit)

Build the assembly view — the "PCB editor" — as the second linked document view.
Read DOCS/kicad-for-optics-workplan.md WP-E1/E2 and the existing
Editor3DPage/gizmo code first.

1. "Cubify" action: POST /v1/cubify with the schematic document → returns grid
   poses + module bindings + DRC findings; show a review dialog (per-part table:
   world pose → cell/rot24/offset-mm, chosen module, findings) before applying
   to the document's gridPose fields.
2. Scene: render cube modules from library GLBs (honor the __mm_scale__ node;
   loader in src/three/), skeleton context, grid 50/50/55mm. Parts without a
   module render as ghost boxes with a "no template" DRC badge.
3. Insert manipulation: a part's T2 dof renders as a constrained drag axis on
   the insert sub-mesh — dragging is clamped to the dof range and writes
   setDofValue; T1 parts' inserts are locked with a lock cursor. offset-deg
   shown numerically in the property panel, not draggable.
4. DRC: /v1/drc on demand + after every cubify; findings render as in-scene
   markers (billboard icons at the offending part) plus the marker list panel
   shared with WP-15's ERC.

Acceptance: cubify the fluo-scope schematic, see cubes on the grid, drag the
objective insert to +8mm → clamped at +7.5 with a DRC_RANGE marker appearing,
undo restores, save/export .dsn reflects dof_values.
```

### WP-17 — Cross-probing + sync discipline (after WP-16)

```
PROMPT (repo: openUC2-OptiKit)

KiCad ergonomics between the schematic and assembly views (both read the same
OptikitDocument, so this is view-state plumbing, not data sync):

1. Cross-probing: selection is document-level; selecting a part in either view
   highlights and optionally zooms it in the other (split-view layout: both
   views side by side with a divider, or tab-switch preserving selection).
2. Sync chip: content-hash the schematic-owned fields (world poses, paths,
   optics) and assembly-owned fields (grid poses, dof_values, module bindings)
   separately; chip states in the toolbar: in-sync / schematic ahead /
   assembly ahead, based on the last cubify/back-annotate stamps stored in the
   document.
3. Explicit sync actions with review dialogs (never automatic): "Update
   assembly from schematic" = re-cubify diff (only changed parts listed);
   "Back-annotate to schematic" = the WP-15 delta table reused.

Acceptance: move a lens 5mm in the schematic → chip flips to "schematic ahead"
→ update dialog lists exactly that one part → apply → chip in-sync → the
assembly view shows the insert offset changed.
```

### WP-18 — Manufacturing export (after WP-16)

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

One "Export release bundle" action producing a zip: (a) the .dsn directory with
a lockfile section pinning exact library record versions + content hashes;
(b) BOM.csv — extend src/components/BOMPanel.tsx logic: printed parts (PRT),
purchased optics (BUY) with vendor/MPN from component records, trade parts (TP)
aggregated with counts; (c) merged GLB of the assembly (three.js export of the
scene, mm scale); (d) assembly-notes.md listing every T2 insert's target
dof_value ("set objective insert to +1.85 mm") and every T3 template's
generator params + artifact hash; (e) optic.<path>.json + manifests fetched
from /v1/compile for provenance.

In optikit-core add `optikit-core rebuild <bundle.zip>` verifying a bundle:
re-resolve the lockfile against library/, recompile all paths, byte-compare
optic.json outputs — CI-runnable reproducibility check.
Acceptance: export the fluo-scope demo, rebuild verifies bit-identical, BOM
lists the Thorlabs lens with MPN.
```

---

# Part 2b · Feedback round 1 (2026-07-14) — new work packages

Bene's field-test findings after WP-1…16, triaged. Bugs fixed immediately are
in the "quick fixes" list at the end; everything needing design or real scope
became a WP below. Ordering: **WP-28 (full rotations) and WP-23 (editor UX)
first, then WP-19 (part binding), then WP-17/18** — orientation correctness
and editor ergonomics are what make everything downstream testable.

### WP-19 — Part-binding workbench (mechanical ↔ optical registration)

```
PROMPT (repo: openUC2-OptiKit + optikit-core)

The missing tool between "we have an STP of a laser housing" and "every design
component points at a real ModuleRecord": an interactive registration page.

1. optikit-core: POST /v1/convert/step-to-glb — accept an uploaded STEP,
   import via cadquery/OCP (the WP-10 stack), export GLB (mm), return it.
   GLB stays a render-only exchange format; the STEP is the mechanical source
   of truth referenced by the record (this is now stated normatively in
   ARCHITECTURE.md).
2. Frontend page /configurator/bind: load an STP (via 1) or GLB; render it
   against a toggleable ghost 50 mm cube centered at (0,0,0); free
   place/rotate the mesh w.r.t. the cube origin (gizmo with snap toggles).
3. Datum authoring: click surface points to place optical datums — each is a
   point + direction (+ optional circular area): source plane, sensor plane,
   reflective plane, front/back ports. Render each as pin + arrow + disc.
   These become optics.frames (z along the datum axis) + ports.direction in
   the record; the placement transform becomes the template's mesh offset.
4. Output: a bound ModuleRecord (+ component/template records as needed) —
   "Save to workspace" and "Download records for library PR"; developer mode
   writes into ../optikit-core/library/ directly.
5. Placeholder part set: dsn-consistent placeholder STP/GLB + records for a
   laser pointer, flat mirror, camera — so every fluo-scope component can
   point at a real ModuleRecord out of the box.

Acceptance: bind the WP-8 sample GLB and one raw STP; the laser placeholder's
source datum round-trips into a design whose chain inference starts at the
authored emission point/direction instead of the node origin.
```

### WP-20 — Inventor datum contract v2 + PyInventor authoring helper

```
PROMPT (repo: optikit-core + openUC2-OptiKit DOCS + github.com/openUC2/PyInventor)

Named datums in Inventor instead of node-origin defaults:

1. Extend DOCS/inventor-naming-contract.md: work-plane/axis/point naming
   (e.g. "PLN - SRC - out", "PLN - SNS - sensor", "AXIS - OPT",
   "PT - FOCUS") with the exact semantics each maps to
   (frames z-offset, ports.direction, clear-aperture disc).
2. glb2template: parse those named nodes from the GLB export into
   optics.frames/ports (they export as empty nodes with the datum transform);
   review-flag any component that still falls back to node origin.
3. PyInventor reference script for the mechanical engineer: stamp/validate
   the named datums on an open Inventor document, list violations
   (runs on the Windows/Inventor machine).
4. Write the ME guide (DOCS/mechanical-engineering-guide.md): the two
   authoring paths — (a) Inventor-first: model the holder, add named datums,
   export GLB+STP; (b) optikit-first: export the optical part's STP from the
   part-binding workbench, import into Inventor, model the holder around it;
   (c) T3: no CAD at all, cadquery generates the holder (WP-21).

Note: live Inventor exploration through PyInventor on Bene's second machine is
available — connect it when this WP starts.
```

### WP-21 — Auto-holder generator (T3 boolean insert around an arbitrary optic)

```
PROMPT (repo: optikit-core, extends the WP-10 harness)

generators/boolean_holder_1x1.py: given an optical part mesh (STP) and its
bound pose from WP-19, generate a printable holder:

1. Start from the 50 mm cube insert envelope; boolean-subtract the part shape
   at its bound pose with a configurable clearance (default 0.15 mm).
2. Split the result into two printable halves along a configurable plane
   through the optical axis.
3. Add M3 screw bosses from both sides (through-hole one half, cut-off thread
   pocket in the other) at the four corners.
4. Params JSON Schema: clearance_mm, split_axis, screw count/positions;
   artifacts (STEP+STL+GLB per half) through the WP-10 keyed harness.

Acceptance: generate a holder for the AC254-050-A placeholder; halves'
bounding boxes fit the envelope, boolean cavity matches the part with
clearance, artifacts regenerate on param change.
```

### WP-22 — Library registry + contribution flow ("where is the database of parts?")

```
PROMPT (repo: optikit-core + openUC2-OptiKit)

One canonical place: optikit-core's library/ is the git-of-record for
openUC2-provided AND community parts.

1. Publish library/dist/index.json + record files + GLB/STP assets via CI
   (GitHub Pages or the deployed service serving /v1/library/*).
2. Frontend default index URL points at the published index (dev snapshot
   stays as fallback); record assets (thumbnails, GLBs) load from the same
   base URL.
3. Contribution flow, documented end-to-end: user authors in the component
   editor / binding workbench → workspace (user.*) → "Download records" →
   PR against optikit-core library/ → CI validates (library validate +
   semver gate) → merged → appears in everyone's index.
4. Developer mode: a local-path setting that writes records straight into a
   checkout of optikit-core (the "we are the developers" fast path).

Acceptance: a record authored in the browser lands in the published index via
PR and shows up in a fresh browser session with no manual copying.
```

### WP-23 — Editor UX round 1 (schematic + assembly)

```
PROMPT (repo: openUC2-OptiKit)

Field-test friction from the first real use of the schematic/assembly pair:

1. Camera vs part manipulation: locked 2.5D default (SimCity-style) — LMB
   selects/drags parts, orbit only via middle mouse / right mouse / modifier
   key; an "unlock view" toggle for free orbit. Today part-drag and orbit
   fight each other.
2. Affordance legend: first-run overlay (and a "?" toggle) explaining the
   port pins (colored dots = beam entry/exit used for chaining), the yaw
   ring, and the selection sphere; rename/restyle where clearer. The
   wireframe hover sphere reads as "mystery geometry" — replace with a
   subtler highlight.
3. Snap-to-grid semantics: snapping must center the optical axis in the cube
   — z snaps to layer·55 + axis height, x/y to cell centers; the grid
   overlay should draw at optical-axis height, not the cube floor.
4. Part palette in the schematic shows optical glyph thumbnails (lens,
   mirror, laser…) instead of the cube GLB renders; palette also offers
   "load STP/GLB…" which routes through the WP-19 binding flow.
5. Assembly T-rule rendering: cube shells always draw at the R24 grid pose
   on the grid; the residual yaw / offset-deg applies only to the INSERT
   content inside the shell (a beamsplitter rotated 39.6° renders as an
   axis-aligned cube with a rotated insert plate). DRC flags residuals on
   T1 shells as today.
6. Navigation: /configurator defaults to the schematic; the legacy 2D grid
   builder moves to /configurator/grid and gets a nav entry so it stays
   reachable. [quick-fixed 2026-07-14, keep as regression scope]

Acceptance: place three parts, chain them, and cubify without once fighting
the camera; a first-time user can explain pins/ring/sphere from the legend.
```

### WP-24 — Design-system unification

```
PROMPT (repo: openUC2-OptiKit)

Every page currently has its own visual impression (legacy light 2D builder,
dark schematic, dark assembly, MUI-default component editor). Unify:

1. Decision (recorded): stay on MUI — the entire app is MUI; migrating to
   shadcn/Tailwind is a rewrite with no user-visible payoff. Achieve the
   shadcn-like look via a single design-token theme (spacing, radii, dark
   palette, typography) in src/theme/, applied app-wide (including the
   legacy grid builder + FRAME wizard shells).
2. One shared AppShell (toolbar, nav, drawers) used by every route.
3. Brand: adopt the provided logo PNG (asset still to be delivered — wire a
   placeholder slot in the shell header).
4. FRAME configurator gets restyled within the shell (its UX rework is a
   separate later item).

Acceptance: switching between grid/schematic/assembly/components feels like
one product; a visual-regression screenshot set is committed.
```

### WP-25 — Cloud deployment (AWS · docker + caddy + SSL)

```
PROMPT (repo: optikit-core) [files delivered 2026-07-14 — see deploy/]

compose.prod.yaml (service + caddy), Caddyfile with automatic HTTPS for a
configurable domain, CORS origins via OPTIKIT_CORS_ORIGINS env, DEPLOY.md
(EC2 + DNS + docker compose up). Later: publish the frontend build to the
same origin so CORS disappears entirely.
```

### WP-26 — Actuation bridge (dof → firmware via imswitch)

```
PROMPT (repo: openUC2-OptiKit + optikit-core, after WP-17)

The DOF value that back-annotation writes should be able to MOVE the real
insert. All transports (UC2-REST serial, CANopen, …) are hidden behind
imswitch/newswitchunified — the frontend only ever talks to imswitch's REST
API.

1. ModuleRecord.electronics.axis-map already binds dof → can-object; add an
   imswitch endpoint mapping (positioner name / axis).
2. Assembly view: an "apply to hardware" button on an actuatable insert posts
   the dof value to a configurable imswitch URL; live position readback
   renders as a second ghost handle.
3. Document the mapping contract with one real example (the WP-7
   openuc2.cube.lens_z axis-map).

Acceptance: dragging the objective insert with hardware connected moves the
motor via imswitch; without hardware the button degrades to a clear error.
```

### WP-27 — Tutorials & guides

```
PROMPT (repo: openUC2-OptiKit DOCS + optikit-core DOCS)

1. "Add a new component" tutorial: the three roads (component-editor form,
   zmx import, GLB/STP import + binding) with screenshots, ending in a
   library PR.
2. "Create a .dsn diagram" tutorial: place parts, chain ports, check,
   simulate, optimize, export — fluo-scope rebuilt from scratch.
3. Mechanical-engineering guide (WP-20 deliverable, cross-linked).
4. API how-to: the {files: {"optikit-design.yml": "<yaml>"}} envelope, curl
   examples per endpoint, the ±1e999/Infinity contract, typed error codes.
   [seed version added to WORKING_WITH_FRONTEND.md 2026-07-14]
```

### WP-28 — Full orientation: pitch/roll/yaw residuals (HIGH — with WP-23)

```
PROMPT (repo: openUC2-OptiKit)

The schematic edits only yaw; mirrors/dichroics need fine tilts about all
three axes. The schema already carries them (pose.rotation.offset-deg is an
extrinsic-ZXY x/y/z residual on top of the 24-rotation) — the STORE is the
bottleneck (rot24 + a single free yaw).

1. Document layer: replace DOC_PARAMS freeYawDeg with an offsetDeg triple
   {x,y,z} (extrinsic ZXY, exactly the schema/cubify convention
   R = R24 · Rz(z)·Rx(x)·Ry(y)); mapping.ts worldPoseOf composes it,
   splitDocYaw generalizes, rotatePart keeps its yaw-only API and a new
   tiltPart(partId, {x?,y?}) joins it. Migrate persisted layouts
   (freeYawDeg → offsetDeg.z).
2. convert.ts: export writes the full offset-deg triple; import STOPS
   dropping x/y tilts (delete the "not representable — dropped" warning and
   its test); round-trip test with a tilted mirror.
3. Property panel: Yaw becomes Pitch(x) / Roll(y) / Yaw(z) number fields
   with the same grid-residual display; the yaw ring stays, tilt stays
   numeric (a 3D tilt gizmo is follow-up, not this WP).
4. Back-annotation TILT_UPDATE deltas (rotation-kind DOFs) become appliable
   in the WP-15 dialog once the store can hold them.
5. Cubify/DRC already handle ΔR — verify DRC_T1_MOVED fires on a tilted T1
   part end-to-end.

Acceptance: tilt a mirror 2° about x in the panel → export shows
offset-deg {x: 2}; re-import reproduces the tilt; the service round trip
(check/simulate) sees the tilted pose; undo works.
```

### Quick fixes landed with this triage (2026-07-14)

- **Stale-venv crash** (`ModuleNotFoundError: anyio._backends`): the server
  was still running from the old Python 3.14 venv after uv re-created it on
  3.12 — restart the server. `.python-version` now pins 3.12 and the gotcha
  is documented.
- **CORS**: allowed origins configurable via `OPTIKIT_CORS_ORIGINS`
  (comma-separated), so LAN/Tailscale-served frontends (e.g.
  http://100.100.43.118:5173) work.
- **Misleading E_UNREACHABLE**: the client now distinguishes "connection
  refused" from "response blocked (CORS or server crash — check the service
  log)".
- **main.py tour**: gained a Thorlabs zmx-import step and an in-process
  CadQuery T3 generation step (no subprocess when cadquery is installed:
  `uv sync --extra generate`).
- **Deployment files**: `deploy/` with compose.prod.yaml + Caddyfile +
  DEPLOY.md (WP-25 seed).
- **Default route**: `/configurator` → schematic; legacy grid builder at
  `/configurator/grid` with a nav button.
- **Wrong part orientation in the schematic** (imported designs rendered
  every glyph/pin on the +x palette convention — the vertical fluo-scope
  emission stack showed sideways lenses): pins and glyph orientation now
  derive from the retained source design's real `optics.ports` + datum
  frames (`sourcePortsOf` in the document layer); `opticalAxisOf` rotates
  each glyph onto its true beam axis; path polylines anchor traversal refs
  (`front>back`) at the entry port. Palette parts keep the old convention.

Open items parked (need input): logo PNG (not attached yet — resend), FRAME
configurator UX rework (needs a spec conversation).

---

# Part 3 · TODOs for Ethan (Go repo `github.com/openUC2/optikit`)

Framed as: the schema is being dictated from `optikit-core` (Pydantic → JSON
Schema in `schema/dist/` + golden corpus in `golden/`); deltas are negotiated as
PRs against those files, not as divergent implementations. His examples are in
the golden corpus, so conformance is symmetric — we can't break him silently
either.

**E1 — Fix `UC2GridSpacings` units** (independent, do first).
`exp/designs/geometry.go` has `{5,5,5.5}` commented "centimeters" but consumed
as mm; physical pitch is 50/50/55 mm. Rename to a unit-suffixed constant, fix
values, add a regression test pinning flattened positions of
`examples/designs/**`. This is E-blocking for any pose interop.

**E2 — Review + ratify schema v0** (1–2h reading, then a call).
Read `optikit-core/schema/dist/*.schema.json` + `golden/fluo-scope.dsn` +
the WP-1 section above. The extensions over his `DesignDecl`, previously ranked
in the 07-07 meeting, are: `rotation.offset-deg` (extrinsic ZXY residual);
`optics:` block (verbatim Optiland fragment + `frames` + `ports`) replacing
`primitive.type: optiland`; top-level `paths:`; `template:` (class/envelope/
generator); `dof:` list + `instantiation.dof_values`. Deliverable: PR review on
optikit-core with objections, or a 👍. Field-name bikeshedding is welcome *now*
— after M2 the schema is frozen at v1.

**E3 — Implement schema v0 in Go** (after E2).
Extend `DesignDecl`/`CompSpec` with the ratified fields. Fragments and
simulation sections stay opaque (`yaml.Node`/`map[string]any`) — Go never
interprets radii. `Check()` gains the validator rules from the WP-1 list.
Acceptance: a Go conformance test that parses every design in
`optikit-core/golden/**`, re-emits it, and matches the Pydantic round-trip
output (add the corpus as a git submodule or CI checkout).

**E4 — Named-frame anchors** (his ask #3 from the meeting, unblocks nicer
hierarchies). Allow `translation.anchor: <comp>/<frame>` referencing a
sub-design's named datum frame; extend the translation digraph resolution.
Mirror the semantics into optikit-core's `flatten.py` afterwards (coordinate —
small joint spec note first).

**E5 — Decide the Go engine's role** (his call, no deadline).
Options: (a) Go stays the offline/CLI record tool and CI validator, Python
service owns geometry+optics at runtime (current course); (b) port cubify/DRC
to Go later for a single static binary. The typed error codes (E_*, DRC_*) and
the JSON wire shapes in optikit-core's OpenAPI are the contract either way.

**E6 — Align `PrimReport` with the service's `FlatReport`** (small).
Same fields, same names, same Euler convention (extrinsic ZXY, degrees), so
downstream consumers (build123d client, frontend) accept either producer.

---

# Part 4 · What starts today, concretely

| Now (parallel) | Next | Then |
|---|---|---|
| **WP-1** optikit-core scaffold + schema (Claude Code, ~1 session) | WP-2 → WP-3 (engine, compiler) | WP-4/5/6 (chain, annotate, service) |
| **WP-11** document boundary (Claude Code, ~1 session) | WP-13 2.5D canvas (1–2 sessions) | WP-12 after WP-1 lands |
| **E1** for Ethan (tiny PR) | E2 ratification call once WP-1 lands | E3 Go conformance |
| — | WP-7 library + WP-8 glb2template | WP-9 Thorlabs, WP-10 CadQuery |

The demo sequence stays: **M1** headless round trip (needs WP-1…6) → **M2**
library seeded (WP-7…9) → **M3** schematic MVP (WP-11…15) → **M4** assembly +
cubify (WP-16…18).

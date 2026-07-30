# Ray Simulation Architecture

**Status**: implemented, default engine
**Updated**: July 2026

Since the kernel integration (EMB-B..E), every ray a user sees comes from the
oc-wasm physics kernel: an f64 3D non-sequential tracer compiled to
WebAssembly, fed by the optikit-core service. The old TypeScript 2D engine
still exists behind a developer flag (below) but no user-facing path runs it.

## The live loop

Placing, moving, rotating, or deleting a module re-traces the scene without
any user action:

```
edit (2D or 3D view)
  └─ appStore.placedModules changes
       └─ kernelLoop (src/kernel/kernelLoop.ts) — debounce 300 ms
            ├─ designBuilder (src/document/designBuilder.ts)
            │    placements → optikit-design.yml (grid poses, library refs)
            ├─ POST /v1/scene3 to optikit-core (:8000)          ← "materialize N ms"
            │    service resolves records → physical Scene3 JSON
            ├─ kernel worker (src/kernel/kernel.worker.ts)      ← "trace N ms"
            │    oc-wasm loads the scene, traces in f64
            └─ simulationStore.kernel
                 ├─ segments   → KernelRayOverlay (2D), KernelRays3D (3D)
                 ├─ detector   → KernelDetectorPanel (spot, heatmap, numbers)
                 └─ findings   → KernelDiagnostics
```

Loop guarantees (unit-tested in `src/kernel/__tests__/kernelLoop.test.ts`):

- Request ids are monotonic; a response renders only if it is the newest
  issued. A slow old trace can never overwrite a newer one.
- The worker holds one scene, so scene loads are serialized: an older scene
  never loads after a newer one.
- Network failures retry with backoff (500 ms, 1500 ms). A 422 never
  retries: same input, same answer.
- A burst of edits inside the debounce window issues one service request.

## Two engines, one visible

| Engine | Where | Role |
|---|---|---|
| kernel (oc-wasm) | `vendor/oc-wasm-*.tgz`, worker-hosted | default; every user-visible ray |
| legacy TS 2D | `src/simulation/` | developer debug only |

Enable the legacy engine with `localStorage['oc-debug-engine'] = 'legacy'`
and reload. Nothing in the product UI switches engines.

## What is simulated

A module simulates when its row in `public/modules_updated.csv` names a
library record (`optikitId` column). Unmapped modules still place, render,
and appear in the BOM; the diagnostics card lists them as "not simulated".

Mapped set as of this document:

| Module slug | Library record | Mount |
|---|---|---|
| laser-488nm | openuc2.source.laser_488 | |
| lens-pos-1x1 | openuc2.lens.achromat_25mm_f50 | |
| camera-usb-daheng | openuc2.detector.camera_cs165 | z:90 |
| mirror-1x1 | openuc2.mirror.flat_45 | x:90 |
| filter-dichroic | openuc2.dichroic.filter_dichroic | x:90 |
| filter-bandpass | openuc2.filter.emission_525 | |
| beamsplitter-1x1 | openuc2.beamsplitter.cube_5050 | x:90 |
| objective-20x-Nikon-0.75NA-1x1 | openuc2.objective.refractive_20x | |
| sampleholder-1x1 | openuc2.sample.fluoro_slide | |

To simulate a new module: author a component record in
`optikit-core/library/components/` and put its id in the module's
`optikitId` CSV column. The configurator never interprets the record's
optics; it inlines the block verbatim (rule 12 of the integration spec).

### Mounts and orientation

At rotation 0 a record's optical axis points grid east. The `optikitMount`
CSV column declares how a record sits inside its cube, as quarter-turns
about the world axes, applied before the placement rotation:

- Fold records (mirror, dichroic, beamsplitter) mount `x:90` so the fold
  lands in the grid plane. Rotating the module then steers the fold through
  all four in-plane directions.
- The 1×2 camera mounts `z:90` so the sensor faces the drawn lens end of
  the tile. Point the artwork at the beam and it reads: rotation 0 accepts a
  south-travelling beam, 270 an east beam, 180 a north beam.

If a module's artwork disagrees with where its physics points, the mount is
the place to fix it. Two of these mismatches shipped and confused users
(mirror, camera); both fixes were one CSV entry.

## Rays and numbers

The kernel returns world-frame segments as a `Float32Array`, 11 floats per
segment: endpoints, linear-light RGB, flux, flags (TIR, ghost). The 2D
overlay clips segments to the active layer's 55 mm slab; the 3D view draws
them as merged line segments. Ghost segments render at reduced opacity.

Numbers follow one rule: **f32 draws pictures, f64 produces numbers.**
Every value on screen (hit count, flux, centroid, mean OPL) comes from the
kernel's f64 detector result. The f32 hit records feed the spot diagram
only, which is why it has no per-point hover readout.

The detector panel (simulation tab) shows the first detector's spot
diagram, an incident-flux heatmap (sqrt-compressed for display; the honest
magnitudes stay in the quoted numbers), and the readout line. A camera that
catches nothing shows "0 hits" with likely causes instead of hiding.

## Controls: what acts on the kernel

| Control | Effect on kernel engine |
|---|---|
| Simulation ON/OFF | gates the loop and all overlays |
| Auto-run on changes | edits re-trace; off = only the Run button traces |
| Run Simulation | immediate pass, skips the debounce |
| Max Rays per Source | becomes `trace_quality.spatial_samples`; re-traces live |
| Show Rays | hides/shows ray overlays |
| Max Bounces | legacy engine only; no kernel effect |
| Ray Brightness, Color Mode | legacy engine only |

## Diagnostics

The simulation tab's kernel card shows:

- segment count and the engine name
- **materialize N ms**: designBuilder plus the `/v1/scene3` round-trip,
  network included
- **trace N ms**: scene load plus the f64 trace in the worker
- findings from the service (`E_NO_TARGET`, `W_DICHROIC_SPLIT`, ...) with
  the component they concern. Intent findings arrive beside a full physical
  scene, never instead of one: an unconnected laser still emits.
- the not-simulated list

Measured on a 24-component three-bench layout (July 2026): materialize
15 ms median, trace 1-30 ms depending on ray count. Both sit well inside
the 300 ms debounce. If materialize grows past ~50 ms, profile the service
first; glass resolution and YAML parsing were the two hotspots fixed in
optikit-core.

## The vendored kernel

`vendor/oc-wasm-<version>+<commit>.tgz` pins the kernel build; the package
version carries the source commit. `vendor/README.md` has the rebuild
recipe (`npm run wasm` in the canvas repo's `web/`, then `npm pack` with
the commit-stamped version). Update the tarball and the README pin
together.

## Running it

```
# service (separate checkout of optikit-core)
uv run optikit-core serve          # :8000, CORS admits :5173

# configurator
npm run dev                        # :5173
```

Place a laser, a lens, and a camera (rotate the camera so its lens faces
the beam). Rays appear within ~350 ms of the last edit; the camera's
readout card appears in the simulation tab.

## Tests

- `npx vitest run` — unit: loop invariants, designBuilder rotation
  contract, CSV mapping drift guard, detector decode.
- `src/document/__tests__/service.integration.test.ts` — live service
  tests (beam directions, mirror fold, dichroic split, full
  epi-fluorescence chain). They skip unless :8000 answers with a current
  dialect; a stale service prints a restart hint.
- `npx playwright test` — `first-success.spec.ts` (place → trace → slider
  → drag → delete, needs the service) and `canvas-placement.spec.ts`
  (drop-position regression, dev server only).

## Known limits

- Every edit re-materializes the whole design (tier 1). The pose-only fast
  path (CV-C/EMB-F: local transform + f32 preview during drags) is
  designed but not built.
- The materializer ignores `FrameSpec.rotation` and warns
  (`W_FRAME_ROTATION_IGNORED`).
- The 20x objective simulates via a purpose-built refractive record; the
  catalog's `thin_lens` interaction model has no kernel representation.
- One detector panel: the first detector in the scene. Multi-detector
  layouts trace correctly but only the first gets plots.
- `.dsn` export/import with a catalog lock is not wired into the
  configurator yet.

## Legacy engine notes

The pre-kernel custom engine (`src/simulation/SimulationEngine.ts`) and the
unused ray-optics adapter remain in the tree for debugging. The bundled
[ray-optics](https://github.com/ricktu288/ray-optics) source at
`/ray-optics-src/` (Apache-2.0) is not integrated.

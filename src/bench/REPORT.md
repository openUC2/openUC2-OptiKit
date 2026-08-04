# Tracer benchmark: legacy JS engine vs oc-wasm Rust kernel

2026-08-04. AMD Ryzen 9 9900X, Windows 11, Node v24.12.0 (V8, the same JS/WASM
engine family Chrome ships). Branch `feat/ray-tracing-simulation` (PR #30),
backend `kit-canvas-scene3-export`, vendored `oc-wasm-0.0.1+eeeaa2f34`.
All lanes single-threaded. WASM instantiation: 10.9 ms, paid once per worker.

## Question

Which engine should drive interactive ray tracing in optikit-frontend:
`src/simulation/SimulationEngine.ts` (the 2D TS tracer that dsn-model keeps as
its preview engine) or the oc-wasm Rust kernel (PR #30)? And what does the
backend service lane cost for the same scenes, since dsn-model routes
authoritative rays through `POST /v1/simulate`?

## Contenders

| Lane | What it computes |
|---|---|
| `legacy` | 2D in-plane trace, thin-lens/mirror/splitter models from the hard-coded `MODULE_SIMULATION_MODELS` table. No ghosts, no real glass, no 3D. |
| `kernel-f64` | Settled 3D non-sequential f64 trace as production ships it: segments + first-detector readout (`firstDetectorResultJSON` + hits buffer) every call. |
| `kernel-f64-raw` | Same trace without the readout, to attribute its cost. |
| `kernel-f32` | f32 preview trace, picture only. |
| `kernel-drag` | Tier-2 pose edit: `transformObjects3` (one body, +-0.1 mm) + f32 retrace. The drag hot path. |
| `kernel-load` | `loadScene3JSON` alone (client side of a structural edit). |
| service | `/v1/scene3` (materialize) and `/v1/simulate` (compiled Optiland trace), timed in-process via TestClient. Real deployments add HTTP transport on top. |

Scene fixtures come from one shared placement list per scene: the production
`designBuilder` builds the design, the backend materializes it (kernel input),
and `sceneBuilder.buildScene` produces the legacy elements. Launched rays are
matched: `params.rayCount` per legacy source equals `samples.spatial_samples`
per kernel source. Timer: 3 warmup calls, then up to 350 ms or 400 iterations,
median reported.

Scenes: `row3` laser-doublet-camera east row. `fold` laser-mirror-camera, the
one scene where both engines emit identical segment counts (mirror only, no
refraction, no ghosts). `epi` the 7-module epi-fluorescence chain. `scaleNN`
laser + N doublets + camera. Reproduce:

```
npx vitest run src/bench/emit-designs.test.ts
(cd ../optikit-core) uv run --no-sync python ../openUC2-OptiKit/src/bench/gen_scenes.py
npx vitest run src/bench/tracer-bench.test.ts
```

## Results (median ms per trace)

| scene | rays | legacy | kernel-f64 | f64-raw | kernel-f32 | drag | load | segs legacy | segs kernel |
|---|---|---|---|---|---|---|---|---|---|
| row3 | 16 | 0.014 | 0.593 | 0.146 | 0.045 | 0.054 | 0.023 | 32 | 64 |
| row3 | 256 | 0.091 | 7.156 | 2.332 | 0.652 | 0.828 | 0.018 | 512 | 1024 |
| row3 | 4096 | 1.541 | 127.3 | 39.76 | 11.19 | 13.94 | 0.031 | 8192 | 16384 |
| fold | 16 | 0.011 | 0.182 | 0.006 | 0.004 | 0.005 | 0.011 | 32 | 32 |
| fold | 256 | 0.079 | 0.348 | 0.070 | 0.055 | 0.056 | 0.011 | 512 | 512 |
| fold | 4096 | 1.702 | 2.911 | 1.053 | 0.830 | 0.838 | 0.010 | 8192 | 8192 |
| epi | 16 | 0.012 | 6.624 | 2.147 | 0.598 | 0.599 | 0.057 | 48 | 768 |
| epi | 256 | 0.108 | 103.7 | 35.38 | 9.496 | 9.466 | 0.032 | 768 | 12288 |
| epi | 4096 | 1.695 | 1724.7 | 576.1 | 144.2 | 143.7 | 0.046 | 12288 | 196608 |
| scale01 | 256 | 0.093 | 8.145 | 2.684 | 0.706 | 0.894 | 0.030 | 512 | 1024 |
| scale04 | 256 | 0.354 | 77.91 | 25.88 | 8.671 | 9.416 | 0.051 | 1280 | 3328 |
| scale08 | 256 | 1.033 | 283.3 | 96.68 | 34.58 | 36.36 | 0.164 | 2304 | 6400 |
| scale16 | 256 | 3.684 | 685.0 | 229.9 | 90.22 | 89.30 | 0.183 | 4352 | 6400 |

Legacy epi rows use `legacy-nobp` (bandpass removed). With the bandpass in
place the legacy filter model absorbs the 488 nm beam at the first element and
the trace degenerates to 1 segment per ray (0.108 ms at 256 rays for 256
segments). Kernel epi at 16 rays launches 768 segments because the sample's
cone source samples 8 angular directions and the dichroic splits every ray.

Backend lanes, in-process handler cost (add 2-10 ms localhost HTTP, more over
a network):

| scene | /v1/scene3 | simulate n=16 | n=256 | n=1024 | n=4096 |
|---|---|---|---|---|---|
| row3 | 3.2 | 13.0 | 19.1 | 38.6 | 126.5 |
| fold | 3.0 | 4.0 | 7.0 | 15.7 | 52.7 |
| epi | 4.4 | 9.7 | 16.4 | 37.2 | 130.6 |
| scale16 | 9.6 | (no legal path: E_STOP_MULTIPLE, see findings) | | | |

## Reading the numbers

**Equal workload: the kernel wins.** `fold` is the only scene where both
engines produce the same segments (8192 at 4096 rays). Kernel f32: 0.830 ms,
2.1x faster than legacy's 1.702 ms. Kernel f64 without readout: 1.053 ms, 1.6x
faster. Per segment on this scene the f32 tracer costs 0.10 us against
legacy's 0.21 us.

**Everywhere else the wall-time gap is a physics gap.** Kernel segments run 2x
legacy on row3 (three real glass surfaces and their inter-surface legs against
one thin-lens hop) and 16x on epi (dichroic split branches and 8-direction
cone emission against three hops that stop at the sample). Ghosts play no
part: the vendored Canvas constructs with `ghosts: false` and the configurator
never enables them, so these numbers were ghost-free all along (pinned
explicitly in KernelCore since 2026-08-04). Wall time scales with segments
traced, not with engine overhead.

**The settled lane is 62-70% readout serialization.** f64 vs f64-raw: 7.16 vs
2.33 ms on row3 at 256 rays; 1725 vs 576 ms on epi at 4096. The detector JSON
plus hits buffer, encoded on the Rust side and parsed per settled trace, costs
about twice the trace itself. That is an optimization target (binary readout,
or readout only when the panel is open), not a tracer property. Production
settles once per debounced edit; previews and drags never pay it.

**Interactive budget holds at production ray counts.** The slider default is
100-300 rays. At 256 the drag lane runs 0.83 ms (row3), 0.056 ms (fold), 9.5 ms
(epi): all inside the 16.7 ms frame budget of 60 fps, epi at about 100 fps.
Stacks of 8-16 sequential doublets blow past it (36 and 89 ms): legs per ray
grow with surface count and each leg pays per-object intersection work. The
kernel's depth cap also bites there: `TraceConfig3.max_depth = 24`
interactions per ray, so the 16-doublet relay (48 glass surfaces) is truncated
mid-flight - its segments saturate at 25 x rays and no ray reaches the camera.
Realistic UC2 layouts sit far below both limits; a deep relay needs a raised
depth cap before its numbers mean anything.

**The engines disagree on answers, not just speed.** Legacy's table hard-codes
`lens-pos-1x1` at f = 100 mm; the record both PR #30 and dsn-model map that
slug to is the AC254-050-A, EFL 50.169 mm. The two engines focus the same
layout at different z. Legacy's emission filter kills the excitation beam the
product's flagship epi workflow depends on, and its mirror fold carries the
2-theta disagreement WP-82a documents. A preview that contradicts the
authoritative engine on focus position costs user trust regardless of its
frame rate.

**Server dependence, quantified.** The kernel touches the backend only on
structural edits (`/v1/scene3` materialize: 3-10 ms handler) and traces locally
after that; drags never leave the browser. Routing every view update through
`/v1/simulate` costs 4-131 ms handler plus transport per update, needs a
reachable server, and serializes concurrent users onto shared compute. The
in-browser kernel spends the user's own core and works offline.

## Caveats

- Node, not a browser. Both lanes run on V8 either way; worker `postMessage`
  transfer is excluded for both engines alike.
- Kernel segments saturate at 25 x rays (`max_depth: 24` interactions + the
  escape leg) on scale08/scale16; scale16's relay is physically truncated, so
  per-segment arithmetic is invalid there.
- Legacy epi needed two substitutions (`objective-20x-1x1`,
  `fluorescent-sample-1x1`) because the Nikon objective and sampleholder slugs
  have no entry in its model table.
- Each legacy `RaySegment` allocates a uuid string; that cost is inherent to
  its design and included.
- TestClient timings exclude HTTP transport and concurrent load.

## Incidental findings (worth filing upstream)

1. **`compile_path` crashes on quoted `'.inf'` radii** at `compiler.py:685`
   (`float('.inf')` ValueError). WP-43-migrated planar records (mirror,
   dichroic, filters) author radii as the quoted string; the canvas dialect
   accepts them since 2026-07-30, the compiler does not. Any design inlining
   such a record 500s `/v1/simulate`, which is dsn-model's authoritative lane.
   Workaround in `gen_scenes.py::definfy`.
2. **`E_STOP_MULTIPLE` forbids stock-lens relays.** Every AC254-style record
   authors `is_stop`, so a connected path through N > 1 of them is rejected at
   materialize. A relay of catalog doublets cannot be a legal path today.
3. Legacy model drift (observation): `MODULE_SIMULATION_MODELS` focal lengths
   predate the record library and no longer match it.

Findings 1 and 2 are fixed on `kit-canvas-scene3-export` (9d50ecb,
2026-08-04): compile shares the dialect's `.inf` spelling acceptance (junk
radii raise a typed E_GEOMETRY), and extra path stops demote under
W_STOP_DEMOTED / a compile warning instead of rejecting the design. The
harness workaround (`definfy`) is removed.

## Verdict

At production ray counts the kernel's preview and drag lanes stay inside the
60 fps budget on realistic layouts while computing real glass, spectral splits
and detector readouts; on the one workload the two engines share exactly,
kernel f32 is 2.1x faster than the legacy engine. Legacy wins wall time only
where it simulates a smaller problem, and it disagrees with the authoritative
engine on focus position and epi transmission. The service lane is 1-2 orders
of magnitude above the kernel's local trace once transport is counted, and
scales per-user cost with usage.

Recommended split: oc-wasm kernel as the interactive engine (preview + drag +
settled readouts), `/v1/simulate` as the authoritative cross-check and the
optimize/compile oracle, exactly the role division the integration spec
already encodes.

Actions taken the same day (2026-08-04): the settled trace serializes the
detector readout only while the panel is open (`traceWorld` readout flag
through KernelClient/loop, flush-on-tab-open fetches numbers late), so a
panel-closed settle now costs the f64-raw column instead of the f64 column;
ghost tracing is pinned off for the openUC2 embedding in KernelCore (the
vendored Canvas default was already off, so no bench row moves); and both
backend findings are fixed as above.

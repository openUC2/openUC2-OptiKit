# Vendored kernel: oc-wasm

`oc-wasm` is the Optiland Canvas ray-tracing kernel compiled to WebAssembly. It is
vendored here as an npm tarball because the source repository (`optiland-canvas`)
is private, so public CI cannot build it from source (integration spec rule 13).

- **Current pin:** `oc-wasm-0.0.1+83bcea9fa.tgz` — the `+<sha>` build metadata is
  the `optiland-canvas` commit the tarball was packed from. This build adds the
  exact pointwise R+T validation for tabulated response pairs (spectral
  dichroics: complementary step curves validate).
- **Consumed as** a `file:` dependency in `package.json`; Vite excludes it from
  dependency pre-bundling (`optimizeDeps.exclude`) and the worker passes the wasm
  URL explicitly (the `/configurator/` base breaks implicit paths).

## Updating the kernel

1. In `optiland-canvas`, download the `oc-wasm-tarball` artifact from the CI
   `web` job (or run its "pack kernel tarball" step locally against `web/pkg`).
2. Replace the `.tgz` here, update the pin above and the `file:` path in
   `package.json`, and run `npm install`.
3. One PR per bump: the tarball, this README, `package.json`, and the lockfile.

This mechanism retires once `optiland-canvas` is public: `oc-wasm` then ships to
a public npm registry and the dependency becomes an exact-version pin
(integration spec ADR-8/ADR-12).

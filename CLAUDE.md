# openUC2-OptiKit — project rules

## Architecture direction

This app is becoming the editor pair (schematic + assembly) of the "KiCad for
optics" toolchain. Strategy and work packages: `DOCS/kicad-for-optics-execution.md`
(execution plan, per-WP prompts) and `DOCS/kicad-for-optics-workplan.md` /
`DOCS/datamodel-unification.md` (rationale). The normative datamodel lives in the
sibling repo `../optikit-core` (Pydantic → JSON Schema in `schema/dist/`). For
what that repo actually does, its relationship to the Go repo, and the
day-to-day workflow between the two repos, see `../optikit-core/DOCS/ARCHITECTURE.md`,
`GO_INTEGRATION.md`, and `WORKING_WITH_FRONTEND.md`. This repo's own architecture
walkthrough (what the editor can do, the layering, the conventions) is
`DOCS/ARCHITECTURE.md`; `DOCS/CODEBASE-GUIDE.md` is the cross-repo file-by-file map.

## We speak DSN — the one contract

The frontend↔backend common ground (document frame, grid pitch, the 24
rotations + `offset-deg` residuals, ports, record trio, API surface) is
defined ONCE in **`../optikit-core/DOCS/DSN-CONTRACT.md`** (with the
`rot24.svg` drawing). Everything on the wire is `.dsn`; internal stores are
private representations, never a contract. Point external contributors at
that manifest, not at this repo's internals.

## Hard rule: the document boundary

**Editor components import design-model state ONLY from `src/document` (the
`OptikitDocument` facade) — never from `stores/appStore`.**

Since **WP-96 the facade IS the `.dsn` document**: `src/document/documentStore.ts`
holds `DsnPart[]` in the schema's own spelling (`cell` + `offsetMm`, `rot24` +
`offsetDeg`), plus the selection and the undo stack. The legacy
`PlacedModule[]` design state is gone from `appStore`, which now keeps only
the module catalog, layers, setup metadata, notifications and the legacy
interchange plumbing.

- Pose math: `src/document/mapping.ts` — the **canonical** half (`DsnPart`)
  is the only one new code touches; the **legacy interchange** half below the
  banner belongs to `legacyLayout.ts` alone.
- `src/document/legacyLayout.ts` is the *only* file that may mention
  `PlacedModule`. It converts to/from the old layout JSON, share links, the
  ImSwitch export and the pre-WP-96 localStorage blob (migrated once on load).
- The yaw of a discrete orientation is coset arithmetic in
  `src/document/rot24.ts` (`yawStepOfRot24` / `rot24WithYawStep`) — never
  read it off a local axis or a 90°-step euler triple, both are ambiguous.

The component ("symbol") editor lives at `/configurator/components`
(`src/components/component-editor/`); its record model, YAML serialization,
and validation are pure functions in `src/model/componentRecord.ts`. Records
it produces must always validate in optikit-core (`library validate`) —
asserted by the committed fixture
`src/model/__tests__/fixtures/ac254-050-a.component.yml`.

## Conventions

- Tests: vitest (`npm test`); unit tests live in `__tests__/` next to the code.
- UC2 grid pitch is 50/50/55 mm (`src/document/types.ts` UC2_GRID_MM); the
  render-only baseplate offset in the 3D view is not part of the model.
- Lint with `npm run lint` before committing.

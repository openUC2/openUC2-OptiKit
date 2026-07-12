# openUC2-OptiKit — project rules

## Architecture direction

This app is becoming the editor pair (schematic + assembly) of the "KiCad for
optics" toolchain. Strategy and work packages: `DOCS/kicad-for-optics-execution.md`
(execution plan, per-WP prompts) and `DOCS/kicad-for-optics-workplan.md` /
`DOCS/datamodel-unification.md` (rationale). The normative datamodel lives in the
sibling repo `../optikit-core` (Pydantic → JSON Schema in `schema/dist/`).

## Hard rule: the document boundary

**New editor components must import design-model state ONLY from `src/document`
(the `OptikitDocument` facade) — never from `stores/appStore` directly.**

The facade currently wraps the legacy appStore (`PlacedModule[]`); it will be
re-backed by the `.dsn` schema-v0 document without changing its API. Pose
conventions (document frame: mm, z-up, right-handed; store frame: grid cells,
layer, three 90° rotations) are documented in `src/document/mapping.ts` — read it
before touching any coordinate code. Legacy components (GridCanvas, PropertyPanel,
Toolbar, …) still use appStore; do not add new appStore consumers.

## Conventions

- Tests: vitest (`npm test`); unit tests live in `__tests__/` next to the code.
- UC2 grid pitch is 50/50/55 mm (`src/document/types.ts` UC2_GRID_MM); the
  render-only baseplate offset in the 3D view is not part of the model.
- Lint with `npm run lint` before committing.

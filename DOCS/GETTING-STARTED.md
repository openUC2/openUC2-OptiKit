# Getting started — your first day on OptiKit

This is the "I have just cloned this, what is it and how do I run it" document.
It assumes nothing about optics and nothing about the codebase.

For the deeper maps, once this makes sense:

| Question | Read |
|---|---|
| What can the editor already do, and how is it layered? | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Which file does what, across both repos? | [`CODEBASE-GUIDE.md`](CODEBASE-GUIDE.md) |
| What exactly do the two halves agree on? | `../optikit-core/DOCS/DSN-CONTRACT.md` |
| Where is the work going? | [`kicad-for-optics-roadmap.md`](kicad-for-optics-roadmap.md) |

---

## 1. What this is

**KiCad, for optical setups.** You design an optical instrument the way you'd
design a circuit board: place parts, wire them together, check the design,
simulate it, then produce the thing.

The analogy is exact enough to be worth memorising, because the code is named
after it:

| KiCad | OptiKit |
|---|---|
| schematic — symbols and nets | **schematic** (`/configurator/schematic`) — optical parts and beam paths |
| PCB layout — footprints on a board | **assembly** (`/configurator/assembly`) — cube modules on the 50/50/55 mm grid |
| symbol + footprint libraries | the **parts editor** (`/configurator/components`) and the record library |
| pins | **ports** — where a beam enters and leaves a part |
| DRC | DRC — collisions, unreachable parts, T-class violations |
| SPICE | **Optiland** ray tracing, through the core service |

The physical system is [openUC2](https://openuc2.com): optics live in 50 mm
plastic cubes that puzzle together on a grid. That grid is why the editor can
be a board editor at all.

## 2. The two repositories

```
OPTIKIT/
├── openUC2-OptiKit/     ← you are here. The EDITOR: React + three.js, runs in a browser.
└── optikit-core/        ← the ENGINE: Python. Ray tracing, CAD generation, the part library.
```

They are deliberately separate and talk over HTTP. The rule that keeps them
honest: **everything on the wire is `.dsn`**. The frontend's internal stores are
private; the moment something crosses to the service it is a `.dsn` document.
That contract is one file — `../optikit-core/DOCS/DSN-CONTRACT.md` — and it is
normative. If this repo and that document disagree, the document is right.

## 3. Run it

Two terminals. The engine first, because the editor asks it for the part library
on load.

```bash
cd optikit-core && uv sync && uv run optikit-core serve --port 8000
```

```bash
cd openUC2-OptiKit && npm install && npm run dev
```

Then open <http://localhost:5173/configurator/schematic>.

**How to tell it worked:** the left-hand Part Library lists parts. If it is
empty, the editor cannot reach the service — check that `:8000` is up and that
the "library index URL" box at the bottom of the parts editor points at it.
The editor degrades to a small bundled snapshot rather than erroring, so an
empty-looking palette is the symptom to watch for.

### Verify without a browser

The engine ships a narrated tour of itself. It is the fastest way to see what
the pipeline actually does, and it doubles as a debugger:

```bash
cd optikit-core && uv run python main.py --list
```

```bash
uv run python main.py --act guards
```

That last one runs the four checks covering the most recent round of fixes
(simulating a design with no optics in it, the library write gate, template
meshes against their records, the curated mirror family). `--only <step>` runs
one; `python -m pdb main.py --only compile` steps through the compiler.

## 4. The one idea you need: a part is THREE records

This trips up everyone once, and most confusion in the UI traces back to it.

A part is not a file. It is three linked records:

```
optical_component   the SYMBOL — what it does to light.
                    Surfaces, materials, focal length, ports. No geometry.

mechanical_template the FOOTPRINT — the thing that physically holds the optic.
                    STEP/GLB mesh, envelope, degrees of freedom. No physics.

cube_module         the BINDING — "this optic, in that holder" — which is what
                    you can actually place on the grid.
```

They live in `optikit-core/library/{components,templates,modules}/<id>/*.yml`,
one directory per record, assets beside the YAML. The service builds an index
from the tree on every request, so **editing a record and reloading the page is
the whole dev loop** — no rebuild step.

### Which of the three states is a part in?

Because the three records are separate, a part can exist in three states — and
the UI now says which, in words:

- **in a cube** — all three records exist. Place it and you are done.
- **housed · no cube** — an optic in its own housing (a laser body, a kinematic
  mount) with no cube yet. Place it freely; generate a cube around it later.
- **needs a holder** — a bare symbol. You can design and simulate with it, but
  it cannot be built until someone makes it a holder.

The **anatomy** tab in the parts editor draws all three layers at once, greying
out the ones that do not exist yet. A greyed layer is a to-do, not an error.

### T1 / T2 / T3

A cube module's `template.class` says how much the optic can move once it is in
the cube:

- **T1 `fixed`** — glued in place. The part sits at the cell centre, full stop.
- **T2 `adaptive`** — an insert on declared axes (a focus knob, a z stage).
  It can move, but only along the DOFs the template declares, within their range.
- **T3 `generative`** — no cube exists yet; one gets generated around the optic
  on demand.

This is why a part sometimes refuses to go where you drag it: a T1 part is
pinned to its cell by its record, and the inspector will say so.

## 5. The layout, in the order you will meet it

```
src/
├── document/     THE DESIGN. Parts, poses, selection, undo, the palette registry.
│                 This IS the .dsn document — `DsnPart` is spelled the way the
│                 file is (cell + offset-mm, rot24 + offset-deg).
├── components/   The React UI: schematic, assembly, parts editor, inspector.
├── model/        Everything that is not the design: the record schema, the
│                 library index, .dsn import/export, the service client.
└── stores/       appStore — the shell (catalog, layers, metadata, notifications)
                  and the legacy interchange. NO design state.
```

**The one hard rule:** editor components import design state from
`src/document` only, never from `stores/appStore`. If you find yourself reaching
into appStore for a part, stop — the facade has what you need, and the rule is
what keeps the document the single source of truth.

Two more conventions worth knowing before you write anything:

- **Pose maths lives in `src/document/mapping.ts`.** A part's world position is
  `p = S·cell + δ` — the grid pitch times the integer cell, plus a residual.
  Do not reinvent it.
- **A discrete orientation's yaw is coset arithmetic** (`rot24.ts`), never read
  off a local axis or a 90°-step euler triple. Both are ambiguous, and both
  have produced 270°-off bugs.

## 6. Working on it

```bash
npm test          # vitest — unit tests live in __tests__/ beside the code
npm run lint      # eslint, zero warnings expected
npx tsc -b        # the REAL typecheck
```

⚠️ **`npx tsc --noEmit` checks nothing here.** The root tsconfig is a solution
file with `files: []`, so it exits 0 having looked at zero files. Always use
`tsc -b` (add `--force` to bypass the build cache). This has hidden real type
errors for entire rounds.

On the engine side:

```bash
cd optikit-core
uv run pytest -q                        # the whole suite
uv run optikit-core library validate    # every record + its mesh
```

### The dev loop for a part

1. Open `/configurator/components`, search for a part, click it — you are
   editing a **copy**.
2. Change something. The right-hand pane shows the record YAML as it would be
   written.
3. Save it one of three ways, and know which you picked:
   - **Save to workspace library** → a draft in *this browser only*.
   - **Write into ../optikit-core/library** → the shared library on disk. It
     asks first and lists exactly which fields change; everything the form has
     no field for (tags, docs, review notes) is preserved, not overwritten.
   - **Download record YAML** → a file, for a pull request.

The "saved" chip in the toolbar tells you when the *design* was last written,
and clicking it lists every place the app stores anything, with how long each
survives. Worth opening once early: the honest answer to "where is my work" is
"in several places with different lifetimes", and one of them is lost on reload.

## 7. Where the bodies are buried

Things that have cost people a day, in no particular order:

- **`tsc --noEmit` is a no-op** (above). Use `tsc -b`.
- **A design must compile STANDALONE.** Neither the compiler nor an app that
  imported a `.dsn` resolves library refs into optics. A design that references
  a lens without inlining its `optics.fragment` compiles to nothing and
  simulates as `E_EMPTY_SYSTEM`. Refs are for the palette; physics must be in
  the file.
- **Two glTF conventions exist in the library.** Older exports carry an
  `Rx(-90°)` wrapper node that pre-applies the document→viewer basis change;
  newer Open CASCADE exports do not. `library validate` warns about the
  mismatch rather than pretending it isn't there. If a cube renders on its
  side, this is why.
- **Vite HMR can split a module into two instances** after a long session, so a
  store appears to have two copies of itself. Restart the dev server; a
  production build is single-instance by construction.
- **There is a hardcoded GitHub token in `stores/appStore.ts`.** It is real, it
  ships to every browser, and it should be revoked and moved behind the
  service. Do not add more of these.

## 8. Your first change

A good starter: open `/configurator/components`, find a curated part, and read
its record YAML alongside the **anatomy** tab. Then place the same part in the
schematic and open the inspector. You are looking at one object through three
windows — the record, the drawing, and the placement — and once that clicks,
the rest of the codebase is navigable.

If you want a code-shaped first task, the roadmap's open packages are written
as self-contained prompts with acceptance criteria — start at
[`kicad-for-optics-part2n.md`](kicad-for-optics-part2n.md), which is the most
recent round and says exactly what is broken and why.

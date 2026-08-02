# Part 2n · Feedback round 13 (2026-08-01) — the flow: what is broken, what is missing, and the one mental model

Continues `kicad-for-optics-part2m.md`. Source: a session driving the whole
loop — import a community `.dsn`, open a part, author a mirror, attach Inventor
CAD, place on the grid — and finding it "very confusing to navigate". WP
numbering continues at **WP-99**.

Every claim below was traced to code and then independently re-checked by a
second reader; `file.ts:LINE` citations are the verified ones. **Five of the ten
reported symptoms turned out to be bugs, not missing features** — which is the
headline: the flow is not only under-explained, it is currently *lying* in four
specific places, and a user cannot build a mental model against a UI that lies.

---

## 0. Answers first — the things that are answers, not work

### "There is still no GLB, neither in the parts editor nor in the assembly viewer"

**Your GLB is already in the library and already served. The assembly canvas
refuses to draw it because of a gate that has nothing to do with the mesh.**

`AssemblyScene.tsx:382` tests `templateClass === null` *before* it ever reaches
`render.glbUrl` at `:384`. And `templateClass` (`:326`) is read off the
**exported service design** (`AssemblyPage.tsx:221-228` → `serviceExport.ts:304`
→ `comp.template?.class`) — but `bareComponentSpec()`, the exporter every
palette-placed part goes through, **never emits a `template:` block at all**
(`convert.ts:166-181`). So for anything placed from the palette, `templateClass`
is `null`, the "no template" ghost box wins, and a perfectly valid `glbUrl` is
unreachable dead code.

That single gate explains all of it:

- the ghost cubes labelled "template" in your assembly screenshot;
- why the inspector can show a working **GLB ↗** link on the same screen — the
  inspector reads a *different* source (`libraryEntryOf` / `index.modules`,
  `AssemblyPage.tsx:86,94`) and that one is correct;
- why WP-98's bundle mesh donation has, in fact, **never once been visible** —
  the community setup bundle's design declares no per-component `template:`
  either, so its three cubes ghost out despite the blob URLs being minted.

→ **WP-99**, and it is a ~6-line change.

The *parts* view is a different, real gap: `/configurator/components` mounts
`LibraryBrowser`, which lists **optical components only** — not modules, not
templates — and index components carry no mesh or thumbnail asset at all
(`build.py:326-356` emits no `assets` key for components). So no template GLB
can ever appear there today, no matter what you attach. → **WP-104/WP-106**.

### "How can we write into the library when we run the server through serve.py?"

**It already works, with no flag.** `POST {coreUrl}/v1/library/save` is enabled
unconditionally — `app.py:1140` does
`os.environ.setdefault("OPTIKIT_ALLOW_LIBRARY_WRITE", "1")` *before* reading the
gate, which makes the documented "only from a git checkout" probe dead code. It
writes straight into `optikit-core/library/`, and `GET /v1/library/index`
rebuilds from the tree on the next request (mtime-keyed cache, `?fresh=1` to
force) — **no `library build`, no restart**. `library build` only refreshes the
offline snapshot `library/dist/index.json`.

Two roads today:

- **GUI:** the button is on the **mechanics** tab ("Package · write into
  ../optikit-core/library", `MechanicsPanel.tsx:745`), *not* the optics tab the
  banner appears above. It is greyed out until `store.datums.length > 0`
  (`MechanicsPanel.tsx:189-190`) — and opening a record **clears the datums**
  (`bindStore.ts:131`). So the actual recipe is: open the record → mechanics tab
  → load an STP/GLB → switch the viewport to **datum mode** → click the mesh
  once → the button lights up.
- **Optics-only edits have no GUI road at all.** Copy the record YAML from the
  right-hand pane and `POST` it: the endpoint takes a bare list of YAML strings
  and keys the destination off `kind` + `id`.

**But do not press that button again until WP-102 lands.** It is destructive:
`draftToRecord` builds a *fresh* object and `draftFromRecord` never reads
`tags`/`docs`/`review`/unknown keys, and the backend does a verbatim
`write_text`. Your working tree proves it — the write that attached the mirror
GLB replaced `tags: [mirror, mirror/flat, mirror/single-sided]` with
`tags: [authored]`, dropped the file's header comment, and on other records has
destroyed `docs`, `review`, `price: 50.0` and `glb-url`.

### "Opening the demo lens in the parts editor gives a generic `user.lens.@0.1.0`"

The `?open=` deep link resolves an id through **exactly one route** — an HTTP GET
of the *published registry* asset (`ComponentEditorPage.tsx:168`). Your demo lens
came from a `.dsn` bundle, so it lives in the browser-local workspace store
(`bundleImport.ts:151`), the service answers 404 — and the failure is swallowed
twice (`if (response.ok)` with no `else`; an empty `catch` whose comment says
"stay on the blank draft"). What you are looking at is
`useState(() => defaultDraft('lens'))`: the missing name slug, the empty
description, the R ±50 / t 4 surfaces and "fix the validation issues" are all
just the blank-new-record defaults. → **WP-100**.

### "Why is the curated laser a *draft*?"

The BOM badge is `entry.review` (`bom.ts:68`) — one boolean, four producers,
four meanings, one label. The laser's registry records still carry the WP-43
note *"auto-migrated from the legacy CSV palette — confirm the record"*, and
`build.py:384` ORs the note across the whole trio. So "draft" actually means
"someone left an unconfirmed migration note on one of these three records" — and
it is orthogonal to price, which is why a curated part is both badged *and*
€650. The bundle lens is badged for an unrelated third reason:
`bundleImport.ts:244` hardcodes `review: true`. **18 of the 36 curated modules
badge today**, 8 of them from a component or template record whose `module.yml`
is clean. → **WP-108**.

### "When placing on the grid they land anywhere; once I drag they snap"

Not a snap — a **T1 constraint firing late**. `addPart` and `movePartWorld` split
the pointer position identically, but only the *move* path passes the residual
through `constrainOffsetToTemplate`, which returns `[0,0,0]` for a `fixed`
template. `addPart` writes the raw residual (`OptikitDocument.ts:167`), so a drop
keeps up to ±25/±25/±27.5 mm of sub-cell offset; the first `onPointerMove` of
your drag then zeroes it. 27 of 33 served modules are `class: fixed`, so this
bites almost everything. → **WP-101**.

### "When is my work actually saved?"

There is no document abstraction in the persistence layer. There is **one
implicit singleton design** written by a blind 5-second `setInterval` +
`beforeunload` (`App.tsx:145-153`), **eight sibling zustand slices** that persist
themselves independently on their own keys, and **four stores holding real work
that never persist at all**. Concretely:

| You did this | Where it went | Survives reload? |
|---|---|---|
| Placed / moved / deleted a part | `openuc2-optikit-document` | Yes — but up to 5 s late |
| Drew a beam path, added a fiber | `optikit-doc-paths`, `optikit-doc-fibers` | Yes, immediately |
| Edited a part, "Save to workspace library" | `optikit-workspace-library` | Yes (this browser only) |
| "Package · write into ../optikit-core/library" | `optikit-core/library/` on disk | Yes — and it is shared, and lossy |
| Imported a `.dsn` zip | components → workspace (persists); modules → **session only** | **Modules: no.** Blob GLBs die |
| Loaded an STP/GLB in the mechanics tab | IndexedDB, keyed on the **validated** record | Only if the draft validated |
| Typed in the parts editor without saving | React state | **No** |
| Opened a published setup | in-memory `remoteSourcePath` | **No** — "Save (Overwrite)" then vanishes |

Three of the File menu's items say "Save" and none of them touches the document:
"Save Layout As…" is an export, "Upload to Setup Browser" and "Save (Overwrite)"
are publishes. → **WP-105**.

### And one thing that is not in any package: the committed GitHub PAT

`appStore.ts:107-109 / 518-520 / 675-677` assembles a real GitHub token from two
string halves, with **no gate** (the "enter the last 7 characters" prompt at
`:499-516` is inside a comment block). It is in the repo and shipped to every
browser. Revoke it and move the write behind the service — this is not a work
package, it is a today thing.

---

## 1. The mental model you described, mapped onto what exists

You wrote the model plainly. Here is each expectation against the code, because
the gap list *is* the work:

| You expect | Today | Gap |
|---|---|---|
| "I have a library of parts" | Three registries merged into one flat list (registry / workspace drafts / session bundle) — but the parts editor sees only two of them, and lists components only | WP-106 |
| "Some parts are permanently in an openUC2 cube → T1" | `templateClass: 'fixed'` exists and is correct, but is shown nowhere in the palette and is *dropped* on export | WP-99, WP-103 |
| "Some are unmounted, placed freely: T2 / T3" | `unbound: boolean` + nullable `templateClass` encode **three** states in two fields; `templateClass === null` means three different things | WP-103 |
| "I place these as primitives on the grid in 3D" | Works — but the drop is off-grid (WP-101), and a T1 cube is drawn as a ghost, not a cube (WP-99) | WP-99, WP-101 |
| "In case of T1 we should actually see it inside an openUC2 cube" | The schematic draws the 50 mm envelope only for `tClass === 'fixed'`, and the assembly ghosts it | WP-103 |
| "Create a pair: optical primitive → housing → holder → cube" | The machinery exists (record trio + bind flow) but is split across two tabs with no view of the whole | WP-104 |
| "When I open a part I see the optic, in a housing, in a cube" | **Nothing in the app draws this.** Closest: a three-line text card in the assembly inspector | WP-104 |
| "…and when things get saved" | See the table above | WP-105 |

The through-line: **the datamodel already knows all three states** — optikit-core
ships `components`, `housings` and `modules` as three separate index sections
*precisely* so the frontend can tell them apart — and the frontend flattens them
into one opaque `libraryRef`. That flattening is why the UI cannot explain
itself, and un-flattening it (WP-103) is what makes WP-104 possible.

---

## 2. The work packages

Priority order. Tier 0 is "the app is lying"; Tier 1 is the mental model; Tier 2
compounds. Tier 0 is roughly a week of work in total and unblocks judging
everything else.

---

### Tier 0 — stop the app lying (do these first, in this order)

#### WP-99 — The assembly draws the mesh you attached ✅ *(done, 2026-08-01)*

```
PROMPT (repo: openUC2-OptiKit, frontend only)

The assembly canvas cannot render ANY library GLB for a palette-placed part,
because the mesh branch sits behind a gate that is always null for those parts.
Fix the gate, not the meshes — the meshes are fine and serve 200.

1. THE GATE. src/components/assembly/AssemblyScene.tsx:326 reads
   `mechanics?.templateClass ?? null`, which comes from the EXPORTED service
   design (AssemblyPage.tsx:221-228 → serviceExport.ts:304 → comp.template.class)
   and is null for every palette-placed part, because bareComponentSpec()
   emits no `template:` block (convert.ts:166-181). Take the T-class from the
   palette registry instead — `templateClassOf(part.libraryRef)`
   (libraryPalette.ts:526, already exported via document/index.ts and already
   used exactly this way by SchematicScene.tsx:127) — and keep
   `mechanics?.templateClass` only as the fallback for retained-source designs:

     const entry = libraryEntryOf(part.libraryRef);
     const templateClass = entry?.templateClass ?? mechanics?.templateClass ?? null;

   This is safe here: AssemblyPage.tsx:93 mounts useLibraryRegistration(), so
   LIB_ENTRIES is populated. DELETE the stale WP-51.2 comment at
   AssemblyPage.tsx:104-106 ("the assembly does not mount PartLibrary, so
   palette registration is absent here") — it has been false since WP-92 and
   the next reader will reject this change on its authority.

2. REORDER THE LADDER so a mesh always wins. AssemblyScene.tsx:365-392 is
   `ifaceBody → unbound → templateClass===null → glbUrl → ghost`. Make it
   `ifaceBody → glbUrl → unbound → templateClass===null → ghost`. Keep
   ifaceBody first (it is already gated on `!render.glbUrl` at :342). This also
   un-swallows the WP-67 housing mesh on unbound parts (libraryPalette.ts:491),
   which has never rendered.

3. T2 HANDLES, same root cause. bareComponentSpec emits no `dof:` block either,
   so listPartMechanics gives palette-placed T2 modules `translationDofs: []`
   — no insert handle in the canvas (AssemblyScene.tsx:574-583) and no DOF
   number fields in the inspector (AssemblyPage.tsx:579-585). Source the DOFs
   from `libraryEntryOf(part.libraryRef)?.dofs` (libraryPalette.ts:316-327)
   with mechanics as the fallback. TranslationDof additionally needs `key` and
   `value`: `${part.id}.${dof.name}` is adequate (it is only a React key and a
   reportClamp label) and the value is already re-read at the call site. Skip
   dofs whose `range` is null.

4. HONEST GHOSTS. GhostBox's default label 'no template'
   (AssemblyScene.tsx:103-105) is shared by the gate branch, the
   GLBErrorBoundary fallback, the Suspense fallback and the final else — so the
   screen cannot distinguish a gating bug from a 404, a parse failure or a
   still-loading mesh. Give each branch its own label: 'no template' /
   'mesh failed' / 'loading…' / 'no mesh'. This is what would have made this
   bug self-diagnosing.

5. ONE ASSET RESOLVER. useLibraryRegistration.ts:110 builds asset URLs from
   getCoreUrl() while the inspector uses assetsBaseUrl(index.url)
   (libraryIndex.ts:201-205). They agree only by default; override the index
   URL (the :8010 habit) and the GLBs silently point at :8000. Pass
   assetsBaseUrl(libraryIndex.url) into entriesFromIndex.

DO NOT, in this WP, make the exporter emit `template:`. It looks like the
"real" fix and it produces INVALID designs: TemplateSpec.class is a required
enum with no null member (every unbound and workspace entry would violate it),
the 3 generative modules would emit `class: generative` with no generator
script (E_T3_NO_GENERATOR), and `dof:` next to `class: fixed` is E_T1_HAS_DOF.
The pinned test at libraryPalette.test.ts:286-292 ("exports with NO template
block") is deliberate. Export honesty is its own package.

Acceptance: place openuc2.cube.mirror_1x1 in the assembly — the real Inventor
cube renders, upright, filling one 50×50×55 cell inside the 52 mm selection
wireframe. Import setups/demo-bench.dsn.zip — the bundle's cubes render from
their blob URLs (WP-98's donation becomes visible for the first time). A T2
module (openuc2.cube.lens_z) shows its insert handle and DOF fields. Existing
libraryPalette.test.ts:323-325 stays green; add a case asserting a
palette-placed mirror_45 yields a non-null render class while
listPartMechanics still reports null.
```

**For humans:** the cube you attached in Inventor has been in the library the
whole time — the 3D view just had a check in the wrong order and drew a grey
box over it. One reorder and your CAD shows up, along with every other mesh in
the library and every mesh a community `.dsn` brings with it.

---

#### WP-100 — Open the part you actually clicked ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend only)

Right-clicking a part → "open in the component editor" silently opens a BLANK
NEW RECORD whenever the id is not in the published registry — which is every
bundle-imported part, every local draft, and every part at all when the service
is unreachable. Seven navigation sites feed this one handler.

1. RESOLVE LOCAL FIRST. Rewrite the effect at
   src/components/component-editor/ComponentEditorPage.tsx:161-176 as a chain:
     id from the query param; if none or already deepLinked → return
     setDeepLinked(true)                       // BEFORE any branch — see below
     a. useWorkspaceLibrary.getState().records[id] → openRecord(rec,'workspace')
        (synchronous; covers every bundle import (bundleImport.ts:151) and every
        saved draft — and must NOT wait on the index)
     b. bundle YAML: bundleFiles()['library/components/'+id+'/component.yml']
        → recordFromYaml (bundle ENTRIES are palette entries, not records —
        you cannot pass one to openRecord)
     c. if index.loading → defer (gate as today)
     d. registry asset fetch; THROW on !ok
     e. on failure: reconstruct from the index summary, else show an error
   The `setDeepLinked` ordering is load-bearing: it currently sits AFTER the
   `index.loading` gate, so a naive "check workspace and return" lets the
   registry fetch clobber the local record when loading flips. Note also that
   useWorkspaceLibrary.save calls bumpLibraryIndex(), which re-toggles loading
   on every save.

2. NEVER PRESENT A BLANK DRAFT AS THE REQUESTED RECORD. Add `openError` state
   and an <Alert severity="warning"> ABOVE the tabs (not inside the
   `tab === 'index'` branch — that is why LibraryBrowser's own error at
   LibraryBrowser.tsx:193-197 is invisible on the drafts tab). Wording:
   "could not open <id> — not in your workspace drafts and not in the published
   registry (<reason>)".

3. INDEX-SUMMARY FALLBACK. When the asset fetch fails, synthesize a draft from
   `index.components.find(c => c.id === id)` — IndexComponent carries version,
   category, description, vendor, efl_mm, ports, wavelengths_um and
   fragment_surfaces. Label it honestly ("reconstructed from the index summary
   — the full record was not reachable"), because it is lossy. This is what
   makes deep links work offline, where the bundled snapshot has 37 components
   but no component.yml files at all.

4. MESH FOR BUNDLE PARTS. resolveMesh (ComponentEditorPage.tsx:111-147) probes
   IndexedDB then index.modules; a bundle module is in neither, so a
   bundle-imported part opens with meshStatus 'none' even after (1). Add a
   bundle probe: useBundleLibrary entries carry a blob glbUrl and the raw bytes
   are retained under library/templates/<id>/<glb>.

5. DE-DUPLICATE the asset fetch. ComponentEditorPage.tsx:168-170 and
   LibraryBrowser.tsx:126-129 are character-identical URLs with divergent error
   handling (one throws and reports, one swallows). Extract
   `fetchIndexComponent(id, indexUrl)` into src/model/libraryIndex.ts.

6. Pass `initialTab`/`highlightId` to LibraryBrowser so a successful workspace
   deep link also selects the row in the sidebar (it currently defaults to the
   published tab with nothing highlighted).

Acceptance: import setups/demo-bench.dsn.zip, right-click the demo lens →
"open in the component editor" → the editor shows user.lens.demo_achromat_50
with R ±48.27 / t 5.0 / N-BK7 and EFL 47.54, the sidebar on the drafts tab with
that row selected, and NO "editing a copy" banner (it is your own record —
saving updates it in place). An unknown id shows the warning Alert and never a
silent blank. First tests under src/components/component-editor/__tests__/ —
copy the localStorage-stub + top-level-await import pattern from
src/model/dsn/__tests__/bundleImport.test.ts:10-24, which zustand's persist
middleware requires.
```

**For humans:** clicking "open this part" will open that part — from a zip, from
your drafts, or from the registry — and when it genuinely cannot find it, it
will say so instead of quietly handing you a blank form that looks like a
corrupted version of your part.

---

#### WP-101 — A dropped part lands where you dropped it ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend only)

Placement from the palette keeps the full sub-cell residual; the first pointer
move of a drag then zeroes it. Make the ADD path obey the same pose contract as
the MOVE path.

1. src/document/OptikitDocument.ts — build the DsnPart as today (:162-172), then
   constrain it in place before insert:
       part.offsetMm = constrainOffsetToTemplate(part, part.offsetMm);
   No refactor is needed: libraryEntryOf is a plain map lookup and
   worldPoseOfPart is pure, so the existing function works on a not-yet-inserted
   part. (The tempting `constrainOffset(libraryRef, rot24, offsetMm)` helper is
   strictly more code and forces a Matrix4→Quaternion conversion, because
   rotateDocVec takes a quaternion.) A part not yet in the palette falls through
   `if (!lib?.templateClass) return offsetMm` — unchanged behaviour.

2. OPT OUT FOR LOSSLESS IMPORT. `addPart(ref, positionMm, opts?: {exact?: true})`,
   and pass `{exact: true}` from src/model/dsn/session.ts:151. This matters more
   than it looks: `isWildCard` is never set true anywhere in src/, so an unknown
   ref ALWAYS falls back to the first module of its category (session.ts:140),
   which is `fixed` for 27 of 33 — without the opt-out, importing a foreign
   .dsn would silently snap every substituted part to a cell centre.
   Leave addGroup alone (it already feeds exact pitch multiples) and leave
   ImportOptilandDialog alone (its rows are templateClass null, a no-op).

3. SAME BUG, TWO MORE DOORS:
   - "paste here" (SchematicPage.tsx:702, :745) feeds the raw plane hit into
     pastePart with no rounding at all;
   - the inspector's numeric X/Y/Z fields (SchematicPropertyPanel.tsx:195-198)
     call movePartWorld with no opts, so typing "105" into X on a T1 part
     silently snaps back to 100 with no feedback — say so, don't just snap.

4. THE snapGrid TOGGLE LIES. It defaults to false (SchematicPage.tsx:106) and,
   after this fix, does nothing observable for the ~82% of entries that are
   `fixed` — they are pinned to cell centres on every add and every move
   regardless. Relabel it "snap free parts to grid", or hide it when the
   selection is all-T1.

Acceptance: drop a mirror cube anywhere in the schematic — it lands centred in
its cell, and dragging it does not visibly jump. New test beside
src/document/__tests__/dsnDocument.test.ts:64-79: a `class: 'fixed'` fixture,
addPart(FIXED.id, [105, -50, 55]) → cell [2,-1,1], offsetMm [0,0,0], world pose
[100,-50,55]. The existing residual-survives tests use a `class: null` fixture
and must stay green.
```

**For humans:** parts will land on the grid when you place them, instead of
landing crooked and quietly straightening themselves the moment you touch them.

---

#### WP-102 — Publishing to the library must not destroy records ✅ *(done, 2026-08-02)*

```
PROMPT (repos: openUC2-OptiKit + optikit-core)

"Write into ../optikit-core/library" replaces the target file wholesale from a
draft that never read half its fields. This has ALREADY destroyed curated data
in the working tree: openuc2.mirror.flat_45 lost `tags: [mirror, mirror/flat,
mirror/single-sided]` (→ `authored`) and its header comment; other records have
lost `docs`, `review`, `price: 50.0` and `glb-url`, and hand-written
descriptions were replaced by generated ones.

1. MERGE, DO NOT REPLACE — this lands FIRST, before any new write button.
   Keep the opened record's parsed object in ComponentEditorPage state
   (recordFromYaml already produces it) and deep-merge draftToRecord's output
   over it, so unknown top-level keys plus tags/docs/review survive. Stop
   hardcoding `tags: ['authored']` (componentRecord.ts:582) when editing an
   existing record. Do the same in MechanicsPanel: fetch the existing
   template.yml/module.yml via /v1/library/assets/... before devWrite and merge.
   Fix it FRONTEND-side, not in the backend write: app.py:1170 has six other
   callers that legitimately pass fresh records, and a backend merge still
   cannot preserve YAML comments.

2. CONFIRM ON OVERWRITE. Any write whose target already exists shows a dialog
   naming the fields that will change, with a patch-version bump offered.

3. GUARD THE ID. recordId(draft) can drift from openedFrom.id (the draft parses
   the id into namespace/category/name and recomposes it), silently forking a
   vendor record into a new directory. Warn before writing.

4. THE DATUM GATE. Both RECORD PAIR buttons are dead because `bound` is null
   when `store.datums.length === 0` (MechanicsPanel.tsx:189-190) — and opening a
   record CLEARS datums (bindStore.ts:131), as does loading a mesh. Seed datums
   from the opened record's ports on resolveMesh. Do not simply drop the gate:
   `bound` also drives the alerts, the T3 button and pairFiles, and
   bindRecord.ts:407 warns that a zero-datum write publishes a portless
   template. Immediate cheap win: the disabled tooltip currently says "dev fast
   path — on by default when the service runs from a checkout", which is
   actively misleading; make it reason-aware ("author at least one datum
   first").

5. THEN add the optics-tab write button the banner already promises
   (ComponentEditorPage.tsx:244-251 renders above the tabs but the optics tab
   has no such action). ~15 lines: recordToYaml is imported and `yaml` is
   already memoized, so it is saveLibraryRecords([yaml]) + bumpLibraryIndex()
   with MechanicsPanel.devWrite's CoreServiceError handling. Guard it on the
   service being reachable so it does not appear in offline/static builds.

6. optikit-core, security: app.py:1140's `os.environ.setdefault(
   "OPTIKIT_ALLOW_LIBRARY_WRITE", "1")` runs BEFORE the env read, so the
   dev_checkout probe at :1142-1143 is dead code and the docstring at
   :1123-1127 ("container images carry no .git, so deployments stay read-only")
   is false. Combined with DEFAULT_CORS_ORIGINS="*" and no auth, ANY page a
   user visits while the service runs can POST arbitrary YAML into their
   library. Drop the setdefault (let the probe work) and add the missing test:
   no .git + no env var → 403. Also fix DOCS/LIBRARY.md:66-73 and
   DOCS/ARCHITECTURE.md:645-646 (the latter also claims the index endpoint
   serves library/dist/index.json — it builds from the tree).

Acceptance: open a curated record, change one radius, write it — `git diff` in
optikit-core shows ONLY that radius. Writing a record that does not exist yet
still creates the full trio. A no-.git service with no env var refuses the
write with 403.
```

**For humans:** the "publish to the shared library" button currently rewrites
the whole file from what the form knows, which throws away everything the form
does not have a field for. This makes it a real edit instead of a replacement —
and closes a hole where any website you visit could write into your library
while the service is running.

---

### Tier 1 — the mental model

#### WP-103 — Three states, said out loud ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend; optionally a small optikit-core index add)

The backend ships components / housings / modules as three index sections so the
frontend can tell the three states apart. The frontend compresses them into
`templateClass: TemplateClass|null` + `unbound: boolean`, where
`templateClass === null` means THREE different things (bare symbol, workspace
draft, generative). Give the palette a real discriminator and then say it.

1. THE DISCRIMINATOR. On LibraryPaletteEntry, replace the pair with
   `{ mount: 'cube' | 'housed' | 'bare', templateId, templateClass, housingId }`.
   - entriesFromComponents (libraryPalette.ts:445-508) currently hard-codes
     templateClass null and unbound true even when it HAS joined a housing's
     mesh and DOFs — carry housing.class and housing.id instead.
   - entryFromIndexModule (:306-358) carries mod.template.class but not
     mod.template.id — carry it.
   - DELETE AssemblyPage's index-derived `unboundIds` (AssemblyPage.tsx:110-115)
     and read the discriminator off the entry, so workspace drafts, bundle parts
     and index components stop disagreeing about what "bare" means inside one
     file.
   - Extend enrichEntry (useLibraryRegistration.ts:111) to the unbound and
     workspace lists too — the WP-98b hollow-entry repair currently runs on
     registry entries only, so a bare optic never gets its gaps filled.
   Note honestly: only TWO housings exist library-wide today
   (openuc2.tpl.laser_body, thorlabs.tpl.km05_kinematic). The type change is
   right; the visible payoff is in steps 3-4.

2. A PALETTE THAT SORTS BY WHAT YOU CAN BUILD. Replace the flat group select in
   PartLibrary.tsx with a primary segmentation — "Cubes · ready to place" /
   "Housed devices · no cube yet" / "Bare optics · need a holder" — and a badge
   in plain words on the tile ("in a cube" / "needs a holder"), never "UNBOUND".
   Both renderers need it (the grid tile and the WP-91 list row have independent
   chip code). Draw a cube FRAME around the glyph for cube modules: only 2 of 33
   modules have a thumbnail, so the frame is the only thing that makes a cube
   look like a cube.

3. THE CUBE IN THE SCHEMATIC — this answers your sentence verbatim ("in case of
   T1, we should actually have it inside an openUC2 cube"). Add `showMechanics`
   to SchematicSettings and draw the 50 mm envelope for every CUBE part, not
   just `tClass === 'fixed'` (SchematicScene.tsx:366-379): solid for a real
   cube, dashed for T3 ("a cube will be generated here" — never "locked", since
   constrainOffsetToTemplate treats generative and null identically), nothing
   for a bare optic.

4. STOP LYING IN THE FALLBACKS. AssemblyPage.tsx:449 says an unbound part
   "floats freely, claims no grid cell" — false: addPart assigns a cell and
   quick-place counts it as occupied. Say "moves in continuous mm; no cube, no
   T-rule". And resolveMesh must fall back to index.housings so a housed device
   shows its housing — the exact lookup already exists 30 lines away at
   MechanicsPanel.tsx:167.

Acceptance: the palette shows three sections; a T1 cube in the schematic is
visibly inside a cube outline and a bare lens is not; the assembly inspector's
description of an unbound part is true. Tests at libraryPalette.test.ts:198-266
assert `unbound === true` + `templateClass === null` on the joined-housing case
— those assertions encode the exact defect and must be updated, along with
unbind.test.ts and adhocGroup.test.ts, which read entry.unbound.
```

**For humans:** the app knows perfectly well whether a part is a ready-made cube,
a device in its own housing, or a naked lens that still needs a holder — it just
never tells you. This makes that distinction the first thing you see in the
palette and draws the cube around the parts that have one.

---

#### WP-104 — The anatomy view: optic → housing → cube ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend; depends on WP-103's discriminator)

Nothing in the app draws the three-layer anatomy. The closest artefacts are a
read-only three-line text card in the assembly inspector, a one-line collapsed
trio in the schematic inspector, and a toggleable ghost cube in the bind scene.
optikit-core/DOCS/part-anatomy.svg is NOT this drawing (it is record frame vs
placement frame) — its generator script is a style reference only.

Build ONE component, `PartAnatomy`, mounted in three places:
  - the palette hover card,
  - the schematic inspector (replacing the collapsed trio at
    SchematicPropertyPanel.tsx:661-680),
  - the parts editor as a THIRD tab beside "optics (symbol)" and
    "mechanics (housing)" — which is the answer to "when I open a part I would
    see the optical primitive, the way it's inside a housing, inside a cube".

It draws three nested, labelled layers from the palette entry:
  optic    — from fragmentSurfaces (reuse RaySketch) or the category glyph
  housing  — from housingId: its GLB silhouette, or an outline, or greyed out
             with "no housing yet — generate a holder (T3)"
  cube     — the 50×50×55 envelope, or greyed out with "not in a cube yet"
Each layer is labelled with its record id and is CLICKABLE to open that record.
Greyed-out layers are the interesting ones: they are the authoring to-do list,
and clicking them should start it (→ generate a holder, → attach Inventor
files).

Two things to fix while you are in there, both of which block the flow this view
is meant to explain:
  - the T3 button is permanently disabled for sources: it requires
    draft.surfaces.length > 0 (MechanicsPanel.tsx:767) while
    FRAGMENTLESS_CATEGORIES declares source/detector/sample surface-free BY
    DESIGN — so a laser can never take the T3 road, and the tooltip tells you to
    "complete the optics tab first", which is unachievable.
  - LibraryBrowser lists optical components ONLY, so "open the 45° mirror cube"
    is literally impossible — add module and housing tabs (see WP-106).

Acceptance: open openuc2.mirror.flat_45 in the parts editor → the anatomy tab
shows the mirror plate, the cube it lives in, and the module id binding them,
with the housing layer clickable. Open a bare imported Zemax lens → optic solid,
housing and cube greyed with the two "start authoring" actions.
```

**For humans:** one picture, in three places, that answers "what am I actually
looking at" — the glass, the thing that holds the glass, and the cube that holds
that. The greyed-out layers double as the to-do list for finishing the part.

---

#### WP-105 — Where your work lives ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend)

Sixteen localStorage keys, one blind 5-second autosave, four stores that never
persist, and three menu items called "Save" that do not save the document.

1. RENAME FIRST (nearly free, directly attacks the confusion). Toolbar.tsx:575
   "Save Layout As…" → "Export layout JSON…"; :633 "Upload to Setup Browser" →
   "Publish to Setup Browser"; :639 "Save (Overwrite) → …" → "Republish to …".

2. CONFIRM BEFORE REPLACING A NON-EMPTY DOCUMENT — on ALL FIVE entry points, not
   the two that are obvious. Two of them fire SILENTLY ON PAGE LOAD from the
   router root, so they hijack the document on any route including
   /configurator/components: `?layout=<url>` (App.tsx:118-127) and
   `?data=<base64>` (App.tsx:128-140). The others: Toolbar.tsx:344 (a bare
   prompt()), SetupBrowser.tsx:466, CollectionView.tsx:200, plus the .dsn
   import (Toolbar.tsx:153) and share links (SchematicPage.tsx:223).

3. UNDO BRACKETS. The legacy import path (appStore.importData :217,:278 /
   importFromUrl :410,:432) calls documentStore.replaceParts DIRECTLY, bypassing
   the facade — a primitive with no history push, so a legacy import is
   ZERO-undo. The .dsn import is the opposite problem: ~5N steps (each part costs
   addPart + setPartOrientation + renamePart + setDofValue, each autoPushing),
   which blows the 50-step cap. Bracket both in captureUndo()/commitUndo() —
   the reference implementation is ImportOptilandDialog.tsx:115,125.

4. PRUNE THE NETLIST with the parts. clearAll and both legacy imports leave
   optikit-doc-paths and optikit-doc-fibers pointing at parts that no longer
   exist.

5. NEVER LOSE AUTHORING WORK: persist the parts-editor RecordDraft (+ the bind
   transform/datums) under an `optikit-parts-editor-draft` key; key the loaded
   mesh on recordId(draft) rather than on the VALIDATED record, so an STP loaded
   against an incomplete draft is not discarded; warn before a bundle component
   overwrites a same-id workspace draft; call deleteBindMesh from
   workspaceLibrary.remove so meshes are not orphaned.

6. HONEST STATUS: record `savedAt` in persistence.ts:24 and show a "saved
   HH:MM:SS" chip; hook visibilitychange/pagehide alongside beforeunload (which
   does not fire reliably on mobile). Add a small Storage panel enumerating the
   live stores with counts and lifetimes — design parts + last autosave,
   workspace drafts, SESSION bundle modules (marked "lost on reload"), IndexedDB
   meshes, mounted repos, and where the index actually came from (service /
   offline snapshot / custom URL).

7. THEN give the document an identity: id, name, savedAt, remotePath, with
   paths/fibers/source-design/layer-overrides INSIDE that one blob. This must
   absorb the half-identity that already exists — `remoteSourcePath`
   (appStore.ts:79) is in-memory only, so after a reload "Save (Overwrite)"
   silently disappears and the next publish mints a duplicate setup file.
   Keep the `optikit-document/v1` schema check: loadDocumentFromStorage falls
   through to the legacy migration only when the key is ABSENT, so a shape
   change without a version check loses existing users' designs.
   Also fix LibraryBrowser.tsx:260 — the index refresh button calls setUrl with
   an unchanged value instead of bumpLibraryIndex().

Acceptance: the toolbar shows when the design was last saved; every path that
replaces the document asks first; Ctrl-Z after any import is one step; a
Storage panel answers "where is my work" without reading the source.
```

**For humans:** you should never have to wonder whether something was saved.
This labels the things that are exports rather than saves, stops five different
doors from silently replacing your design, persists the work that is currently
thrown away, and puts a "saved at" clock where you can see it.

---

### Tier 2 — ergonomics that compound

#### WP-106 — Parts: a search field, and one way to name things ✅ *(done, 2026-08-02)*

```
PROMPT (repo: openUC2-OptiKit, frontend; optional optikit-core phase 2)

1. SEARCH. LibraryBrowser (the parts-editor list) has exactly two filters —
   tab and categoryFilter — and no text predicate at all. The only TextField in
   the panel is the "library index URL" box in the footer, which is probably why
   it feels like it should already work. Add `query` state, a TextField with a
   SearchIcon adornment between the tab caption (:168-172) and the chip Stack
   (:174), and AND the predicate into both list memos (:135, :139). Reset BOTH
   query and categoryFilter on tab change — categoryFilter currently persists
   across tabs, which is what makes the chip row expand over an empty list.

2. ONE PREDICATE, in a zero-import leaf (src/model/librarySearch.ts — NOT
   libraryPalette.ts, which imports three and zustand and would drag them into
   designData.ts). Normalize [._-] to spaces on BOTH sides, so "flat 45" finds
   flat_45 and "ac254 050" finds ac254-050-a:

     const norm = s => s.toLowerCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
     terms = norm(q).split(' ').filter(Boolean)
     hay   = norm([id, name, description, category, vendorName, mpn, ...tags].filter(Boolean).join(' '))
     return terms.every(t => hay.includes(t))

   Adopt it in PartLibrary.tsx:130 too — the schematic's search matches
   module.name ONLY, so typing "thorlabs" or "AC254" finds nothing there either.
   Vendor/mpn need no backend work (build.py:388 already emits the component's
   vendor into the module entry). SetupBrowser.tsx:605 is a third candidate.

3. LIST WHAT EXISTS. LibraryBrowser lists index optical_components only — not
   modules, not housings, and not the session bundle from an imported .dsn
   (it reads useLibraryIndex + useWorkspaceLibrary directly and never touches
   useLibraryRegistration). Add those sources, or the WP-104 anatomy tab has no
   way to open a cube module.

4. NAMING. Records genuinely have no human name field: RecordBase carries
   id/version/description/tags/docs/thumbnail/review and nothing else. Add ONE
   formatter (src/document/labels.ts) and kill the five copies of shortName
   (libraryPalette.ts:228, bom.ts:44, ModulesPanel.tsx:55, bundleImport.ts:221,
   designData.ts:102). Convention: Title-cased derived name as the primary line,
   the CURATED DESCRIPTION as the secondary (module.yml prose is already good —
   "Band-pass emission filter (510-560 nm) in a 1x1 cube"), then a monospace
   `id · v0.1.0` line.
   DO NOT hide the id anywhere. Derived names genuinely collide in this library:
   openuc2.cube.flat_45 and openuc2.mirror.flat_45 both derive to "flat 45", as
   do laser_488/laser_488nm and mirror_1x1/mirror_45. The mono id is the
   disambiguator; it just should not be the headline.
   Fix the three worst offenders: LibraryBrowser.tsx:70-77,
   ComponentEditorPage.tsx:212, AssemblyPage.tsx:434/474/480/498.
   Leave entry.name byte-identical and Title-case at RENDER time only — it feeds
   the BOM.csv `part` column, which has no test guard.

5. (Optional phase 2) Add `title: str = ""` to RecordBase in optikit-core — NOT
   `name`, which already means three different things (RecordDraft.name is the
   id slug, DesignSpec.name is the setup, VendorSpec.name is the manufacturer).
   Emit it from _component_entries, the module loop, _housing_entries and
   _group_entries. extra="allow" makes it non-breaking, and the formatter above
   already prefers it when present.

Acceptance: typing "mirror", "thorlabs", "525" or "flat 45" in the parts editor
filters the list; the same query works identically in the schematic palette;
every list row reads "Flat 45 Mirror / Flat first-surface mirror mounted at 45° /
openuc2.mirror.flat_45 · v1.0.0".
```

**For humans:** a search box where you keep looking for one, that also matches
vendor names and part numbers — plus rows that lead with a readable name and
keep the exact id underneath, so nothing becomes ambiguous.

---

#### WP-107 — The 45° is visible everywhere it is true

```
PROMPT (repo: openUC2-OptiKit, frontend)

The schematic canvas already tilts a 45° mirror correctly. The parts editor does
not, because the preview never receives the fold angle.

1. GlyphPreview takes only {category, label} and passes NO foldDeg to
   <SchematicGlyph> or <OpticalAxisArrow>, so SchematicGlyph falls back to
   `foldDeg ?? 180` → plateAngle(180) → zero rotation → a disc square to the
   beam, and the arrow draws straight instead of bent. Add a `foldDeg` prop and
   forward it to BOTH.

2. Compute it ONCE. Do not write a second copy of beamAxesOf: extract the pure
   ports→BeamAxes core from schematic/ports.ts:149-165,190-191 (everything but
   the DOF swing, which needs a DocPart) into `beamAxesOfPorts(ports)`, and add
   `foldDegOfDraft(draft)` that maps draft.ports onto it (positions are
   irrelevant to a fold). Fall back to `180 - 2*mirrorAngleDeg` only when a
   mirror draft has no non-entry port — that formula matches derivedReflectedDir
   (45→90, 30→120, 0→180 retro). This makes the preview agree with the canvas by
   CONSTRUCTION, and covers beamsplitter/dichroic/slm too.

3. SIGN BUG, found on the way: the two 2D previews fold OPPOSITE ways today.
   RaySketch passes `angle: +45` while the schematic never sets params.angle for
   a mirror and so uses the engine default −45; since
   `mirrorDir = rotate({1,0}, rotation - angle)`, those are mirror images. The
   correct conversion is `angle = mirrorAngleDeg - 90` (45 → −45; 0 → −90 =
   retro). Also PartOpticsSection.tsx:154 hardcodes mirrorAngleDeg={null}, so a
   placed part's inspector sketch always uses the 45 default — plumb the real
   value (which first requires the index to carry mount_angle_deg; nothing under
   libraryIndex reads it today).

4. THE OPTIC INSIDE THE PSEUDO CUBE. Every optical primitive in the bind scene
   is gated on bindStore.datums, and opening a record clears them — so the cube
   is empty. Give OpticsOverlay a datum-free RENDER-ONLY fallback anchor
   (position from the entry port's frame z-mm, direction from the port) when
   datums is empty; it must NOT enter store.datums, or it starts authoring
   datums into published YAML. Give OpticGlyph a `mountAngleDeg = 0` prop folded
   into the existing normal as (mountAngleDeg + galvoTiltDeg) so the reflection
   law keeps producing the exit arrow and the galvo slider still works as a
   delta. Default 0 is mandatory — users have hand-rotated gizmo-placed optics.

5. STOP SAYING "no STP bound to this record yet" WHEN IT IS FALSE. resolveMesh
   collapses every failure into meshStatus 'none'. Split it into 'none' (no
   module/asset in the index) and 'error' (module found, fetch failed) and
   surface the attempted URL. Related real bug: when useLibraryIndex falls back
   to the bundled offline snapshot it does not rewrite `url`, so
   assetsBaseUrl(index.url) keeps pointing at the dead service — offline, EVERY
   record claims "no STP bound", not just this mirror.

6. AMBIGUOUS HOUSING, worth fixing here: index.modules.find() returns the FIRST
   module referencing the component, and openuc2.mirror.flat_45 currently has
   two with DIFFERENT meshes — so which housing the mechanics tab shows depends
   on index order. Prefer the module whose template matches the record's own
   `mechanics.template`, then fall back to first match. (Today that record names
   a third template neither module uses — see WP-109.)

7. Also: the published 45° record trips its own validator. Its `reflected: +x`
   contradicts derivedReflectedDir(45) = −x, producing a 180° WP-40 warning
   every time it is opened. Decide which is wrong — the port or the hardcoded
   tilt sense — before adding a third consumer of the mount angle.

Acceptance: openuc2.mirror.flat_45 in the parts editor shows a plate tilted 45°
with a bent axis arrow, matching the schematic; the pseudo cube shows the mirror
inside it with no STP loaded; a registry outage says "registry unreachable"
rather than "no STP bound". Extend ports.test.ts with foldDegOfDraft cases
(mirror → 90, retro mirror → 180, lens → null).
```

**For humans:** the parts editor will draw a 45° mirror at 45°, and show the
optic sitting inside the cube even before any CAD is attached — so the symbol,
the sketch and the schematic finally agree with each other.

---

#### WP-108 — "draft" should mean draft

```
PROMPT (repos: openUC2-OptiKit + optikit-core)

One boolean, four producers, four meanings, one label. Split it.

1. TWO INDEPENDENT FACTS on the palette entry and the BOM line:
   - PROVENANCE: 'registry' | 'my draft' | 'from this bundle' — where the record
     came from (the entry already knows: source is 'registry'|'workspace'|
     'bundle').
   - REVIEW: the record's own review notes, with a count and a tooltip listing
     them. This is the WP-97 hook: once notes are structured, badge only
     blocker/verify.
   Render provenance as the chip; render review as a small ⚠ with the note text.
   A curated, priced, shipping part must NOT read "draft".

2. bundleImport.ts:244 hardcodes `review: true` ("a bundle part is a draft by
   definition") — drop it; the record's own review list is the truth, and
   provenance now carries "from this bundle".

3. optikit-core data cleanup: 18 of 36 curated modules badge today, and 8 of
   them have a CLEAN module.yml — they inherit the flag from their component or
   template record, because build.py:384-385 ORs the trio. Sweep
   library/{modules,components,templates}/*/*.yml for the WP-43 note
   "auto-migrated from the legacy CSV palette — confirm the record" and either
   confirm the record or keep the note deliberately. Clearing only the 10
   module-level notes leaves 8 parts badged and looks like the fix failed.

4. While in the BOM: camera_basic and the demo lens are unpriced because their
   module.yml has no `price:` — that is honest, but the BOM should say
   "unpriced" per line and total only what it knows (it does; keep it).

Acceptance: the demo-bench BOM reads "laser 488nm · registry · €650",
"camera basic · registry · unpriced", "demo lens 50 · from this bundle ·
unpriced", with review warnings only where a record actually carries an
unresolved note.
```

**For humans:** the badge that says "draft" on a shipping €650 laser is really
saying "somebody left a to-do note on this record in 2025". Two separate labels:
where the part came from, and whether anything about it is still unconfirmed.

---

#### WP-109 — One mirror cube, not three (optikit-core library hygiene) ✅ *(done, 2026-08-02)*

```
PROMPT (repo: optikit-core, library data only)

The bind/attach flow left the mirror family in three overlapping copies, plus
collateral damage. Curate it by hand — do NOT re-run the bind flow, and do not
press "write into library" again until WP-102's merge lands.

Current state (all uncommitted):
  openuc2.mirror.flat_45      component  — MODIFIED: curated tags replaced by
                                            [authored], header comment dropped,
                                            mechanics.template added pointing at
                                            a template neither module uses
  openuc2.mirror.mirror_1x1   component  — MODIFIED (a WP-43 CSV duplicate)
  openuc2.tpl.mirror_mount_1x1 template  — the ORIGINAL: a 25×25×3 mm placeholder
                                            plate, has model.step, declares
                                            frames.optical and states [XY, YZ]
  openuc2.tpl.mirror_1x1      template   — NEW: holds the real Inventor GLB
  openuc2.tpl.flat_45         template   — NEW: a byte-identical COPY of it
  openuc2.cube.{mirror_45, mirror_1x1, flat_45}  — three modules over two meshes

1. Restore the curated component records (git checkout the two component.yml
   files) — scope any revert to library/, the tree also holds the unrelated
   E_EMPTY_SYSTEM change in src/ and tests/.
2. Keep ONE curated module. Recommended: openuc2.cube.mirror_45 (the id docs and
   setups already reference) repointed at the whole-cube template. Archive
   rather than rm the duplicates — saved designs and .dsn files reference module
   ids by libraryRef, and there is an archive/ + restore path for exactly this.
3. Fix the surviving template.yml BY HAND:
     step:        DELETE — it currently names the .glb, so the index serves
                  gltf-binary bytes under assets.step (verified live)
     mesh-offset: DELETE — zero readers in either repo
     optical_ports: replace the bind-flow junk port
                  `out: {frame: out, direction: [0.707, 0, -0.707]}` with
                  `front: {frame: optical, direction: -z}`
     provenance:  whole-module   (the mesh IS the cube, not an insert)
     frames:      {optical: {z-mm: 0.0}}  — silences verify-t1's
                  W_NO_INSERT_FRAME, which currently makes its "OK" vacuous
     envelope:    the mesh measures 49.8 × 49.8 × 54.4 mm, so the 55 axis is
                  real; check which local axis carries it before writing 50/50/55
   The GLB itself is GOOD and needs no rotation: glTF v2, 347 548 B, generator
   "Open CASCADE Technology 8.0", root node `__mm_scale__` scale [1000,1000,1000]
   (raw vertices are metres → mm after node transforms), world bbox
   49.8 × 49.8 × 54.4 mm centred EXACTLY at the origin. Cube-centre origin, so
   leave glbOffset unset. The degree sign in the filename is fine on the wire
   (200 / model/gltf-binary for both raw and percent-encoded); rename to ASCII
   only as insurance.
4. NEW `library validate` CHECK, which is the durable fix: the library holds TWO
   undeclared mesh conventions. Five older GLBs (mirror_mount_1x1,
   camera_mount_1x1, laser_pointer_1x1, laser_body, puzzle_1x1) ship a literal
   Rx(−90°) wrapper node that performs the document→three basis change INSIDE
   the glTF; the two OCCT exports (cublend12_7f40 and this mirror) do not.
   Nothing in the schema distinguishes them and nothing in the renderer asks.
   Do NOT add a `mesh-frame` field and a conditional rotation — add a validator:
   for a template with a footprint_grid, assert the mesh's world bbox carries
   the ~55 mm extent on the expected axis, and fail loudly otherwise.
5. Then: `library validate`, `library verify-t1 openuc2.cube.mirror_45`,
   `library build` (the only writer; dist/index.json is stale since Jul 27, so
   review that diff), commit.

SEPARATE, verified while investigating: openuc2.cube.cublend12_7f40 is probably
rendering TIPPED today for an unrelated reason — its ports are front −z / back
+z (no fold), so defaultRotationFor takes the minimal-rotation branch and leaves
the mesh's long axis horizontal. For a template with a footprint_grid, prefer
the roll that maps local +y onto document +z. Check puzzle_1x1 before shipping.

Also fix the generator so this does not recur: bindRecord.ts:444 hardcodes a
50/50/50 envelope (derive it from the mesh bbox), :446 writes `step:` for any
dropped file including a .glb, :448 writes a mesh-offset nothing reads.
```

**For humans:** the mirror cube exists three times in the library right now, one
copy points its "STEP file" at a GLB, and the write that created them clobbered
the curated tags on the original mirror. This tidies it to one part and adds a
check so the next Inventor export is validated instead of trusted.

---

## 3. Build order

```
WP-99  ✅ (assembly draws meshes)   ──┐  all four are independent;
WP-100 ✅ (deep link opens the part)──┤  99 first, because judging any of
WP-101 ✅ (drop lands on grid)      ──┤  the rest is impossible while the
WP-102 ✅ (non-destructive publish) ──┘  3D view is drawing ghost boxes
        │
        └─► WP-109 ✅ (library hygiene — needed 102's merge to be safe)
                │
                └─► WP-103 ✅ (three states) ─► WP-104 ✅ (anatomy view)
                        │
                        └─► WP-105 ✅ (where work lives)
                                │
                                └─► WP-106 ✅, WP-107, WP-108 (any order)
```

Tier 0 is four contained changes — two of them under ten lines — and it converts
"the platform is confusing" into "the platform is honest but sparse", which is
the precondition for the Tier 1 model work being worth doing.

## 4. What this round deliberately does not do

- **Export `template:` in the `.dsn`.** It is the tempting fix for WP-99 and it
  produces schema-invalid designs today (required `class` enum, T3 generators,
  E_T1_HAS_DOF). Making the wire format carry mechanics honestly is its own
  package, and it must land with the core-side checks.
- **A `mesh-frame` record field.** Two mesh conventions exist in the library, but
  the fix is a validator that rejects the ambiguity, not a flag that
  institutionalises it (WP-109.4).
- **Hiding record ids behind display names.** Derived names collide in the real
  library; the id stays on every row (WP-106.4).
- **WP-97 (review lifecycle)** stays proposed — but WP-108 is its data-model
  prerequisite and should land first.

Great answers. Let me lock the model first, then break the work into PRs sized for Claude Code.
Locked decisions

Up axis: three.js default — Y is up, Z is the optical axis, X is the other in-plane direction. (You said "we sandwich multiple layers with a 50mm plate to stack them in y" — so layers stack along Y, not Z. I'll use that.)
Grid spacing: 50 mm in X and Z (in-plane), 55 mm in Y (50 mm cube + 5 mm baseplate). One layer = y = layer * 55. Cube center is at y = layer*55 + 25, optical axis passes through that center.
Mapping store → world: worldX = position.x * 50, worldZ = position.y * 50, worldY = layer * 55. (position.y from the 2D grid maps to three's Z because the 2D top-down view becomes the XZ plane.)
Rotations: both discrete, snapped to 0/90/180/270°.

rotation (existing): rotation around Y (yaw) — how the cube is placed on the grid.
topRotation (new): rotation around Z (the optical axis) — flips a lens module between "axis along Z" and "axis along Y" etc. Single GLB; this rotation just rotates the whole GLB about Z. No glbTopUrl.


GLB repo: openUC2/openUC2-OptiKit-GLBStore, served via https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/....

GLB repo structure
openUC2-OptiKit-GLBStore/
├── README.md
├── manifest.json              ← optional registry (id → glb path, version, hash)
├── LICENSE
├── models/
│   ├── mirror/
│   │   ├── mirror.glb
│   │   └── mirror.thumb.png
│   ├── camera/
│   │   ├── camera.glb
│   │   └── camera.thumb.png
│   ├── lens-f50/
│   │   └── lens-f50.glb
│   └── empty-cube/
│       └── empty-cube.glb
└── conventions.md             ← authoring rules (see below)
Authoring conventions (put in conventions.md, this matters more than the folder layout):

Units: millimetres, exported with unit = mm so three loads them 1:1.
Origin: center of the cube's bottom face (i.e. on top of the baseplate, at the cube's XZ center). That way position.set(x, layer*55 + 5, z) places it correctly with the 5 mm baseplate accounted for. The baseplate itself is part of the GLB.
Default orientation: optical axis along +Z, "up" along +Y. rotation = 0, topRotation = 0 should look correct without any offset.
Bounds: model must fit inside 50×55×50 mm (xyz), baseplate included.
One GLB per module. Embed textures (.glb, not .gltf + bin + textures).
Keep tris reasonable (a few k per cube; instancing handles repetition).

Module CSV gets one new optional column: glbUrl (relative path inside the GLB repo, e.g. models/mirror/mirror.glb). The loader prefixes it with the raw GitHub base, mirroring how cadUrl works today.

PR breakdown for Claude Code
Six PRs. Each is independently reviewable and shippable. PRs 1–2 add no UI; PR 3 puts pixels on screen; PRs 4–5 add interaction; PR 6 is rays.
I'll write each one as an instruction block you can paste straight into Claude Code as a task brief.

PR 1 — Data model & constants (no UI changes)
Goal: extend the schema for 3D without touching any rendering. After this PR, the 2D app behaves identically; the store just carries new optional fields.
Tasks for Claude Code:

Create src/constants/grid.ts:

ts   export const GRID_MM = { x: 50, z: 50, yLayer: 55, baseplate: 5, cube: 50 } as const;
   export const ROTATION_STEP = 90;

In src/types/index.ts:

Add topRotation?: number; to PlacedModule (degrees, snapped to 0/90/180/270, default 0).
Add glbUrl?: string; and glbOffset?: [number, number, number]; to ModuleDefinition.
Add t?: number; to CompactModule for top rotation in compact export (omit when 0).


In src/stores/appStore.ts:

Add action rotateModuleTop(moduleId: string, topRotation: number): void mirroring rotateModule. Snap to nearest 90°.
Update updateModule-style code paths so topRotation is preserved on move/clone/import.
Update compact export/import (m → t) so topRotation round-trips.


In src/utils/moduleLoader.ts:

Parse new optional CSV columns glbUrl, glbOffsetX, glbOffsetY, glbOffsetZ.
Add a addGLBStorePrefix helper analogous to addConfiguratorPrefix, with base https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/. Apply it to glbUrl if it's a relative path.


Do not modify any component. Verify build passes and existing CSVs still load (new fields are all optional).

Acceptance: npm run build clean; existing setups import/export with no diffs; topRotation is preserved through save/load/undo/redo.

PR 2 — Coordinate helpers + GLB infrastructure (still no UI)
Goal: centralise the store↔world conversion and add a typed GLB loader/cache. Still no visible change.
Tasks for Claude Code:

npm i three @react-three/fiber @react-three/drei and npm i -D @types/three.
Create src/three/coords.ts:

ts   import { GRID_MM } from '../constants/grid';
   import type { PlacedModule } from '../types';

   export function moduleWorldPosition(m: PlacedModule): [number, number, number] {
     // Cube origin = center of bottom face, sitting on top of baseplate
     return [
       m.position.x * GRID_MM.x,
       m.layer * GRID_MM.yLayer + GRID_MM.baseplate,
       m.position.y * GRID_MM.z,
     ];
   }
   export function snapGridXZ(worldX: number, worldZ: number) {
     return {
       x: Math.round(worldX / GRID_MM.x),
       y: Math.round(worldZ / GRID_MM.z), // store-space y, three-space z
     };
   }
   export function snapLayerY(worldY: number) {
     return Math.max(0, Math.round((worldY - GRID_MM.baseplate) / GRID_MM.yLayer));
   }
   export function snapRotation(deg: number) {
     return ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
   }

Create src/three/useModuleGLB.ts:

Wraps drei's useGLTF.
Given a ModuleDefinition, returns the cloned scene (use SkeletonUtils.clone or scene.clone(true) to avoid sharing transforms).
Exports preloadModuleGLB(def) calling useGLTF.preload(def.glbUrl).
Returns a fallback placeholder mesh (50×50×50 wireframe box) when glbUrl is missing or fails to load — never throw.


Create src/three/index.ts re-exporting the above. No components yet.
Add a unit test (or simple console.assert in a new src/three/__tests__/coords.test.ts if you don't have a test runner — otherwise just a manual check script): assert that a module at position {x:2,y:3}, layer:1 maps to [100, 60, 150].

Acceptance: build clean; bundle size of 2D route unchanged (the new code isn't imported anywhere yet).

PR 3 — Read-only 3D view at /3d
Goal: new route that renders the current setup in 3D. No editing yet — just look.
Tasks for Claude Code:

Create src/three/Scene3D.tsx:

<Canvas camera={{ position: [300, 300, 300], near: 1, far: 5000, fov: 45 }}>
Lighting: <ambientLight intensity={0.6} />, one <directionalLight> from above.
<OrbitControls makeDefault /> from drei.
drei <Grid args={[2000, 2000]} cellSize={50} sectionSize={250} infiniteGrid fadeDistance={1500} /> on the XZ plane (Y=0).
<Suspense fallback={null}> wrapping the cubes.


Create src/three/Cubes.tsx:

const { placedModules, modules } = useAppStore(...).
Maps each PlacedModule to <CubeInstance key={m.id} module={m} />.


Create src/three/CubeInstance.tsx:

Resolves ModuleDefinition by moduleId.
Calls useModuleGLB(def).
Structure:



tsx     <group position={moduleWorldPosition(m)} rotation={[0, THREE.MathUtils.degToRad(-m.rotation), 0]}>
       <group rotation={[0, 0, THREE.MathUtils.degToRad(m.topRotation ?? 0)]}>
         <primitive object={gltfScene} />
       </group>
     </group>

Apply def.glbOffset if present as a translation on the inner group.


Create src/components/Editor3DPage.tsx: a thin route component that mounts <Layout> (reuse existing) with <Scene3D /> as the main content and the existing <PropertyPanel> on the right (read-only is fine for this PR).
In src/App.tsx: add <Route path="/3d" element={<Editor3DPage />} />. Lazy-load via React.lazy so the 2D bundle isn't affected. Add a "View in 3D" button in the existing Toolbar.tsx that links to /3d. Add a "Back to 2D" button in Editor3DPage.
Add 3 placeholder GLBs for testing in public/dev-glbs/ (a coloured 50×50×50 box for "mirror", "camera", "empty"). Wire one CSV row to point to each so the 3D view has something to show without depending on the external repo being populated. Document in the PR description that these are dev-only and should be removed once the GLB store is live.

Acceptance: Place a few modules in 2D, click "View in 3D", see them at the correct positions/rotations on a grid. Pan/zoom/orbit works. No console errors when a module has no glbUrl (placeholder box renders).

PR 4 — Selection + metadata HUD in 3D
Goal: click a cube to select it; show a floating metadata card; the existing PropertyPanel reflects the selection (and vice versa).
Tasks for Claude Code:

In CubeInstance.tsx:

Add onClick={(e) => { e.stopPropagation(); selectItem(m.id, 'module'); }} on the outer group.
Add onPointerOver / onPointerOut to set a hover state and change cursor.
When selectedItemId === m.id, wrap the GLB in drei's <Outlines thickness={3} color="#FFAA00" /> (or <Edges> if Outlines is overkill).


In Scene3D.tsx: add a click-on-empty-space handler (onPointerMissed on Canvas) that clears the selection.
Create src/three/SelectionHUD.tsx:

Reads the selected module from the store.
Renders a drei <Html position={[...above the cube...]} center distanceFactor={400}> containing a small MUI Card with: name, layer, rotation, topRotation, brief description.


In Editor3DPage.tsx: keep the existing <PropertyPanel> mounted on the right — it already binds to selectedItemId, so editing rotation there should update the 3D view live (zustand subscription).
Verify cross-view sync: select a module in 3D → switch to /editor (2D) → it's still selected.

Acceptance: Click cube → highlighted + HUD appears + PropertyPanel populated. Click empty space → deselected. Editing rotation in PropertyPanel rotates the cube in 3D in real time.

PR 5 — Drag, rotate, top-rotate in 3D
Goal: full editing parity with 2D for placement and rotation.
Tasks for Claude Code:

Add a small toolbar overlay in Scene3D.tsx (absolutely-positioned MUI ToggleButtonGroup) with modes: Translate XZ, Translate Y (layer), Rotate base, Rotate top.
Add src/three/CubeGizmo.tsx:

Reads selection. If none, renders nothing.
Renders drei's <TransformControls> attached to a ref on the selected cube.
Mode-dependent config:

Translate XZ: mode="translate" showY={false}. On objectChange, snap to 50 mm grid via snapGridXZ, call moveModule(id, snapped).
Translate Y: mode="translate" showX={false} showZ={false}. Snap to 55 mm steps via snapLayerY, call a new moveModuleToLayer(id, layer) action (add this to the store if it doesn't exist; thin wrapper around setting layer).
Rotate base: mode="rotate" showX={false} showZ={false}. Snap result to 90° via snapRotation, call rotateModule(id, deg).
Rotate top: mode="rotate" showX={false} showY={false}. Snap to 90°, call rotateModuleTop(id, deg).




While a TransformControls is being dragged, disable OrbitControls (controls.enabled = !dragging). drei's TransformControls fires dragging-changed.
Keyboard shortcuts in Editor3DPage: G translate XZ, Y translate Y, R rotate base, T rotate top, Esc deselect, Delete removes module.
Collision check: before committing a translate, check the target cell isn't occupied on that layer (the store already has this check for 2D placements — reuse it). If blocked, snap back and flash the cube red briefly.

Acceptance: Drag a cube to a new cell — snaps cleanly, persists, undo/redo works. Rotate base in 90° steps. Rotate top independently around Z. Cannot drop on an occupied cell. Switching back to 2D shows the new positions.

PR 6 — Rays in 3D (optional, ship after the rest is solid)
Goal: visualise the existing 2D simulation output in 3D. No new physics.
Tasks for Claude Code:

Subscribe Scene3D to simulationStore to get the latest RayPath[].
Create src/three/Rays3D.tsx:

For each RaySegment in each path, compute 3D endpoints:



ts     const y = segment.layer * GRID_MM.yLayer + GRID_MM.baseplate + GRID_MM.cube / 2; // optical axis at cube center
     const start: [number, number, number] = [seg.x1, y, seg.y1];
     const end:   [number, number, number] = [seg.x2, y, seg.y2];
 (Note: `seg.x/y` from the 2D engine are already in mm if `cellSize` is mm-based; otherwise multiply. Verify against `SimulationEngine.ts`.)

Render each segment with drei's <Line points={[start, end]} lineWidth={2} color={wavelengthToRGB(seg.wavelength)} />.


Add a toggle "Show rays" in the 3D toolbar bound to simulationStore.isVisible (or a local 3D-only flag).
Performance: if total segment count > 5000, switch to a single THREE.LineSegments with a flat Float32Array of vertices instead of N <Line> components.
Defer inter-layer (vertical) rays. Add a TODO note: extending SimulationEngine to emit Y-direction segments when a fold mirror is present is a separate PR — needs a small physics change, not just rendering.

Acceptance: Run simulation in 2D, switch to 3D, see the same rays drawn at the correct optical-axis height for each layer. Toggle works. Frame rate stays >30 fps with a typical setup.

Order, parallelism, and rollback

Land PR 1 and PR 2 first; they're invisible and low-risk. After PR 2 you can pause indefinitely without leaving anything half-built.
PR 3 is the first user-visible change. Behind a route, so trivially revertable (delete the route registration).
PRs 4–5 depend on PR 3 but are independent of each other in structure — though I'd land 4 before 5 because selection is needed to drive the gizmo target.
PR 6 is fully optional and depends only on PR 3.

Things to validate as you go

Bundle size of the 2D route should not grow after PR 1–2. After PR 3, it should only grow when the user navigates to /3d (verify with vite build --report or just check that three ends up in a separate chunk).
GLB cache: navigating away from /3d and back shouldn't re-fetch GLBs. drei's useGLTF handles this, but worth confirming in DevTools Network tab.
Coordinate sanity check after PR 3: place one module at grid (0,0) layer 0 — its center should be at world (0, 30, 0) (5 mm baseplate + 25 mm to cube center). Eyeball with a small axes helper in dev mode.

Want me to write out the actual code for PR 1 now, or refine anything in the plan first?
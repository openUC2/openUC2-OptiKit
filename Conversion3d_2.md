Now I have a complete picture. Let me write the PR plan.This is a conversational deliverable, not a document — I'll respond inline.

---

# Current state assessment

Here's what I found scanning the codebase:

**What's working well:** The 3D infrastructure is solid — `CubeInstance`, `CubeGizmo`, `SelectionHUD`, `Rays3D`, coordinate helpers, and the `Editor3DPage` route at `/configurator/3d` are all in place. The zustand store properly persists to `localStorage` and the 3D page reads from it.

**Root causes of your issues:**

1. **"State resets every time you open it"** — This is a red herring. The state *doesn't* reset; the zustand store persists via `localStorage` and the 3D page reads the same `placedModules`. However, `loadModules()` (the CSV module definitions) is only called in `App.tsx`'s root `useEffect`, which fires on initial mount. When you navigate to `/3d`, modules are already loaded. But if you *directly* navigate to `/configurator/3d` (e.g. refreshing the page there), the `loadModules()` call runs but `loadStateFromStorage()` might race. The 3D page also doesn't call `loadStateFromStorage` itself — it trusts the root. The real perceived "reset" is likely: the camera position resets to `[300,300,300]` every time you navigate because it's hardcoded in the `<Canvas>` prop and there's no camera state persistence.

2. **"Not user-friendly with the mouse"** — `OrbitControls` defaults are tuned for model viewers (slow rotation, no damping, no limits). There's no zoom-to-fit, no focus-on-selection, no right-click-to-pan convention matching the 2D view's scroll-to-zoom + drag-to-pan. The 3D toolbar is only for gizmo modes — there's no dedicated navigation toolbar.

3. **"Rays are just 2D overlay"** — Correct. `Rays3D.tsx` takes 2D `RaySegment` data (SimPoint x,y in mm) and places it flat at `opticalAxisY(layer)`. The simulation engine itself is entirely 2D and layer-unaware (`SimulationEngine.ts` has zero mentions of "layer"). The `buildScene` function in `sceneBuilder.ts` converts *all* placed modules from *all layers* into a single flat 2D simulation space, so rays from layer 0 and layer 1 modules get mixed into the same 2D plane and then lifted to an arbitrary Y height per source.

4. **"Dark lighting/background"** — `ambientLight intensity={0.6}` and one `directionalLight intensity={0.8}` is indeed dim for an optics configurator. Background is `#1a1a2e` (very dark navy) hardcoded on the container `Box`.

5. **"Fallback for missing GLB"** — Currently renders a grey wireframe box via `FallbackBox` in `CubeInstance.tsx` and `makeFallbackScene()` in `useModuleGLB.ts`. You want a proper default GLB instead.

**Other issues found:**

- The `useModuleGLB.ts` hook has a rules-of-hooks violation (conditional `useGLTF` call with try/catch, early return before a hook). It works by accident but will break with React strict mode or future React versions. `CubeInstance.tsx` doesn't even use this hook — it calls `useGLTF` directly via the `GLBScene` sub-component, making `useModuleGLB.ts` dead code.
- The simulation is *not* layer-aware at all. `buildScene` flattens everything to 2D regardless of layer. This means the 3D ray rendering is fundamentally wrong for multi-layer setups: modules on different layers will have rays interacting as if coplanar.
- `BOMPanel.tsx` has a TODO: `mailto should reach sales@openuc2.com`.
- No error boundary around GLB loading — a 404 on a GLB URL will crash the entire 3D view.

---

# PR plan — Round 2

Seven PRs, ordered by dependencies. Each is a self-contained task brief for Claude Code.

---

## PR 7 — Light theme, dark theme, and brighter defaults

**Goal:** Make the 3D view significantly brighter by default, and add a light/dark mode toggle. The light mode should feel like a clean CAD workspace.

**Tasks for Claude Code:**

1. In `Scene3D.tsx`, increase ambient light to `intensity={1.0}` and the directional to `intensity={1.2}`. Add a second directional light from the opposite side (`position={[-200, 300, -200]}`, `intensity={0.4}`) to fill shadows.

2. Add a `hemisphere light` for ambient fill: `<hemisphereLight args={['#ffffff', '#b0b0b0', 0.6]} />`. This gives a subtle sky-to-ground gradient that makes cubes look more natural.

3. Create a `use3DSettings` hook in `src/three/use3DSettings.ts` backed by `localStorage` key `openuc2-3d-settings`. Store:
   ```ts
   interface Settings3D {
     theme: 'light' | 'dark';
     showGrid: boolean;
     showAxes: boolean;
   }
   ```
   Default to `theme: 'light'`, `showGrid: true`, `showAxes: true`. Use a simple `useState` + `useEffect` for persistence — no need for zustand.

4. Define theme palettes in the same file:
   ```ts
   export const THEMES_3D = {
     light: { background: '#f0f2f5', gridColor: '#cccccc', sectionColor: '#999999', fogColor: '#f0f2f5' },
     dark:  { background: '#1a1a2e', gridColor: '#333355', sectionColor: '#555577', fogColor: '#1a1a2e' },
   } as const;
   ```

5. In `Scene3D.tsx`:
   - Set `<Canvas ... gl={{ alpha: false }} scene={{ background: new THREE.Color(theme.background) }}>`.
   - Pass theme colors to `<Grid cellColor={theme.gridColor} sectionColor={theme.sectionColor} />`.
   - Optionally add `<fog attach="fog" args={[theme.fogColor, 800, 2000]} />` for depth cueing.

6. In `Editor3DPage.tsx`, add a small settings button group in the top bar:
   - Light/Dark toggle (use `LightMode` / `DarkMode` MUI icons).
   - Grid visibility toggle.
   - Axes helper toggle (`<axesHelper args={[100]} />` in Scene3D, conditional on `showAxes`).

7. In `Editor3DPage.tsx`, change the container `bgcolor` from hardcoded `#1a1a2e` to `theme.background`. Also update the bottom toolbar and SelectionHUD to adapt: in light mode use a white/light-grey backdrop, in dark mode keep the current dark glass.

**Acceptance:** Default appearance is bright and clean. Toggle works and persists across reloads. Grid and axes can be toggled. Both themes look polished — no jarring contrast mismatches.

---

## PR 8 — Camera controls, navigation toolbar, and zoom-to-fit

**Goal:** Make 3D navigation intuitive. Add a navigation toolbar with preset views, zoom-to-fit, and tuned OrbitControls. Persist camera state so it doesn't reset on re-entry.

**Tasks for Claude Code:**

1. In `Scene3D.tsx`, configure `<OrbitControls>` with better defaults:
   ```tsx
   <OrbitControls
     makeDefault
     enabled={orbitEnabled}
     enableDamping
     dampingFactor={0.12}
     minDistance={30}
     maxDistance={3000}
     maxPolarAngle={Math.PI * 0.85}
     mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
   />
   ```
   This matches CAD conventions: left-drag rotates, right-drag pans, scroll zooms, with inertia.

2. Create `src/three/useCameraState.ts`: a hook that saves camera position + target to `sessionStorage` (not `localStorage` — it should reset across browser sessions but survive within-session navigation):
   - On mount, if saved state exists, restore it.
   - On `OrbitControls`' `change` event (debounced 500ms), save `{ position: [x,y,z], target: [x,y,z] }`.
   - Expose a `resetCamera()` function that goes to the default `[300, 300, 300]` looking at scene center.

3. Create `src/three/cameraUtils.ts` with a `zoomToFit(camera, controls, placedModules)` function:
   - Compute a bounding box from all placed modules' world positions (using `moduleWorldPosition`), expanded by 50 mm padding on each side.
   - If no modules, use a default 500×500 area.
   - Compute the required camera distance to fit the box in the current FOV.
   - Animate the camera to the computed position using a simple `requestAnimationFrame` lerp (or drei's `CameraControls` if you swap to it — see note below).
   - Center the orbit target on the bounding box center.

4. Create `src/three/NavToolbar.tsx` — a vertical toolbar on the left side of the 3D canvas (absolute positioned):
   - **Zoom to fit** (icon: `ZoomOutMap`): calls `zoomToFit`.
   - **Focus selected** (icon: `CenterFocusStrong`): if a module is selected, animate camera to frame it with ~200 mm radius. Disabled when nothing selected.
   - Separator.
   - **Top view** (icon: `ArrowDownward`): camera at `[centerX, 500, centerZ]` looking down. This gives the familiar 2D-like top-down perspective.
   - **Front view** (icon: `Visibility`): camera at `[centerX, centerY, 500]` looking toward origin.
   - **Isometric** (icon: `ThreeDRotation`): camera at `[300, 300, 300]`.
   - Separator.
   - **Zoom +** / **Zoom −** buttons for users who want to click instead of scroll.

5. For camera animation: use a simple `useFrame`-based tween. Store a `targetCameraPos` and `targetLookAt` in a ref; when set, each frame lerps `camera.position` and `controls.target` by a factor of 0.1, then clears when close enough. This avoids adding a tween library.

6. In `Editor3DPage.tsx`, mount `<NavToolbar />` inside the canvas container with `position: absolute; left: 16; top: 50%; transform: translateY(-50%)`.

**Acceptance:** Right-click-drag pans. Scroll zooms smoothly with damping. "Zoom to fit" frames all modules. "Top view" gives a 2D-like perspective. Camera position is preserved when switching 2D↔3D within the same browser session. Preset views animate smoothly (no teleport).

---

## PR 9 — Default fallback GLB and error boundary

**Goal:** When a module has no `glbUrl` or the URL 404s, show a proper default cube GLB instead of a wireframe box. Wrap GLB loading in an error boundary so a bad URL doesn't crash the whole scene.

**Tasks for Claude Code:**

1. Create a default cube GLB using three.js at build time — or simpler, create a static fallback mesh procedurally. Actually, the cleanest approach: **ship a tiny default GLB in the repo**. Create a Node script `scripts/generate-default-glb.mjs`:
   ```js
   import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three';
   import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
   // Create a 50×50×50 box, slightly rounded edges, subtle grey with the openUC2 green tint
   // Export to public/default-cube.glb
   ```
   Alternatively, if generating at build-time is complex, create the fallback as a procedural mesh in code (not wireframe — use a proper `MeshStandardMaterial` with edges):

2. Update `CubeInstance.tsx`:
   - Replace `FallbackBox` with `DefaultCube` — a proper 3D mesh:
     ```tsx
     function DefaultCube({ offset }: { offset?: [number, number, number] }) {
       return (
         <group position={offset}>
           <mesh>
             <boxGeometry args={[48, 48, 48]} />
             <meshStandardMaterial color="#b0b0b0" roughness={0.7} metalness={0.1} transparent opacity={0.85} />
           </mesh>
           <lineSegments>
             <edgesGeometry args={[new THREE.BoxGeometry(48, 48, 48)]} />
             <lineBasicMaterial color="#888888" />
           </lineSegments>
         </group>
       );
     }
     ```
   - This gives a solid, semi-transparent grey cube with visible edges — clearly a placeholder but not ugly.

3. Create `src/three/GLBErrorBoundary.tsx`:
   ```tsx
   class GLBErrorBoundary extends React.Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
     state = { hasError: false };
     static getDerivedStateFromError() { return { hasError: true }; }
     componentDidCatch(err: Error) { console.warn('GLB load failed:', err.message); }
     render() { return this.state.hasError ? this.props.fallback : this.props.children; }
   }
   ```

4. In `CubeInstance.tsx`, wrap `<GLBScene>` in the error boundary:
   ```tsx
   <GLBErrorBoundary fallback={<DefaultCube offset={offset} />}>
     <Suspense fallback={<DefaultCube offset={offset} />}>
       <GLBScene url={def.glbUrl} offset={offset} />
     </Suspense>
   </GLBErrorBoundary>
   ```

5. Delete `useModuleGLB.ts` — it's dead code. `CubeInstance.tsx` doesn't use it, and it has rules-of-hooks violations. Remove its export from `src/three/index.ts`.

6. Add a constant `DEFAULT_GLB_URL` to `src/constants/grid.ts` pointing to `https://raw.githubusercontent.com/openUC2/openUC2-OptiKit-GLBStore/main/models/default/default-cube.glb`. Document in `conventions.md` (the GLB repo) that this file should exist. For now, the procedural `DefaultCube` handles the case where even this URL fails.

**Acceptance:** Modules with no `glbUrl` show a clean grey cube, not a wireframe. A 404'd URL shows the same fallback after a brief loading state. No console errors crash the 3D view. `useModuleGLB.ts` is removed.

---

## PR 10 — Layer-aware simulation for 3D rays

**Goal:** Make the ray tracing layer-aware so that rays in 3D are *correctly* placed per-layer rather than projected flat from a single 2D simulation. This doesn't add new physics — it runs the existing 2D engine *per layer* and maps each result to the right Y height.

**Tasks for Claude Code:**

1. In `src/utils/sceneBuilder.ts`, modify `buildScene` to accept an optional `layer` filter:
   ```ts
   export function buildScene(
     placedModules: PlacedModule[],
     modules: ModuleDefinition[],
     config: SimulationConfig,
     options?: { layerFilter?: number }
   ): SimulationScene {
     const filteredModules = options?.layerFilter !== undefined
       ? placedModules.filter(m => m.layer === options.layerFilter)
       : placedModules;
     // ... rest unchanged, using filteredModules
   ```

2. In `src/stores/simulationStore.ts`:
   - Change state shape to store per-layer results:
     ```ts
     interface SimulationState {
       // ... existing fields
       raysByLayer: Map<number, RayPath[]>;          // NEW
       elementsByLayer: Map<number, OpticalElement[]>; // NEW
     }
     ```
   - In `runSimulation`, compute the set of unique layers from `placedModules`. Run `buildScene` + `runSimulation` for each layer separately. Store results in `raysByLayer`. For backward compat, also flatten into the existing `rays` array (so 2D `RayOverlay` still works).
   - If there's only one layer (the common case), this is equivalent to today's behavior — no regression.

3. In `src/three/Rays3D.tsx`:
   - Read `raysByLayer` instead of `rays`.
   - For each layer's ray paths, use `opticalAxisY(layer)` as the Y coordinate.
   - This correctly separates rays on layer 0 from rays on layer 1.

4. Handle edge case: if `raysByLayer` is empty/undefined, fall back to reading `rays` with the existing flat logic (backward compat during transition).

**Acceptance:** Place a lens setup on layer 0 and a mirror setup on layer 1. Run simulation. In 3D, rays on layer 0 appear at the correct height (30 mm) and rays on layer 1 appear at their height (85 mm). They don't interact across layers. 2D view continues to work unchanged.

---

## PR 11 — Rotationally symmetric 3D ray geometry

**Goal:** Instead of flat lines, render rays as 3D tube geometry or cone beams that convey the rotationally symmetric nature of the optical system around the optical axis (Z in three.js). This is a visual enhancement — the physics stay 2D.

**Tasks for Claude Code:**

1. Create `src/three/RayBeam3D.tsx` — a component that takes a 2D ray segment and extrudes it into a rotationally symmetric shape around the optical axis:
   - For each `RaySegment`, the 2D `(x, y)` positions describe a ray in the XZ plane. The "y" offset from the optical axis (the module center line) represents the radial distance in a rotationally symmetric system.
   - Render as a `<mesh>` using `CylinderGeometry` or `TubeGeometry` (or a pair of `THREE.LatheGeometry` segments for converging/diverging beams):
     - Simple approach: each ray segment becomes a thin `CylinderGeometry` rotated to match its direction, with `radiusTop` and `radiusBottom` based on the beam height at start and end points.
     - The radius at any point = absolute offset from the optical axis in the 2D simulation.
   - Material: translucent `MeshPhysicalMaterial` with `transmission`, the wavelength color, and low opacity (~0.15) so overlapping beams don't occlude.

2. Add a toggle to the 3D toolbar: "Rays: Lines | 3D Beams". Default to "Lines" (the existing flat rendering). When "3D Beams" is selected, render `RayBeam3D` instead of `<Line>`.

3. For the line rendering (existing), also add a small enhancement: render the line *and* its mirror across the optical axis, so that from the top view, symmetric beams look like a pair of lines above and below the axis, matching typical optics diagrams.

4. Performance: for the 3D beam mode, limit to ~200 segments rendered as mesh (the most recent / highest-intensity ones). Beyond that, fall back to lines. Each `LatheGeometry` or `CylinderGeometry` adds tris, so this matters.

**Acceptance:** Toggle between line and 3D beam rendering. In 3D beam mode, a collimated beam through a converging lens shows a cone focusing to a point, which is visually convincing. Performance stays >30 fps for a typical setup (~50 segments). Lines mode works unchanged.

---

## PR 12 — Unified state loading and cross-view navigation polish

**Goal:** Ensure that navigating between 2D and 3D never causes state confusion. Selection, simulation, and camera all transfer cleanly.

**Tasks for Claude Code:**

1. In `Editor3DPage.tsx`, add a `useEffect` on mount that ensures modules are loaded:
   ```tsx
   const { modules, loadModules, loadStateFromStorage } = useAppStore();
   useEffect(() => {
     if (modules.length === 0) {
       loadModules().then(() => loadStateFromStorage());
     }
   }, []);
   ```
   This handles the case where the user refreshes the page while on `/configurator/3d`.

2. Add a "loading" state: if `modules.length === 0`, show a centered `<CircularProgress />` with "Loading setup…" text instead of the canvas.

3. Preserve selection across navigation: the store already handles this (selection is in zustand). Verify it works: select a module in 2D, navigate to 3D → it should be highlighted. Currently this works because `selectedItemId` persists in the store. Just confirm, no code needed.

4. Add a "Back to 2D (keep view)" button variant: when clicking "Back to 2D", store the current selection and the active layer in the URL as query params (`?selected=xxx&layer=n`) so the 2D view can scroll to the same area. The 2D view can read these params on mount and pan to the relevant module.

5. In `Scene3D.tsx`, when `onPointerMissed` fires (click on empty space), only clear selection if the click was *not* on a UI overlay (the toolbar, settings, etc.). Currently any misclick on the toolbar area also clears selection. Fix by checking `e.target` — if it's a DOM element (not a canvas), skip the clear.

6. Add keyboard shortcut `F` to focus/zoom-to-fit the selected module (if `NavToolbar` from PR 8 is present, just wire the same function to the `F` key).

**Acceptance:** Refreshing on `/configurator/3d` loads everything correctly. Selection persists across 2D↔3D. Clicking the toolbar doesn't deselect. Module defs are never missing when the 3D page mounts.

---

## PR 13 — Cleanup and minor issues

**Goal:** Address remaining TODOs, dead code, and small bugs found during the scan.

**Tasks for Claude Code:**

1. **Delete dead code**: Remove `src/three/useModuleGLB.ts` (if not done in PR 9). Remove its export from `src/three/index.ts`.

2. **Fix BOMPanel TODO**: In `src/components/BOMPanel.tsx` line 172, change the mailto to `sales@openuc2.com`.

3. **Fix the SelectionHUD in light mode**: If PR 7 adds a light theme, the HUD's dark backdrop `rgba(30, 30, 46, 0.92)` will clash. Make the HUD read the theme from `use3DSettings` and adapt:
   - Light: white card with subtle shadow, dark text.
   - Dark: keep current dark card.

4. **Fix the bottom gizmo toolbar in light mode**: Same adaptation — light background in light mode.

5. **Add `position: [0, GRID_MM.baseplate, 0]` to the Grid** so the grid plane sits at the baseplate level (Y=5) rather than Y=0. This way cubes sit *on* the grid rather than clipping through it.

6. **Add scene stats in dev mode**: When `import.meta.env.DEV`, render drei's `<Stats />` in the top-left corner of the 3D view for FPS monitoring during development.

7. **Verify undo/redo**: Confirm that actions performed in 3D (drag, rotate) are undoable with Ctrl+Z in both 2D and 3D. The store's history system should handle this already, but verify and note any gaps.

**Acceptance:** No dead code, no mismatched themes, grid sits correctly, BOM email works.

---

## PR order and dependencies

```
PR 7  (lighting/theme)    ──┐
PR 8  (camera/nav)         ──┼── can be done in parallel
PR 9  (fallback GLB)       ──┘
       │
PR 12 (state loading)      ── depends on PR 7 for theme awareness, but can start early
       │
PR 10 (layer-aware sim)    ── independent of 7-9, touches simulation only
       │
PR 11 (3D ray beams)       ── depends on PR 10
       │
PR 13 (cleanup)            ── last, depends on all above
```

PRs 7, 8, and 9 can land in any order or in parallel. PR 10 is independent. PR 11 needs PR 10. PR 13 is a sweep at the end.

Want me to start writing the implementation code for any of these?
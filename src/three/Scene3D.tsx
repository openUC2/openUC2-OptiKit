import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stats, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import {
  OpenWith as MoveXZIcon,
  RotateLeft as RotateBaseIcon,
  Timeline as RaysIcon,
  ViewInAr as BeamIcon,
} from '@mui/icons-material';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Cubes } from './Cubes';
import { SelectionHUD } from './SelectionHUD';
import { CubeGizmo } from './CubeGizmo';
import { Rays3D } from './Rays3D';
import { RayBeam3D } from './RayBeam3D';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettings3D, THEMES_3D } from './use3DSettings';
import { useCameraState } from './useCameraState';
import { NavToolbar, TweenRunner, CameraCapture } from './NavToolbar';
import { makeTween, focusOn, computeTopFit } from './cameraUtils';
import { moduleWorldPosition, snapGridXZ } from './coords';
import { GRID_MM } from '../constants/grid';
import type { GizmoMode } from './CubeGizmo';

// ─── Inner canvas content (needs R3F context) ────────────────────────────────

function SceneContent({
  gizmoMode,
  onDraggingChanged,
  orbitEnabled,
  showRays,
  controlsRef,
  tweenRef,
  cameraRef,
}: {
  gizmoMode: GizmoMode;
  onDraggingChanged: (d: boolean) => void;
  orbitEnabled: boolean;
  showRays: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  tweenRef: React.RefObject<ReturnType<typeof makeTween>>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
}) {
  const { settings } = useSettings3D();
  const theme = THEMES_3D[settings.theme];

  // Session-storage camera persistence
  useCameraState(controlsRef);

  return (
    <>
      {/* Fog kept far out so cubes never wash into the background when zoomed out. */}
      <fog attach="fog" args={[theme.fogColor, 12000, 30000]} />

      <hemisphereLight args={['#ffffff', '#b0b0b0', 0.6]} />
      <ambientLight intensity={1.0} />
      <directionalLight position={[200, 400, 200]} intensity={1.2} castShadow />
      <directionalLight position={[-200, 300, -200]} intensity={0.4} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.12}
        minDistance={30}
        maxDistance={9000}
        maxPolarAngle={Math.PI * 0.85}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      {/* Tween runner — advances camera lerp each frame */}
      <TweenRunner tweenRef={tweenRef} controlsRef={controlsRef} />

      {/* Captures R3F camera into the DOM-accessible ref */}
      <CameraCapture cameraRef={cameraRef} />

      {settings.showGrid && (
        <Grid
          args={[2000, 2000]}
          cellSize={GRID_MM.x}
          cellThickness={1}
          sectionSize={GRID_MM.x * 5}
          sectionThickness={1.4}
          cellColor={theme.gridColor}
          sectionColor={theme.sectionColor}
          infiniteGrid
          fadeDistance={12000}
          fadeStrength={1.2}
          /* Offset by half a cell so each 50 mm cube sits centred in a grid
             cell (matching the 2D builder) instead of straddling intersections. */
          position={[GRID_MM.x / 2, GRID_MM.baseplate, GRID_MM.z / 2]}
        />
      )}

      {settings.showAxes && <axesHelper args={[100]} />}

      <Suspense fallback={null}>
        <Cubes />
        <SelectionHUD />
      </Suspense>

      {showRays && (settings.rayMode === 'beams' ? <RayBeam3D /> : <Rays3D />)}

      <CubeGizmo mode={gizmoMode} onDraggingChanged={onDraggingChanged} />

      {/* Corner coordinate axes that rotate with the view; click an axis to orient. */}
      <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
        <GizmoViewport
          axisColors={['#e0533d', '#7cc142', '#2c8fff']}
          labelColor={settings.theme === 'dark' ? '#ffffff' : '#1a1a1a'}
        />
      </GizmoHelper>

      {import.meta.env.DEV && <Stats showPanel={0} className="r3f-stats" />}
    </>
  );
}

// ─── Scene3D ─────────────────────────────────────────────────────────────────

interface Scene3DProps {
  gizmoMode: GizmoMode;
  onGizmoModeChange: (mode: GizmoMode) => void;
}

export function Scene3D({ gizmoMode, onGizmoModeChange }: Scene3DProps) {
  const clearSelection = useAppStore(s => s.clearSelection);
  const placedModules = useAppStore(s => s.placedModules);
  const selectedItemId = useAppStore(s => s.selectedItemId);
  const selectedItemType = useAppStore(s => s.selectedItemType);
  const placeModule = useAppStore(s => s.placeModule);
  const layers = useAppStore(s => s.layers);
  const activeLayerId = useAppStore(s => s.activeLayerId);
  const simEnabled = useSimulationStore(s => s.config.enabled);
  const simShowRays = useSimulationStore(s => s.config.showRays);
  const [isDragging, setIsDragging] = useState(false);
  const [localShowRays, setLocalShowRays] = useState(true);
  const { settings, setSettings } = useSettings3D();
  const theme = THEMES_3D[settings.theme];

  // Shared refs for NavToolbar ↔ Canvas bridge
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const tweenRef = useRef(makeTween());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // On first 3D entry (no saved camera) auto-frame the scene from straight above
  // — the "XY-plane" view. The camera is set directly (not tweened) so it doesn't
  // depend on the render loop, and re-applied across the side-drawer open
  // transition (which resizes the canvas), until the user grabs the camera.
  useEffect(() => {
    if (sessionStorage.getItem('openuc2-3d-camera')) return;
    let userMoved = false;
    let attached: OrbitControlsImpl | null = null;
    const onStart = () => { userMoved = true; };
    const apply = () => {
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (!cam || !ctrl) return;
      if (!attached) { ctrl.addEventListener('start', onStart); attached = ctrl; }
      if (userMoved || cam.aspect <= 0.05) return;
      const { position, target } = computeTopFit(cam, useAppStore.getState().placedModules, cam.aspect);
      cam.position.copy(position);
      ctrl.target.copy(target);
      ctrl.update();
    };
    const timers = [80, 250, 500, 900, 1400].map(ms => window.setTimeout(apply, ms));
    return () => {
      timers.forEach(clearTimeout);
      if (attached) attached.removeEventListener('start', onStart);
    };
  }, []);

  // F key: focus selected module
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() !== 'f') return;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (!cam || !ctrl) return;
      if (!selectedItemId || selectedItemType !== 'module') return;
      const placed = placedModules.find(m => m.id === selectedItemId);
      if (!placed) return;
      const [wx, wy, wz] = moduleWorldPosition(placed);
      focusOn(tweenRef.current, cam, ctrl, new THREE.Vector3(wx, wy, wz));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedItemId, selectedItemType, placedModules]);

  const showRays = simEnabled && simShowRays && localShowRays;

  const handleDraggingChanged = useCallback((d: boolean) => setIsDragging(d), []);

  // Drag a part from the library onto the 3D canvas → place it on the grid cell
  // under the cursor (on the active layer's plane).
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const moduleId = e.dataTransfer.getData('moduleId');
    const cam = cameraRef.current;
    const canvas = (e.currentTarget as HTMLElement).querySelector('canvas');
    if (!moduleId || !cam || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, cam);
    const layerIndex = layers.find(l => l.id === activeLayerId)?.index ?? 0;
    const planeY = layerIndex * GRID_MM.yLayer + GRID_MM.baseplate;
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), hit)) return;
    placeModule(moduleId, snapGridXZ(hit.x, hit.z), layerIndex);
  }, [layers, activeLayerId, placeModule]);

  const isDark = settings.theme === 'dark';
  const toolbarBg = isDark ? 'rgba(30, 30, 46, 0.88)' : 'rgba(255, 255, 255, 0.88)';
  const buttonColor = isDark ? 'grey.300' : 'grey.700';
  const buttonBorder = isDark ? 'grey.700' : 'grey.400';

  return (
    <Box
      sx={{ position: 'relative', width: '100%', height: '100%' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [0, 900, 350], near: 1, far: 30000, fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: false, preserveDrawingBuffer: true }}
        scene={{ background: new THREE.Color(theme.background) }}
        onPointerMissed={(e) => {
          // Only clear selection when clicking the canvas itself, not DOM overlays
          if (e.target instanceof HTMLCanvasElement) clearSelection();
        }}
      >
        <SceneContent
          gizmoMode={gizmoMode}
          onDraggingChanged={handleDraggingChanged}
          orbitEnabled={!isDragging}
          showRays={showRays}
          controlsRef={controlsRef}
          tweenRef={tweenRef}
          cameraRef={cameraRef}
        />
      </Canvas>

      {/* Left-side navigation toolbar */}
      <NavToolbar tweenRef={tweenRef} controlsRef={controlsRef} cameraRef={cameraRef} />

      {/* Gizmo mode toolbar overlay */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: toolbarBg,
          borderRadius: 2,
          backdropFilter: 'blur(8px)',
          px: 1,
          py: 0.5,
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <ToggleButtonGroup
          value={gizmoMode}
          exclusive
          onChange={(_e, v) => { if (v) onGizmoModeChange(v as GizmoMode); }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': { color: buttonColor, borderColor: buttonBorder },
            '& .Mui-selected': { color: '#FFAA00', bgcolor: 'rgba(255,170,0,0.15)' },
          }}
        >
          <ToggleButton value="translate">
            <Tooltip title="Move · X / Y / Z (G)"><MoveXZIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rotate">
            <Tooltip title="Rotate · X / Y / Z rings (R)"><RotateBaseIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Rays toggle */}
        <ToggleButton
          value="rays"
          selected={localShowRays}
          onChange={() => setLocalShowRays(v => !v)}
          size="small"
          sx={{
            color: buttonColor,
            borderColor: buttonBorder,
            '&.Mui-selected': { color: '#00e5ff', bgcolor: 'rgba(0,229,255,0.15)' },
          }}
        >
          <Tooltip title="Show rays"><RaysIcon fontSize="small" /></Tooltip>
        </ToggleButton>

        {/* Lines ↔ Beams toggle */}
        <ToggleButton
          value="beams"
          selected={settings.rayMode === 'beams'}
          onChange={() =>
            setSettings(s => ({ ...s, rayMode: s.rayMode === 'beams' ? 'lines' : 'beams' }))
          }
          size="small"
          sx={{
            color: buttonColor,
            borderColor: buttonBorder,
            '&.Mui-selected': { color: '#ff9100', bgcolor: 'rgba(255,145,0,0.15)' },
          }}
        >
          <Tooltip title="3D Beams"><BeamIcon fontSize="small" /></Tooltip>
        </ToggleButton>
      </Box>
    </Box>
  );
}

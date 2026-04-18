import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stats } from '@react-three/drei';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import {
  OpenWith as MoveXZIcon,
  Height as MoveYIcon,
  RotateLeft as RotateBaseIcon,
  Rotate90DegreesCw as RotateTopIcon,
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
import { makeTween, focusOn } from './cameraUtils';
import { moduleWorldPosition } from './coords';
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
      <fog attach="fog" args={[theme.fogColor, 800, 2000]} />

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
        maxDistance={3000}
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
          cellSize={50}
          sectionSize={250}
          cellColor={theme.gridColor}
          sectionColor={theme.sectionColor}
          infiniteGrid
          fadeDistance={1500}
          position={[0, GRID_MM.baseplate, 0]}
        />
      )}

      {settings.showAxes && <axesHelper args={[100]} />}

      <Suspense fallback={null}>
        <Cubes />
        <SelectionHUD />
      </Suspense>

      {showRays && (settings.rayMode === 'beams' ? <RayBeam3D /> : <Rays3D />)}

      <CubeGizmo mode={gizmoMode} onDraggingChanged={onDraggingChanged} />

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

  const isDark = settings.theme === 'dark';
  const toolbarBg = isDark ? 'rgba(30, 30, 46, 0.88)' : 'rgba(255, 255, 255, 0.88)';
  const buttonColor = isDark ? 'grey.300' : 'grey.700';
  const buttonBorder = isDark ? 'grey.700' : 'grey.400';

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [300, 300, 300], near: 1, far: 5000, fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: false }}
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
          <ToggleButton value="translate-xz">
            <Tooltip title="Move XZ (G)"><MoveXZIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="translate-y">
            <Tooltip title="Move Y / Layer (Y)"><MoveYIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rotate-base">
            <Tooltip title="Rotate base (R)"><RotateBaseIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="rotate-top">
            <Tooltip title="Rotate top (T)"><RotateTopIcon fontSize="small" /></Tooltip>
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

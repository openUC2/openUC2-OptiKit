import { Suspense, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import {
  OpenWith as MoveXZIcon,
  Height as MoveYIcon,
  RotateLeft as RotateBaseIcon,
  Rotate90DegreesCw as RotateTopIcon,
  Timeline as RaysIcon,
} from '@mui/icons-material';
import { Cubes } from './Cubes';
import { SelectionHUD } from './SelectionHUD';
import { CubeGizmo } from './CubeGizmo';
import { Rays3D } from './Rays3D';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { useSettings3D, THEMES_3D } from './use3DSettings';
import type { GizmoMode } from './CubeGizmo';

// ─── Inner canvas content (needs R3F context) ────────────────────────────────

function SceneContent({ gizmoMode, onDraggingChanged, orbitEnabled, showRays }: {
  gizmoMode: GizmoMode;
  onDraggingChanged: (d: boolean) => void;
  orbitEnabled: boolean;
  showRays: boolean;
}) {
  const { settings } = useSettings3D();
  const theme = THEMES_3D[settings.theme];

  return (
    <>
      <fog attach="fog" args={[theme.fogColor, 800, 2000]} />

      <hemisphereLight args={['#ffffff', '#b0b0b0', 0.6]} />
      <ambientLight intensity={1.0} />
      <directionalLight position={[200, 400, 200]} intensity={1.2} castShadow />
      <directionalLight position={[-200, 300, -200]} intensity={0.4} />

      <OrbitControls makeDefault enabled={orbitEnabled} />

      {settings.showGrid && (
        <Grid
          args={[2000, 2000]}
          cellSize={50}
          sectionSize={250}
          cellColor={theme.gridColor}
          sectionColor={theme.sectionColor}
          infiniteGrid
          fadeDistance={1500}
          position={[0, 0, 0]}
        />
      )}

      {settings.showAxes && <axesHelper args={[100]} />}

      <Suspense fallback={null}>
        <Cubes />
        <SelectionHUD />
      </Suspense>

      {showRays && <Rays3D />}

      <CubeGizmo mode={gizmoMode} onDraggingChanged={onDraggingChanged} />
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
  const simEnabled = useSimulationStore(s => s.config.enabled);
  const simShowRays = useSimulationStore(s => s.config.showRays);
  const [isDragging, setIsDragging] = useState(false);
  const [localShowRays, setLocalShowRays] = useState(true);
  const { settings } = useSettings3D();
  const theme = THEMES_3D[settings.theme];

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
        onPointerMissed={() => clearSelection()}
      >
        <SceneContent
          gizmoMode={gizmoMode}
          onDraggingChanged={handleDraggingChanged}
          orbitEnabled={!isDragging}
          showRays={showRays}
        />
      </Canvas>

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
      </Box>
    </Box>
  );
}

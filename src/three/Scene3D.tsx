import { Suspense, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import {
  OpenWith as MoveXZIcon,
  Height as MoveYIcon,
  RotateLeft as RotateBaseIcon,
  Rotate90DegreesCw as RotateTopIcon,
} from '@mui/icons-material';
import { Cubes } from './Cubes';
import { SelectionHUD } from './SelectionHUD';
import { CubeGizmo } from './CubeGizmo';
import { useAppStore } from '../stores/appStore';
import type { GizmoMode } from './CubeGizmo';

// ─── Inner canvas content (needs R3F context) ────────────────────────────────

function SceneContent({ gizmoMode, onDraggingChanged, orbitEnabled }: {
  gizmoMode: GizmoMode;
  onDraggingChanged: (d: boolean) => void;
  orbitEnabled: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 400, 200]} intensity={0.8} castShadow />

      <OrbitControls makeDefault enabled={orbitEnabled} />

      <Grid
        args={[2000, 2000]}
        cellSize={50}
        sectionSize={250}
        infiniteGrid
        fadeDistance={1500}
        position={[0, 0, 0]}
      />

      <Suspense fallback={null}>
        <Cubes />
        <SelectionHUD />
      </Suspense>

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
  const [isDragging, setIsDragging] = useState(false);

  const handleDraggingChanged = useCallback((d: boolean) => setIsDragging(d), []);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [300, 300, 300], near: 1, far: 5000, fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => clearSelection()}
      >
        <SceneContent
          gizmoMode={gizmoMode}
          onDraggingChanged={handleDraggingChanged}
          orbitEnabled={!isDragging}
        />
      </Canvas>

      {/* Gizmo mode toolbar overlay */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: 'rgba(30, 30, 46, 0.88)',
          borderRadius: 2,
          backdropFilter: 'blur(8px)',
          px: 1,
          py: 0.5,
        }}
      >
        <ToggleButtonGroup
          value={gizmoMode}
          exclusive
          onChange={(_e, v) => { if (v) onGizmoModeChange(v as GizmoMode); }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': { color: 'grey.300', borderColor: 'grey.700' },
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
      </Box>
    </Box>
  );
}

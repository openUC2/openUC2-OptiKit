import type { } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Divider, IconButton, Paper, Tooltip } from '@mui/material';
import {
  ZoomOutMap,
  CenterFocusStrong,
  ArrowDownward as TopViewIcon,
  Visibility as FrontViewIcon,
  ThreeDRotation as IsoIcon,
  Add as ZoomInIcon,
  Remove as ZoomOutIcon,
} from '@mui/icons-material';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAppStore } from '../stores/appStore';
import { moduleWorldPosition } from './coords';
import { useSettings3D } from './use3DSettings';
import {
  type CameraTween,
  animateTo,
  zoomToFit,
  focusOn,
  topView,
  frontView,
  isoView,
} from './cameraUtils';

// ─── Inner R3F component: runs the tween loop ─────────────────────────────────

const LERP = 0.1;
const DONE_THRESHOLD = 0.5; // mm

interface TweenRunnerProps {
  tweenRef: React.RefObject<CameraTween>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}

export function TweenRunner({ tweenRef, controlsRef }: TweenRunnerProps) {
  useFrame(({ camera }) => {
    const tween = tweenRef.current;
    const controls = controlsRef.current;
    if (!tween?.active || !controls) return;

    camera.position.lerp(tween.toPos, LERP);
    controls.target.lerp(tween.toTarget, LERP);
    controls.update();

    const posErr = camera.position.distanceTo(tween.toPos);
    const tgtErr = controls.target.distanceTo(tween.toTarget);

    if (posErr < DONE_THRESHOLD && tgtErr < DONE_THRESHOLD) {
      camera.position.copy(tween.toPos);
      controls.target.copy(tween.toTarget);
      controls.update();
      tween.active = false;
    }
  });

  return null;
}

// ─── Helpers to read R3F context inside callbacks ─────────────────────────────

/**
 * A tiny hook that captures the R3F camera and makes it available to
 * the outer (DOM) NavToolbar via a ref. Must be rendered inside <Canvas>.
 */
export function CameraCapture({
  cameraRef,
}: {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
}) {
  const { camera } = useThree();
  // Assign every render so the ref is always fresh
  (cameraRef as React.MutableRefObject<THREE.Camera>).current = camera;
  return null;
}

// ─── NavToolbar (DOM, outside <Canvas>) ──────────────────────────────────────

interface NavToolbarProps {
  tweenRef: React.RefObject<CameraTween>;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
}

export function NavToolbar({ tweenRef, controlsRef, cameraRef }: NavToolbarProps) {
  const placedModules = useAppStore(s => s.placedModules);
  const selectedItemId = useAppStore(s => s.selectedItemId);
  const selectedType = useAppStore(s => s.selectedItemType);
  const { settings } = useSettings3D();
  const isDark = settings.theme === 'dark';

  const bg = isDark ? 'rgba(30, 30, 46, 0.88)' : 'rgba(255, 255, 255, 0.88)';
  const iconColor = isDark ? '#e0e0e0' : '#333333';

  const camera = () => cameraRef.current as THREE.PerspectiveCamera;
  const controls = () => controlsRef.current!;
  const tween = () => tweenRef.current!;

  const handleZoomToFit = () => {
    if (!camera() || !controls()) return;
    zoomToFit(tween(), camera(), controls(), placedModules);
  };

  const handleFocusSelected = () => {
    if (!camera() || !controls()) return;
    if (!selectedItemId || selectedType !== 'module') return;
    const placed = placedModules.find(m => m.id === selectedItemId);
    if (!placed) return;
    const [wx, wy, wz] = moduleWorldPosition(placed);
    focusOn(tween(), camera(), controls(), new THREE.Vector3(wx, wy, wz));
  };

  const handleTop = () => {
    if (!camera() || !controls()) return;
    topView(tween(), camera(), controls(), placedModules);
  };

  const handleFront = () => {
    if (!camera() || !controls()) return;
    frontView(tween(), camera(), controls(), placedModules);
  };

  const handleIso = () => {
    if (!camera() || !controls()) return;
    isoView(tween(), camera(), controls());
  };

  const handleZoomIn = () => {
    const cam = camera();
    const ctrl = controls();
    if (!cam || !ctrl) return;
    const dir = cam.position.clone().sub(ctrl.target);
    const newPos = ctrl.target.clone().addScaledVector(dir, 0.7);
    animateTo(tween(), cam, ctrl, newPos, ctrl.target.clone());
  };

  const handleZoomOut = () => {
    const cam = camera();
    const ctrl = controls();
    if (!cam || !ctrl) return;
    const dir = cam.position.clone().sub(ctrl.target);
    const newPos = ctrl.target.clone().addScaledVector(dir, 1.4);
    animateTo(tween(), cam, ctrl, newPos, ctrl.target.clone());
  };

  const btn = (title: string, onClick: () => void, icon: React.ReactNode, disabled = false) => (
    <Tooltip title={title} placement="right" key={title}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          sx={{ color: iconColor, '&.Mui-disabled': { opacity: 0.3 } }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  const hasSelected = !!selectedItemId && selectedType === 'module';

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        bgcolor: bg,
        backdropFilter: 'blur(8px)',
        borderRadius: 2,
        py: 0.5,
        zIndex: 10,
      }}
    >
      {btn('Zoom to fit (all modules)', handleZoomToFit, <ZoomOutMap fontSize="small" />)}
      {btn('Focus selected', handleFocusSelected, <CenterFocusStrong fontSize="small" />, !hasSelected)}

      <Divider flexItem sx={{ my: 0.5, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />

      {btn('Top view', handleTop, <TopViewIcon fontSize="small" />)}
      {btn('Front view', handleFront, <FrontViewIcon fontSize="small" />)}
      {btn('Isometric', handleIso, <IsoIcon fontSize="small" />)}

      <Divider flexItem sx={{ my: 0.5, borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />

      {btn('Zoom in', handleZoomIn, <ZoomInIcon fontSize="small" />)}
      {btn('Zoom out', handleZoomOut, <ZoomOutIcon fontSize="small" />)}
    </Paper>
  );
}

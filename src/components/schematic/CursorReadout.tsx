/**
 * Live pointer position on the schematic working plane, in document mm — the
 * "where exactly does the beam converge" readout. Self-contained: owns its
 * pointermove listener and state, so mouse movement never re-renders the page
 * or the R3F scene. Same plane raycast as the page's drop handler.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Paper, Typography } from '@mui/material';

export function CursorReadout({
  containerRef,
  cameraRef,
  planeZMm,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  planeZMm: number;
}) {
  const [pos, setPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const onMove = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cam = cameraRef.current;
        const canvas = el.querySelector('canvas');
        if (!cam || !canvas) return setPos(null);
        const rect = canvas.getBoundingClientRect();
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, cam);
        // Doc working plane z = planeZMm is three y = planeZMm (doc→three [x, z, −y]).
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeZMm);
        setPos(raycaster.ray.intersectPlane(plane, hit) ? [hit.x, -hit.z] : null);
      });
    };
    const onLeave = () => setPos(null);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [containerRef, cameraRef, planeZMm]);

  if (!pos) return null;
  return (
    <Paper
      elevation={2}
      sx={{
        position: 'absolute', right: 12, bottom: 16, zIndex: 10,
        px: 1.2, py: 0.4, borderRadius: 1.5, pointerEvents: 'none',
        bgcolor: 'background.paper', opacity: 0.92,
      }}
    >
      <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        x {pos[0].toFixed(1)} · y {pos[1].toFixed(1)} · z {planeZMm.toFixed(1)} mm
      </Typography>
    </Paper>
  );
}

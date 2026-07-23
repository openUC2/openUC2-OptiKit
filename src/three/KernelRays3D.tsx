/**
 * KernelRays3D — renders the kernel's world-frame segment buffer in the 3D
 * view (EMB-D). One merged LineSegments geometry with vertex colors: endpoint
 * positions remapped through frames.ts (the single frame map, decision E6),
 * colors taken from the segments' wavelength-true linear rgb (three.js expects
 * linear values; the renderer encodes to sRGB on output).
 *
 * While a newer trace is in flight (kernel.busy) the picture dims — the
 * "approximate/stale" restyle of spec 18.4 — and the settled f64 result
 * restores full opacity.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '../stores/simulationStore';
import { optikitToThree } from '../document/frames';
import { forEachSegment, segmentCount } from '../kernel/segments';

const GHOST_DIM = 0.35;

export function KernelRays3D() {
  const segments = useSimulationStore(s => s.kernel.segments);
  const busy = useSimulationStore(s => s.kernel.busy);
  const config = useSimulationStore(s => s.config);

  const geometry = useMemo(() => {
    const n = segmentCount(segments);
    if (n === 0) return null;
    const positions = new Float32Array(n * 6);
    const colors = new Float32Array(n * 6);
    forEachSegment(segments!, (seg, i) => {
      const o = i * 6;
      const a = optikitToThree([seg.ax, seg.ay, seg.az]);
      const b = optikitToThree([seg.bx, seg.by, seg.bz]);
      positions[o] = a[0]; positions[o + 1] = a[1]; positions[o + 2] = a[2];
      positions[o + 3] = b[0]; positions[o + 4] = b[1]; positions[o + 5] = b[2];
      const dim = seg.ghost ? GHOST_DIM : 1;
      const r = seg.r * dim, g = seg.g * dim, bl = seg.b * dim;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = bl;
      colors[o + 3] = r; colors[o + 4] = g; colors[o + 5] = bl;
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [segments]);

  if (!config.enabled || !config.showRays || !geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={busy ? 0.45 : 0.9} />
    </lineSegments>
  );
}

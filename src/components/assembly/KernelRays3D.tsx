/**
 * KernelRays3D — renders the kernel's world-frame segment buffer in the
 * assembly view (EMB-G3). One merged LineSegments geometry with vertex
 * colors: endpoints remapped document → three (the assembly view's mapping),
 * colors the segments' wavelength-true linear rgb (three.js expects linear
 * values; the renderer encodes to sRGB on output).
 *
 * While a newer trace is in flight (kernel.busy) the picture dims — the
 * "approximate/stale" restyle of spec 18.4 — and the settled f64 result
 * restores full opacity.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useKernelStore } from '../../kernel/kernelStore';
import { forEachSegment, segmentCount } from '../../kernel/segments';

const NO_RAYCAST = () => null;

export function KernelRays3D() {
  const segments = useKernelStore(s => s.kernel.segments);
  const busy = useKernelStore(s => s.kernel.busy);
  const enabled = useKernelStore(s => s.config.enabled);
  const showRays = useKernelStore(s => s.config.showRays);

  const geometry = useMemo(() => {
    const n = segmentCount(segments);
    if (n === 0) return null;
    const positions = new Float32Array(n * 6);
    const colors = new Float32Array(n * 6);
    forEachSegment(segments!, (seg, i) => {
      const o = i * 6;
      // document [x, y, z] → three [x, z, −y] (same as the part bodies).
      positions[o] = seg.ax;
      positions[o + 1] = seg.az;
      positions[o + 2] = -seg.ay;
      positions[o + 3] = seg.bx;
      positions[o + 4] = seg.bz;
      positions[o + 5] = -seg.by;
      const { r, g, b } = seg;
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
      colors[o + 3] = r;
      colors[o + 4] = g;
      colors[o + 5] = b;
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geom;
  }, [segments]);

  if (!enabled || !showRays || !geometry) return null;

  return (
    <lineSegments geometry={geometry} raycast={NO_RAYCAST}>
      <lineBasicMaterial vertexColors transparent opacity={busy ? 0.45 : 0.9} />
    </lineSegments>
  );
}

/**
 * KernelRayOverlay — the kernel's world-frame segments in the 2D grid canvas
 * (EMB-D, spec 18.8): segments filtered to the active layer's 55 mm slab
 * (|w.z − layer·55| ≤ 27.5) and drawn in grid pixels. Cross-layer rays
 * (periscopes) truncate at the slab boundary, matching the canvas app's
 * slab-clip semantics. Coordinates go through frames.ts — nothing else
 * converts frames (decision E6).
 */

import React, { useMemo } from 'react';
import { Line } from 'react-konva';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import {
  CANVAS_HALF_CELL_MM,
  LAYER_SLAB_HALF_MM,
  layerAxisZ,
} from '../document/frames';
import { forEachSegment, segmentCssColor } from '../kernel/segments';
import type { ViewportConfig } from '../types';

interface KernelRayOverlayProps {
  viewport: ViewportConfig;
  gridCellSize: number;
}

export const KernelRayOverlay: React.FC<KernelRayOverlayProps> = ({ viewport, gridCellSize }) => {
  const segments = useSimulationStore(s => s.kernel.segments);
  const busy = useSimulationStore(s => s.kernel.busy);
  const config = useSimulationStore(s => s.config);
  const layers = useAppStore(s => s.layers);
  const activeLayerId = useAppStore(s => s.activeLayerId);

  const activeLayer = layers.find(l => l.id === activeLayerId)?.index ?? 0;

  const rayLines = useMemo(() => {
    if (!config.enabled || !config.showRays || !segments) return [];
    const scale = gridCellSize / 50; // px per mm
    const axis = layerAxisZ(activeLayer);
    const H = LAYER_SLAB_HALF_MM;
    const lines: React.ReactNode[] = [];

    forEachSegment(segments, (seg, i) => {
      // Clip the segment's parameter range to the slab |z - axis| <= H.
      const za = seg.az - axis;
      const zb = seg.bz - axis;
      let t0 = 0;
      let t1 = 1;
      for (const [limit, sign] of [[H, 1], [-H, -1]] as const) {
        const fa = sign * (za - limit);
        const fb = sign * (zb - limit);
        // f > 0 means outside this face of the slab.
        if (fa > 0 && fb > 0) return;
        if (fa > 0) t0 = Math.max(t0, fa / (fa - fb));
        else if (fb > 0) t1 = Math.min(t1, fa / (fa - fb));
      }
      if (t1 <= t0) return;

      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const x0 = (lerp(seg.ax, seg.bx, t0) + CANVAS_HALF_CELL_MM) * scale;
      const y0 = (lerp(seg.ay, seg.by, t0) + CANVAS_HALF_CELL_MM) * scale;
      const x1 = (lerp(seg.ax, seg.bx, t1) + CANVAS_HALF_CELL_MM) * scale;
      const y1 = (lerp(seg.ay, seg.by, t1) + CANVAS_HALF_CELL_MM) * scale;

      const color = segmentCssColor(seg.r, seg.g, seg.b);
      const opacity = (seg.ghost ? 0.3 : 0.9) * (busy ? 0.5 : 1);
      lines.push(
        <Line
          key={`kray-${i}`}
          points={[x0, y0, x1, y1]}
          stroke={color}
          strokeWidth={Math.max(2.5, 3 / viewport.zoom)}
          opacity={opacity}
          lineCap="round"
          lineJoin="round"
          shadowColor={color}
          shadowBlur={6 / viewport.zoom}
          shadowOpacity={0.7}
        />,
      );
    });
    return lines;
  }, [segments, busy, activeLayer, gridCellSize, config.enabled, config.showRays, viewport.zoom]);

  if (rayLines.length === 0) return null;
  return <>{rayLines}</>;
};

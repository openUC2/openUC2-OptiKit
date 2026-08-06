/**
 * Pointer logic for the measure tool: while active, primary-button clicks on
 * the canvas are intercepted in the CAPTURE phase (parts never see them, so
 * measuring cannot move the selection) and pick snapped points — part
 * anchors and port datums within a screen radius, else the raw working-plane
 * hit. RMB stays free for orbit / context menu. Rendering lives in
 * MeasureOverlay3D; this component draws nothing.
 */

import { useEffect } from 'react';
import * as THREE from 'three';
import { listParts } from '../../document';
import { recordPortsOf } from './ports';
import { useMeasureStore } from './measureStore';
import type { SnapPoint } from './measureStore';

/** Screen-space snap radius, px. */
const SNAP_PX = 14;

/** Part anchors + TRUE port datums (recordPortsOf — the schematic's visual
 * pins sit 22 mm off the datum, useless as measurement targets). */
function snapCandidates(): SnapPoint[] {
  const out: SnapPoint[] = [];
  const quat = new THREE.Quaternion();
  const vec = new THREE.Vector3();
  for (const part of listParts()) {
    const p = part.worldPose.positionMm;
    out.push({ mm: [p[0], p[1], p[2]], label: part.ref });
    quat.set(...part.worldPose.rotation);
    for (const port of recordPortsOf(part)) {
      vec.set(port.positionMm[0], port.positionMm[1], port.positionMm[2]).applyQuaternion(quat);
      out.push({
        mm: [p[0] + vec.x, p[1] + vec.y, p[2] + vec.z],
        label: `${part.ref}.${port.name}`,
      });
    }
  }
  return out;
}

export function MeasureTool({
  containerRef,
  cameraRef,
  planeZMm,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  planeZMm: number;
}) {
  const active = useMeasureStore(s => s.active);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    const canvas = el?.querySelector('canvas');
    if (!el || !canvas) return;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const project = new THREE.Vector3();

    const resolve = (clientX: number, clientY: number): SnapPoint | null => {
      const cam = cameraRef.current;
      if (!cam) return null;
      const rect = canvas.getBoundingClientRect();
      let best: { p: SnapPoint; d: number } | null = null;
      for (const cand of snapCandidates()) {
        // doc → three [x, z, −y], then to screen px.
        project.set(cand.mm[0], cand.mm[2], -cand.mm[1]).project(cam);
        if (project.z > 1) continue; // behind the camera
        const px = ((project.x + 1) / 2) * rect.width + rect.left;
        const py = ((-project.y + 1) / 2) * rect.height + rect.top;
        const d = Math.hypot(px - clientX, py - clientY);
        if (d <= SNAP_PX && (!best || d < best.d)) best = { p: cand, d };
      }
      if (best) return best.p;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, cam);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeZMm);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { mm: [hit.x, -hit.z, planeZMm], label: null };
    };

    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        useMeasureStore.getState().setCursor(resolve(ev.clientX, ev.clientY)),
      );
    };
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const p = resolve(ev.clientX, ev.clientY);
      if (!p) return;
      ev.stopPropagation();
      ev.preventDefault();
      useMeasureStore.getState().pick(p);
    };
    // R3F derives clicks from these on the canvas — swallow the whole primary
    // gesture so measuring never selects or drags a part underneath.
    const swallow = (ev: PointerEvent | MouseEvent) => {
      if (ev.button === 0) ev.stopPropagation();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointerup', swallow, { capture: true });
    el.addEventListener('click', swallow, { capture: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointerup', swallow, { capture: true });
      el.removeEventListener('click', swallow, { capture: true });
      useMeasureStore.getState().setCursor(null);
    };
  }, [active, containerRef, cameraRef, planeZMm]);

  return null;
}

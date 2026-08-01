/**
 * WP-92: an R3F <Canvas> for short-lived previews (dialog previews, tab
 * thumbnails). Browsers cap live WebGL contexts (~8–16 per page) and only
 * reclaim an unmounted canvas's context lazily, so every preview open/close
 * cycle leaves a zombie context counting against the cap — enough cycles and
 * the browser evicts the MAIN scene's context ("THREE.WebGLRenderer: Context
 * Lost", dead canvas until reload). This wrapper force-releases the context
 * synchronously on unmount instead of waiting.
 */

import { useEffect, useRef } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import type * as THREE from 'three';

export function PreviewCanvas({ children, onCreated, ...props }: CanvasProps) {
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(
    () => () => {
      const gl = glRef.current;
      if (!gl) return;
      // R3F also disposes on unmount, but deferred; the browser has already
      // counted the next preview's context by then. Losing it now keeps the
      // live-context count flat. (R3F's own deferred pass is try/catch'd, so
      // double disposal is harmless.)
      try {
        gl.forceContextLoss();
        gl.dispose();
      } catch {
        // Context already gone — exactly the state we wanted.
      }
    },
    [],
  );
  return (
    <Canvas
      {...props}
      onCreated={state => {
        glRef.current = state.gl;
        onCreated?.(state);
      }}
    >
      {children}
    </Canvas>
  );
}

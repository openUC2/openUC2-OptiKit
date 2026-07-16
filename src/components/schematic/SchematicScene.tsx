/**
 * The 2.5D schematic canvas: optical parts as glyphs on a working plane,
 * continuous mm dragging (XY in-plane, Shift for height), free-yaw rotation
 * ring, clickable port pins for chain building, path polylines, and the live
 * 2D ray overlay. Talks ONLY to src/document.
 */

import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, Line, OrbitControls, Text } from '@react-three/drei';
import type { DocPart, DocPath, PortRef, Vec3 } from '../../document';
import {
  docQuatToThree,
  movePartWorld,
  rotatePart,
  selectPart,
  useDocParts,
  useDocPaths,
  useSelectedPartId,
  UC2_GRID_MM,
} from '../../document';
import { wavelengthToColor } from '../../utils/sceneBuilder';
import { AuthoritativeRays } from './AuthoritativeRays';
import { GLYPH_COLORS } from './colors';
import { OpticalAxisArrow, SchematicGlyph } from './glyphs';
import { beamAxesOf, glyphQuatOf, portsOf, resolvePortRef } from './ports';
import type { SchematicPort } from './ports';
import { useSchematicSim } from './useSchematicSim';
import { useSimFreshness } from './serviceStore';

export interface SchematicSettings {
  planeZMm: number;
  snapGrid: boolean;
  snapYaw: boolean;
  showRays: boolean;
  /** Locked 2.5D camera (WP-23): LMB is for parts; orbit on RMB only. */
  lockView: boolean;
}

interface SceneProps {
  settings: SchematicSettings;
  chainDraft: PortRef[] | null;
  onPinClick: (ref: PortRef) => void;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  /** OrbitControls handle, for ERC "zoom to part" (WP-15). */
  controlsRef?: React.MutableRefObject<{ target: THREE.Vector3; update: () => void } | null>;
}

// ── coordinate helpers (doc frame ↔ three scene) ─────────────────────────────

const toThree = (p: Vec3): [number, number, number] => [p[0], p[2], -p[1]];

/** Overlay lines (rays, paths, ticks) must never intercept pointer raycasts. */
const NO_RAYCAST = () => null;

// ── one placed part ───────────────────────────────────────────────────────────

function SchematicPart({
  part,
  settings,
  chaining,
  onPinClick,
  setOrbitEnabled,
}: {
  part: DocPart;
  settings: SchematicSettings;
  chaining: boolean;
  onPinClick: (ref: PortRef) => void;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const selectedId = useSelectedPartId();
  const selected = selectedId === part.id;
  const [hovered, setHovered] = useState(false);
  const camera = useThree(s => s.camera);
  const drag = useRef<{
    mode: 'plane' | 'height';
    grabOffset: Vec3;
  } | null>(null);

  const pos = toThree(part.worldPose.positionMm);
  const quat = useMemo(
    () => docQuatToThree(part.worldPose.rotation),
    [part.worldPose.rotation],
  );
  const ports = useMemo(() => portsOf(part), [part]);
  // Glyphs are authored with +x as the optical axis (and the fold arm toward
  // +y); orient them onto the part's REAL entry/exit axes from its record
  // ports — the same convention for palette and imported parts (WP-29).
  const glyphQuat = useMemo(() => glyphQuatOf(part), [part]);
  const foldDeg = useMemo(() => beamAxesOf(part).foldDeg, [part]);

  const intersectDragPlane = useCallback(
    (e: ThreeEvent<PointerEvent>, mode: 'plane' | 'height'): Vec3 | null => {
      const hit = new THREE.Vector3();
      let plane: THREE.Plane;
      if (mode === 'plane') {
        plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pos[1]);
      } else {
        const n = new THREE.Vector3();
        camera.getWorldDirection(n);
        n.y = 0;
        if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
        n.normalize();
        plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          n,
          new THREE.Vector3(pos[0], pos[1], pos[2]),
        );
      }
      if (!e.ray.intersectPlane(plane, hit)) return null;
      return [hit.x, -hit.z, hit.y];
    },
    [camera, pos],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || chaining) return;
      e.stopPropagation();
      selectPart(part.id);
      const mode: 'plane' | 'height' = e.shiftKey ? 'height' : 'plane';
      const hit = intersectDragPlane(e, mode);
      if (!hit) return;
      drag.current = {
        mode,
        grabOffset: [
          hit[0] - part.worldPose.positionMm[0],
          hit[1] - part.worldPose.positionMm[1],
          hit[2] - part.worldPose.positionMm[2],
        ],
      };
      setOrbitEnabled(false);
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [chaining, intersectDragPlane, part, setOrbitEnabled],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const hit = intersectDragPlane(e, d.mode);
      if (!hit) return;
      const [px, py, pz] = part.worldPose.positionMm;
      let target: Vec3;
      if (d.mode === 'plane') {
        target = [hit[0] - d.grabOffset[0], hit[1] - d.grabOffset[1], pz];
        if (settings.snapGrid) {
          target = [
            Math.round(target[0] / UC2_GRID_MM[0]) * UC2_GRID_MM[0],
            Math.round(target[1] / UC2_GRID_MM[1]) * UC2_GRID_MM[1],
            pz,
          ];
        }
      } else {
        let z = hit[2] - d.grabOffset[2];
        if (settings.snapGrid) z = Math.round(z / UC2_GRID_MM[2]) * UC2_GRID_MM[2];
        target = [px, py, z];
      }
      movePartWorld(part.id, target);
    },
    [intersectDragPlane, part, settings.snapGrid],
  );

  const endDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return;
      drag.current = null;
      setOrbitEnabled(true);
      (e.target as Element).releasePointerCapture(e.pointerId);
    },
    [setOrbitEnabled],
  );

  const color = GLYPH_COLORS[part.category];

  return (
    <group position={pos}>
      <group
        quaternion={quat}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerOver={e => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = chaining ? 'crosshair' : 'grab';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <group quaternion={glyphQuat}>
          <SchematicGlyph category={part.category} label={part.ref} foldDeg={foldDeg} />
          <OpticalAxisArrow color={selected ? '#ffd24d' : '#8f9aa6'} foldDeg={foldDeg} />
        </group>
      </group>

      {/* Selection/hover: a flat ground ring (the wireframe sphere read as
          "mystery geometry" — WP-23 legend feedback). */}
      {(hovered || selected) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
          <ringGeometry args={selected ? [24, 28, 48] : [25, 27, 48]} />
          <meshBasicMaterial
            color={selected ? '#FFAA00' : '#88CCFF'}
            transparent
            opacity={selected ? 0.75 : 0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Reference label (billboarded by keeping it out of the part rotation). */}
      <Text
        position={[0, 26, 0]}
        fontSize={7}
        color={selected ? '#ffd24d' : '#aeb6c2'}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.4}
        outlineColor="#00000088"
      >
        {part.ref}
      </Text>

      {/* Port pins (world-anchored to the part, rotate with it). */}
      <group quaternion={quat}>
        {ports.map(port => (
          <PortPin
            key={port.name}
            port={port}
            partSelected={selected || hovered || chaining}
            color={color}
            onClick={() => onPinClick(port.ref)}
          />
        ))}
      </group>

      {/* Free-yaw ring when selected. */}
      {selected && (
        <YawRing part={part} snap={settings.snapYaw} setOrbitEnabled={setOrbitEnabled} />
      )}
    </group>
  );
}

function PortPin({
  port,
  partSelected,
  color,
  onClick,
}: {
  port: SchematicPort;
  partSelected: boolean;
  color: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const p = toThree(port.localMm);
  const dir = toThree(port.localDir);
  return (
    <group position={p}>
      {/* Generous invisible hitbox — the visible pin is only a few px on screen. */}
      <mesh
        visible={false}
        onClick={e => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={e => e.stopPropagation()}
        onPointerOver={e => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'crosshair';
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[10, 8, 8]} />
      </mesh>
      <mesh>
        <sphereGeometry args={[hovered ? 4.5 : 3, 16, 12]} />
        <meshBasicMaterial
          color={hovered ? '#ffffff' : port.kind === 'input' ? '#69d2ff' : '#ffd24d'}
          transparent
          opacity={partSelected || hovered ? 1 : 0.55}
        />
      </mesh>
      {/* direction tick */}
      <Line
          raycast={NO_RAYCAST}
        points={[
          [0, 0, 0],
          [dir[0] * 8, dir[1] * 8, dir[2] * 8],
        ]}
        color={hovered ? '#ffffff' : color}
        lineWidth={1}
        transparent
        opacity={0.8}
      />
      {hovered && (
        <Text position={[0, 7, 0]} fontSize={5} color="#ffffff" anchorX="center" anchorY="bottom">
          {port.name}
        </Text>
      )}
    </group>
  );
}

function YawRing({
  part,
  snap,
  setOrbitEnabled,
}: {
  part: DocPart;
  snap: boolean;
  setOrbitEnabled: (v: boolean) => void;
}) {
  const dragging = useRef(false);
  const applyYawFromEvent = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const plane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -part.worldPose.positionMm[2],
      );
      const hit = new THREE.Vector3();
      if (!e.ray.intersectPlane(plane, hit)) return;
      const dx = hit.x - part.worldPose.positionMm[0];
      const dyDoc = -hit.z - part.worldPose.positionMm[1];
      const yaw = (Math.atan2(dyDoc, dx) * 180) / Math.PI;
      rotatePart(part.id, yaw, { snap });
    },
    [part, snap],
  );
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={e => {
        e.stopPropagation();
        dragging.current = true;
        setOrbitEnabled(false);
        (e.target as Element).setPointerCapture(e.pointerId);
        applyYawFromEvent(e);
      }}
      onPointerMove={e => {
        if (!dragging.current) return;
        e.stopPropagation();
        applyYawFromEvent(e);
      }}
      onPointerUp={e => {
        dragging.current = false;
        setOrbitEnabled(true);
        (e.target as Element).releasePointerCapture(e.pointerId);
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'ew-resize';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <torusGeometry args={[34, 1.6, 8, 64]} />
      <meshBasicMaterial color="#ffd24d" transparent opacity={0.65} />
    </mesh>
  );
}

// ── paths + rays ──────────────────────────────────────────────────────────────

function PathLines({ parts, paths, draft }: { parts: DocPart[]; paths: DocPath[]; draft: PortRef[] | null }) {
  const lines = useMemo(() => {
    const resolved: { name: string; points: [number, number, number][]; draft: boolean }[] = [];
    const collect = (name: string, chain: PortRef[], isDraft: boolean) => {
      const points = chain
        .map(ref => resolvePortRef(parts, ref))
        .filter((p): p is Vec3 => p !== null)
        .map(toThree);
      if (points.length >= 2) resolved.push({ name, points, draft: isDraft });
    };
    for (const path of paths) collect(path.name, path.chain, false);
    if (draft) collect('draft', draft, true);
    return resolved;
  }, [parts, paths, draft]);

  return (
    <>
      {lines.map(l => (
        <Line
          raycast={NO_RAYCAST}
          key={l.name}
          points={l.points}
          color={l.draft ? '#ffffff' : '#2ec4a5'}
          lineWidth={l.draft ? 2.5 : 2}
          dashed={l.draft}
          dashSize={6}
          gapSize={4}
          transparent
          opacity={0.9}
        />
      ))}
    </>
  );
}

function RayOverlay({ planeZMm, enabled }: { planeZMm: number; enabled: boolean }) {
  const { rays } = useSchematicSim(planeZMm, enabled);
  const planeY = planeZMm + 0.8;
  const polylines = useMemo(
    () =>
      rays
        .filter(r => r.segments.length > 0)
        .map(r => ({
          id: r.id,
          color: wavelengthToColor(r.wavelength),
          points: [
            [r.segments[0].start.x, planeY, r.segments[0].start.y] as [number, number, number],
            ...r.segments.map(
              s => [s.end.x, planeY, s.end.y] as [number, number, number],
            ),
          ],
        })),
    [rays, planeY],
  );
  return (
    <>
      {polylines.map(l => (
        <Line
          raycast={NO_RAYCAST}
          key={l.id}
          points={l.points}
          color={l.color}
          lineWidth={1.2}
          transparent
          opacity={0.75}
        />
      ))}
    </>
  );
}

// ── scene root ────────────────────────────────────────────────────────────────

function CameraCapture({ cameraRef }: { cameraRef: SceneProps['cameraRef'] }) {
  const camera = useThree(s => s.camera);
  cameraRef.current = camera as THREE.PerspectiveCamera;
  return null;
}

function SceneContent({ settings, chainDraft, onPinClick, cameraRef, controlsRef }: SceneProps) {
  const parts = useDocParts();
  const paths = useDocPaths();
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const planeY = settings.planeZMm;
  // The approximate 2D preview yields to fresh authoritative rays and
  // reappears when the document changes under them (WP-15).
  const simFreshness = useSimFreshness();

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a929c', 0.7]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[250, 500, 250]} intensity={1.1} />
      <directionalLight position={[-200, 300, -250]} intensity={0.35} />

      <OrbitControls
        makeDefault
        ref={controlsRef as React.Ref<never>}
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.12}
        minDistance={40}
        maxDistance={8000}
        maxPolarAngle={Math.PI * 0.495}
        mouseButtons={
          settings.lockView
            ? {
                // SimCity mode: the left button belongs to the PARTS.
                LEFT: -1 as unknown as THREE.MOUSE,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE,
              }
            : {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }
        }
      />
      <CameraCapture cameraRef={cameraRef} />

      {/* Working plane at the OPTICAL-AXIS height. Lines are offset by half a
          cell so they draw the cube BOUNDARIES — snapped parts land in cell
          centers, SimCity-style (WP-23 snap semantics). */}
      <Grid
        args={[2000, 2000]}
        cellSize={UC2_GRID_MM[0]}
        cellThickness={0.8}
        sectionSize={UC2_GRID_MM[0] * 5}
        sectionThickness={1.3}
        cellColor="#3c4654"
        sectionColor="#55637a"
        infiniteGrid
        fadeDistance={9000}
        fadeStrength={1.1}
        position={[UC2_GRID_MM[0] / 2, planeY, UC2_GRID_MM[1] / 2]}
      />

      <axesHelper args={[80]} position={[0, planeY + 0.2, 0]} />

      <Suspense fallback={null}>
        {parts.map(part => (
          <SchematicPart
            key={part.id}
            part={part}
            settings={settings}
            chaining={chainDraft !== null}
            onPinClick={onPinClick}
            setOrbitEnabled={setOrbitEnabled}
          />
        ))}
      </Suspense>

      <PathLines parts={parts} paths={paths} draft={chainDraft} />
      {settings.showRays && simFreshness !== 'fresh' && (
        <RayOverlay planeZMm={settings.planeZMm} enabled />
      )}
      <AuthoritativeRays />

      <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
        <GizmoViewport
          axisColors={['#e0533d', '#7cc142', '#2c8fff']}
          labelColor="#ffffff"
        />
      </GizmoHelper>
    </>
  );
}

export function SchematicScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 760, 480], near: 1, far: 30000, fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ alpha: false, preserveDrawingBuffer: true }}
      scene={{ background: new THREE.Color('#171c24') }}
      onPointerMissed={e => {
        if (e.target instanceof HTMLCanvasElement) selectPart(null);
      }}
    >
      <SceneContent {...props} />
    </Canvas>
  );
}

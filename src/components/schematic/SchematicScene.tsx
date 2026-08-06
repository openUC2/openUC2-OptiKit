/**
 * The 2.5D schematic canvas: optical parts as glyphs on a working plane,
 * continuous mm dragging (XY in-plane, Shift for height), free-yaw rotation
 * ring, clickable port pins for chain building, path polylines, and the live
 * 2D ray overlay. Talks ONLY to src/document.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, Line, OrbitControls, Text } from '@react-three/drei';
import type { DocFiber, DocPart, DocPath, LayerAppearance, PortRef, Vec3 } from '../../document';
import {
  captureUndo,
  classifyPart,
  commitUndo,
  docQuatToThree,
  interfaceKindOf,
  layerAppearance,
  layerRangeOf,
  libraryEntryOf,
  movePartWorld,
  parsePortRef,
  rotatePart,
  selectPart,
  togglePartSelection,
  useSelectedPartIds,
  templateClassOf,
  useDocParts,
  useLayerStore,
  activeWavelengthUm,
  isSourceOn,
  useDocPaths,
  useFibersStore,
  useSelectedPartId,
  UC2_GRID_MM,
} from '../../document';
import type { UndoToken } from '../../document';
import { useKernelStore } from '../../kernel/kernelStore';
import { wavelengthToColor } from '../../utils/sceneBuilder';
import { AuthoritativeRays } from './AuthoritativeRays';
import { AuthoredSymbol } from './AuthoredSymbol';
import { KernelRays3D } from '../common/KernelRays3D';
import { useAuthoredSymbol } from './symbolAsset';
import { EscapeRays } from './EscapeRays';
import { MeasureOverlay3D } from './MeasureOverlay3D';
import { FIBER_COLOR, GLYPH_COLORS, sourceTint } from './colors';
import { OpticalAxisArrow, SchematicGlyph } from './glyphs';
import { beamAxesOf, glyphQuatOf, portsOf, resolvePortRef } from './ports';
import { useSceneColors } from '../../theme/sceneColors';
import type { SceneColors } from '../../theme/sceneColors';
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
  /** Live pointer mm readout on the working plane (page-level overlay). */
  cursorReadout: boolean;
}

interface SceneProps {
  settings: SchematicSettings;
  chainDraft: PortRef[] | null;
  onPinClick: (ref: PortRef) => void;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  /** OrbitControls handle, for ERC "zoom to part" (WP-15). */
  controlsRef?: React.MutableRefObject<{ target: THREE.Vector3; update: () => void } | null>;
}

type SceneContentProps = SceneProps & { colors: SceneColors };

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
  colors,
  dimmed = false,
}: {
  part: DocPart;
  settings: SchematicSettings;
  chaining: boolean;
  onPinClick: (ref: PortRef) => void;
  setOrbitEnabled: (v: boolean) => void;
  colors: SceneColors;
  /** WP-65: the part's layer is dimmed — low opacity, non-interactive. */
  dimmed?: boolean;
}) {
  const selectedId = useSelectedPartId();
  // WP-71: the whole selection set reads as selected, not just the primary —
  // otherwise a shift-selected cluster looks unselected while Ctrl+G groups it.
  const selectedIds = useSelectedPartIds();
  const selected = selectedId === part.id || selectedIds.includes(part.id);
  const [hovered, setHovered] = useState(false);
  const camera = useThree(s => s.camera);
  const drag = useRef<{
    mode: 'plane' | 'height';
    grabOffset: Vec3;
    /** WP-71: did the pointer actually move? A shift press that does not
     * becomes a selection toggle instead of a height drag. */
    moved: boolean;
    toggleOnRelease: boolean;
    /** WP-96: the whole drag is ONE undo step. */
    undo: UndoToken;
  } | null>(null);

  const pos = toThree(part.worldPose.positionMm);
  const quat = useMemo(
    () => docQuatToThree(part.worldPose.rotation),
    [part.worldPose.rotation],
  );
  const ports = useMemo(() => portsOf(part), [part]);
  // Mechanical template class (WP-34): T1 draws its cube envelope, T2 its
  // DOF travel axes.
  const tClass = templateClassOf(part.libraryRef);
  // WP-103: is this part in a cube at all? (T-class only says WHICH KIND of
  // cube — it is null for a bare optic AND for a housed device.)
  const mount = libraryEntryOf(part.libraryRef)?.mount ?? 'cube';
  const dofAxes = useMemo(() => {
    if (tClass !== 'adaptive') return [];
    const lib = libraryEntryOf(part.libraryRef);
    return (lib?.dofs ?? [])
      .filter(d => d.kind === 'translation')
      .map(d => {
        const local: Vec3 =
          d.axis === 'x' ? [1, 0, 0] : d.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
        const threeAxis = new THREE.Vector3(local[0], local[2], -local[1]);
        return {
          name: d.name,
          quat: new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            threeAxis,
          ),
          lengthMm: d.range ? d.range[1] - d.range[0] : 40,
        };
      });
  }, [tClass, part.libraryRef]);
  // Glyphs are authored with +x as the optical axis (and the fold arm toward
  // +y); orient them onto the part's REAL entry/exit axes from its record
  // ports — the same convention for palette and imported parts (WP-29).
  const glyphQuat = useMemo(() => glyphQuatOf(part), [part]);
  const foldDeg = useMemo(() => beamAxesOf(part).foldDeg, [part]);
  // WP-47: a source draws in its active line's colour, greyed out when off.
  const sourceOff = part.category === 'source' && !isSourceOn(part);
  const glyphTint =
    part.category === 'source' ? sourceTint(activeWavelengthUm(part)) : null;
  // WP-48: an authored symbol, when the record ships one AND it loads.
  const symbolSvg = useAuthoredSymbol(libraryEntryOf(part.libraryRef)?.symbolUrl ?? null);
  // WP-64: plates / puzzle joints / baseplates draw a distinct flat glyph.
  const ifaceKind = useMemo(() => interfaceKindOf(part.libraryRef), [part.libraryRef]);

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
      // WP-71 multi-select. Ctrl/Cmd+click toggles outright (it never
      // drags). Shift is already the height-drag modifier, so a SHIFT click
      // only toggles when it turns out not to be a drag — decided on
      // pointer-up, below.
      if (e.ctrlKey || e.metaKey) {
        togglePartSelection(part.id);
        return;
      }
      // A plain click selects. A SHIFT press keeps an existing selection set
      // intact (it may be about to grow, or to be dragged in height), but
      // still selects when nothing is selected at all — so shift-dragging an
      // untouched part behaves as it did before WP-71.
      if (!e.shiftKey || selectedIds.length === 0) selectPart(part.id);
      const mode: 'plane' | 'height' = e.shiftKey ? 'height' : 'plane';
      const hit = intersectDragPlane(e, mode);
      if (!hit) return;
      drag.current = {
        undo: captureUndo(),
        mode,
        grabOffset: [
          hit[0] - part.worldPose.positionMm[0],
          hit[1] - part.worldPose.positionMm[1],
          hit[2] - part.worldPose.positionMm[2],
        ],
        moved: false,
        toggleOnRelease: e.shiftKey,
      };
      setOrbitEnabled(false);
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [chaining, intersectDragPlane, part, selectedIds.length, setOrbitEnabled],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const hit = intersectDragPlane(e, d.mode);
      if (!hit) return;
      d.moved = true;
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
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      commitUndo(d.undo);
      // A shift press that never moved was a multi-select click, not a
      // height drag (WP-71).
      if (d.toggleOnRelease && !d.moved) togglePartSelection(part.id);
      setOrbitEnabled(true);
      (e.target as Element).releasePointerCapture(e.pointerId);
    },
    [part.id, setOrbitEnabled],
  );

  const color = GLYPH_COLORS[part.category];

  // WP-65: a dimmed layer is non-interactive — no pointer handlers means R3F
  // never raycasts these meshes, so clicks fall through to parts behind.
  const handlers = dimmed
    ? {}
    : {
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = chaining ? 'crosshair' : 'grab';
        },
        onPointerOut: () => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        },
      };

  return (
    <group position={pos}>
      <group quaternion={quat} {...handlers}>
        <group quaternion={glyphQuat}>
          {/* WP-48: an authored symbol replaces the derived glyph — looks
              only, the pins above still come from optics.ports. An unreachable
              asset falls back to the derived glyph rather than drawing
              nothing. */}
          {symbolSvg ? (
            <AuthoredSymbol
              svg={symbolSvg}
              color={dimmed ? '#6b7280' : (glyphTint ?? GLYPH_COLORS[part.category])}
            />
          ) : (
            <SchematicGlyph
              category={part.category}
              label={part.ref}
              foldDeg={foldDeg}
              tint={glyphTint}
              dimmed={sourceOff || dimmed}
              interfaceKind={ifaceKind}
            />
          )}
          <OpticalAxisArrow
            color={selected ? colors.labelSelected : colors.label}
            foldDeg={foldDeg}
          />
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
        color={selected ? colors.labelSelected : colors.label}
        fillOpacity={dimmed ? 0.35 : 1}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.4}
        outlineColor={colors.labelOutline}
      >
        {part.ref}
      </Text>

      {/* Port pins (world-anchored to the part, rotate with it). Dimmed
          layers are non-interactive — no pins (WP-65). */}
      {!dimmed && (
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
      )}

      {/* Free-yaw ring when selected. */}
      {selected && !dimmed && (
        <YawRing part={part} snap={settings.snapYaw} setOrbitEnabled={setOrbitEnabled} />
      )}

      {/* WP-103: EVERY part that lives in a cube is drawn inside its cube —
          "in case of T1, we should actually have it inside an openUC2 cube".
          This used to fire for `fixed` only, so a T2 insert and a T3 module
          were drawn as naked glyphs floating on the grid, indistinguishable
          from a bare optic. A generated (T3) cube is dashed-faint: it does
          not exist yet, and δ inside it is NOT locked. */}
      {mount === 'cube' && (
        <lineSegments raycast={NO_RAYCAST}>
          <edgesGeometry
            args={[new THREE.BoxGeometry(UC2_GRID_MM[0], UC2_GRID_MM[2], UC2_GRID_MM[1])]}
          />
          <lineBasicMaterial
            color={selected ? '#FFAA00' : colors.gridSection}
            transparent
            opacity={
              selected ? 0.8 : dimmed ? 0.12 : tClass === 'generative' ? 0.18 : 0.35
            }
          />
        </lineSegments>
      )}

      {/* T2 adaptive template: show the declared DOF travel axis. */}
      {tClass === 'adaptive' && selected && dofAxes.map(dof => (
        <group key={dof.name} quaternion={quat}>
          <mesh quaternion={dof.quat} raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.7, 0.7, dof.lengthMm, 8]} />
            <meshBasicMaterial color="#85b918" transparent opacity={0.8} depthWrite={false} />
          </mesh>
        </group>
      ))}
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

function PathLines({
  parts,
  paths,
  draft,
  visibleIds,
}: {
  parts: DocPart[];
  paths: DocPath[];
  draft: PortRef[] | null;
  /** WP-65: path lines only run between VISIBLE parts — a chain through a
   * hidden layer breaks into separate runs instead of bridging the gap. */
  visibleIds: ReadonlySet<string>;
}) {
  const lines = useMemo(() => {
    const resolved: { name: string; points: [number, number, number][]; draft: boolean }[] = [];
    const collect = (name: string, chain: PortRef[], isDraft: boolean) => {
      let run: [number, number, number][] = [];
      let segment = 0;
      const flush = () => {
        if (run.length >= 2) {
          resolved.push({ name: `${name}#${segment++}`, points: run, draft: isDraft });
        }
        run = [];
      };
      for (const ref of chain) {
        const p = visibleIds.has(parsePortRef(ref).partId)
          ? resolvePortRef(parts, ref)
          : null;
        if (p) run.push(toThree(p));
        else flush();
      }
      flush();
    };
    for (const path of paths) collect(path.name, path.chain, false);
    if (draft) collect('draft', draft, true);
    return resolved;
  }, [parts, paths, draft, visibleIds]);

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

/**
 * Fiber links (WP-46): a loose catmull-rom curve between the two connectors,
 * deliberately unlike a beam segment — a fiber carries light with NO geometric
 * constraint, so it must not read as a straight optical path. It sags toward
 * the working plane and is drawn in the amber "patch cord" tint.
 */
function FiberLines({
  parts,
  fibers,
  visibleIds,
}: {
  parts: DocPart[];
  fibers: DocFiber[];
  /** WP-65: a cord with either connector on a hidden layer is not drawn. */
  visibleIds: ReadonlySet<string>;
}) {
  const curves = useMemo(() => {
    const out: { id: string; points: [number, number, number][] }[] = [];
    for (const fiber of fibers) {
      if (
        !visibleIds.has(parsePortRef(fiber.from).partId) ||
        !visibleIds.has(parsePortRef(fiber.to).partId)
      ) {
        continue;
      }
      const a = resolvePortRef(parts, fiber.from);
      const b = resolvePortRef(parts, fiber.to);
      if (!a || !b) continue;
      const p0 = new THREE.Vector3(...toThree(a));
      const p1 = new THREE.Vector3(...toThree(b));
      // Sag: a slack cord dips below the straight line, scaled by its span so
      // short patch cords stay tidy and long ones drape.
      const span = p0.distanceTo(p1);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      mid.y -= Math.min(60, span * 0.22);
      const curve = new THREE.CatmullRomCurve3([p0, mid, p1], false, 'catmullrom', 0.5);
      out.push({
        id: fiber.id,
        points: curve.getPoints(32).map(p => [p.x, p.y, p.z] as [number, number, number]),
      });
    }
    return out;
  }, [parts, fibers, visibleIds]);

  return (
    <>
      {curves.map(c => (
        <Line
          raycast={NO_RAYCAST}
          key={c.id}
          points={c.points}
          color={FIBER_COLOR}
          lineWidth={2}
          dashed
          dashSize={5}
          gapSize={3}
          transparent
          opacity={0.85}
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

function SceneContent({ settings, chainDraft, onPinClick, cameraRef, controlsRef, colors }: SceneContentProps) {
  const parts = useDocParts();
  const paths = useDocPaths();
  const fibers = useFibersStore(s => s.fibers);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const planeY = settings.planeZMm;
  // The approximate 2D preview yields to fresh authoritative rays and
  // reappears when the document changes under them (WP-15).
  const simFreshness = useSimFreshness();
  // EMB-G3: while the kernel holds a settled trace, IT is the live preview —
  // the real 3D ray distribution, not the in-plane 2D fan. The legacy engine
  // stays only as the fallback with no kernel trace (service down, first load).
  const kernelHasTrace = useKernelStore(s => (s.kernel.segments?.length ?? 0) > 0);

  // WP-65: per-part layer appearance. Hidden layers unmount (no raycast),
  // dimmed layers render faint and non-interactive.
  const layerVis = useLayerStore();
  const appearances = useMemo(() => {
    const range = layerRangeOf(parts);
    const map = new Map<string, LayerAppearance>();
    for (const part of parts) {
      const c = classifyPart(part, range);
      map.set(part.id, layerAppearance(c.layer, c.interface, layerVis));
    }
    return map;
  }, [parts, layerVis]);
  const visibleIds = useMemo(
    () =>
      new Set(
        parts.filter(p => appearances.get(p.id) !== 'hidden').map(p => p.id),
      ),
    [parts, appearances],
  );
  // A part hidden while selected gets deselected — Del must never nuke an
  // invisible part (WP-65 placement/delete guard).
  const selectedId = useSelectedPartId();
  useEffect(() => {
    if (selectedId && appearances.get(selectedId) === 'hidden') selectPart(null);
  }, [selectedId, appearances]);

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
        cellColor={colors.gridCell}
        sectionColor={colors.gridSection}
        infiniteGrid
        fadeDistance={9000}
        fadeStrength={1.1}
        position={[UC2_GRID_MM[0] / 2, planeY, UC2_GRID_MM[1] / 2]}
      />

      <axesHelper args={[80]} position={[0, planeY + 0.2, 0]} />

      <Suspense fallback={null}>
        {parts
          .filter(part => appearances.get(part.id) !== 'hidden')
          .map(part => (
            <SchematicPart
              key={part.id}
              part={part}
              settings={settings}
              chaining={chainDraft !== null}
              onPinClick={onPinClick}
              setOrbitEnabled={setOrbitEnabled}
              colors={colors}
              dimmed={appearances.get(part.id) === 'dimmed'}
            />
          ))}
      </Suspense>

      <PathLines parts={parts} paths={paths} draft={chainDraft} visibleIds={visibleIds} />
      <FiberLines parts={parts} fibers={fibers} visibleIds={visibleIds} />
      {/* Lifted like the legacy overlay so in-plane beams (three.y == the
          working plane) never z-fight the grid; 0.8 mm is invisible at
          schematic scale. */}
      {settings.showRays && kernelHasTrace && (
        <group position={[0, 0.8, 0]}>
          <KernelRays3D />
        </group>
      )}
      {settings.showRays && !kernelHasTrace && simFreshness !== 'fresh' && (
        <RayOverlay planeZMm={settings.planeZMm} enabled />
      )}
      <AuthoritativeRays />
      <EscapeRays />
      <MeasureOverlay3D />

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
  // Resolved OUTSIDE the Canvas: MUI theme context does not cross the R3F
  // boundary. The canvas follows the light/dark toggle (round 3).
  const colors = useSceneColors();
  return (
    <Canvas
      camera={{ position: [0, 760, 480], near: 1, far: 30000, fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ alpha: false, preserveDrawingBuffer: true }}
      onPointerMissed={e => {
        if (e.target instanceof HTMLCanvasElement) selectPart(null);
      }}
    >
      <color attach="background" args={[colors.background]} />
      <SceneContent {...props} colors={colors} />
    </Canvas>
  );
}

/**
 * The assembly ("board") canvas — WP-16. Cube modules rendered from library
 * GLBs on the 50/50/55 mm grid, ghost boxes for parts without a bound
 * template, DRC billboards at offending parts, and constrained insert drag
 * for T2 translation DOFs (clamped to the declared range, written through
 * document setDofValue). Talks ONLY to src/document + serviceExport.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Billboard,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Line,
  OrbitControls,
  Text,
  useGLTF,
} from '@react-three/drei';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { DocPart, LayerAppearance, LibraryPaletteEntry, Vec3 } from '../../document';
import {
  captureUndo,
  classifyPart,
  commitUndo,
  docQuatToThree,
  interfaceKindOf,
  layerAppearance,
  layerRangeOf,
  libraryEntryOf,
  renderInfoOf,
  rot24Matrix,
  selectPart,
  setDofValue,
  useDocParts,
  useLayerStore,
  useSelectedPartId,
  UC2_GRID_MM,
} from '../../document';
import type { UndoToken } from '../../document';
import { GLYPH_COLORS } from '../schematic/colors';
import { SchematicGlyph } from '../schematic/glyphs';
import { beamAxesOf, glyphQuatOf } from '../schematic/ports';
import { GLBErrorBoundary } from '../../three/GLBErrorBoundary';
import type { PartMechanics, TranslationDof } from '../../model/dsn/serviceExport';
import type { Marker } from '../schematic/MarkerList';
import { useAssemblyStore } from './assemblyStore';
import { meshContentQuat } from './meshFrame';
import { useSceneColors } from '../../theme/sceneColors';

const NO_RAYCAST = () => null;

const toThree = (p: Vec3): [number, number, number] => [p[0], p[2], -p[1]];

const AXIS_VECTORS: Record<'x' | 'y' | 'z', Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

/**
 * WP-99: the same registry-first rule the body render uses, for the DOFs.
 * The exported service design carries no `dof:` block for a palette-placed
 * part, so `listPartMechanics` reports an empty list and every T2 insert
 * handle went missing. The palette entry has the template's declared DOFs.
 */
function entryTranslationDofs(
  partId: string,
  entry: LibraryPaletteEntry | null | undefined,
): TranslationDof[] {
  if (!entry) return [];
  const out: TranslationDof[] = [];
  for (const dof of entry.dofs) {
    if ((dof.kind ?? 'translation') !== 'translation') continue;
    if (dof.axis !== 'x' && dof.axis !== 'y' && dof.axis !== 'z') continue;
    if (!dof.range) continue;
    out.push({
      // `key` is only a React key and a reportClamp label — the dotted service
      // key is not reachable without an export.
      key: `${partId}.${dof.name}`,
      name: dof.name,
      axis: dof.axis,
      range: dof.range,
      unit: dof.unit || 'mm',
      value: 0,
      actuatable: Boolean(dof.actuatable),
    });
  }
  return out;
}

// ── GLB / ghost geometry ─────────────────────────────────────────────────────

function GLBModel({
  url,
  offset,
  meshFrame = '',
  dimmed = false,
}: {
  url: string;
  offset?: [number, number, number];
  /** WP-123: 'cube' (F3, needs the basis), 'record' (pre-rotated y-up,
   * render as-is), '' = undeclared legacy — detect a wrapper node. */
  meshFrame?: string;
  /** WP-65: render the mesh nearly transparent (dimmed layer). */
  dimmed?: boolean;
}) {
  const { scene } = useGLTF(url);
  const contentQuat = useMemo(
    () => meshContentQuat(meshFrame, scene.children),
    [scene, meshFrame],
  );
  const cloned = useMemo(() => {
    const c = skeletonClone(scene) as THREE.Group;
    if (dimmed) {
      const dim = (mat: THREE.Material) => {
        const m = mat.clone();
        m.transparent = true;
        m.opacity = 0.12;
        m.depthWrite = false;
        return m;
      };
      c.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(dim)
            : dim(mesh.material);
        }
      });
    }
    return c;
  }, [scene, dimmed]);
  return (
    <group position={offset}>
      <group quaternion={contentQuat}>
        <primitive object={cloned} />
      </group>
    </group>
  );
}

function GhostBox({
  color,
  label = 'no template',
  labelColor = '#ffb02e',
  opacity = 0.22,
  dimmed = false,
}: {
  color: string;
  label?: string;
  labelColor?: string;
  opacity?: number;
  /** WP-65: faded rendering on a dimmed layer. */
  dimmed?: boolean;
}) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[48, 48, 48]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={dimmed ? opacity * 0.3 : opacity}
          roughness={0.8}
        />
      </mesh>
      <lineSegments geometry={new THREE.EdgesGeometry(new THREE.BoxGeometry(48, 48, 48))}>
        <lineBasicMaterial color={color} transparent opacity={dimmed ? 0.25 : 1} />
      </lineSegments>
      <Billboard position={[0, 32, 0]}>
        <Text
          fontSize={6}
          color={labelColor}
          fillOpacity={dimmed ? 0.3 : 1}
          anchorX="center"
          outlineWidth={dimmed ? 0 : 0.4}
          outlineColor="#000000aa"
        >
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

// ── insert drag handle (T2 translation DOF) ──────────────────────────────────

function InsertHandle({ part, dof }: { part: DocPart; dof: TranslationDof }) {
  const reportClamp = useAssemblyStore(s => s.reportClamp);
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ startValue: number; grabT: number; undo: UndoToken } | null>(null);

  // The DOF axis in three-space: local axis → part rotation → doc→three.
  const axisThree = useMemo(() => {
    const local = AXIS_VECTORS[dof.axis];
    const doc = new THREE.Vector3(local[0], local[1], local[2]).applyQuaternion(
      new THREE.Quaternion(...part.worldPose.rotation),
    );
    return new THREE.Vector3(doc.x, doc.z, -doc.y).normalize();
  }, [dof.axis, part.worldPose.rotation]);

  const origin = useMemo(() => {
    const p = toThree(part.worldPose.positionMm);
    return new THREE.Vector3(p[0], p[1], p[2]);
  }, [part.worldPose.positionMm]);

  /** Parameter t along the axis line closest to the pointer ray. */
  const paramAlongAxis = useCallback(
    (e: ThreeEvent<PointerEvent>): number => {
      const ray = e.ray;
      // Closest point between the pointer ray and the axis line.
      const w0 = origin.clone().sub(ray.origin);
      const a = 1; // axis·axis
      const b = axisThree.dot(ray.direction);
      const c = 1; // dir·dir
      const d = axisThree.dot(w0);
      const eDot = ray.direction.dot(w0);
      const denom = a * c - b * b;
      if (Math.abs(denom) < 1e-9) return 0;
      return (b * eDot - c * d) / denom;
    },
    [origin, axisThree],
  );

  const [lo, hi] = dof.range;
  const value = dof.value;
  const handlePos = origin.clone().add(axisThree.clone().multiplyScalar(value));

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      selectPart(part.id);
      drag.current = { startValue: value, grabT: paramAlongAxis(e), undo: captureUndo() };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [part.id, value, paramAlongAxis],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d) return;
      e.stopPropagation();
      const t = paramAlongAxis(e);
      const raw = d.startValue + (t - d.grabT);
      const clamped = Math.min(hi, Math.max(lo, raw));
      if (raw < lo - 1e-6 || raw > hi + 1e-6) {
        reportClamp(part.id, dof.key, raw, dof.range);
      }
      const snapped = Math.round(clamped * 100) / 100;
      if (snapped !== value) setDofValue(part.id, dof.name, snapped);
    },
    [paramAlongAxis, lo, hi, value, part.id, dof, reportClamp],
  );

  const endDrag = useCallback((e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    // One undo step for the whole drag (no step when nothing changed).
    if (d.startValue !== value) commitUndo(d.undo);
  }, [value]);

  const railFrom = origin.clone().add(axisThree.clone().multiplyScalar(lo));
  const railTo = origin.clone().add(axisThree.clone().multiplyScalar(hi));

  return (
    <group>
      {/* travel rail */}
      <Line
        raycast={NO_RAYCAST}
        points={[railFrom.toArray(), railTo.toArray()]}
        color="#ffd24d"
        lineWidth={1.2}
        dashed
        dashSize={3}
        gapSize={2.5}
        transparent
        opacity={0.65}
      />
      {/* draggable insert proxy */}
      <mesh
        position={handlePos}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerOver={e => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'grab';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
        quaternion={new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          axisThree,
        )}
      >
        <cylinderGeometry args={[16, 16, 5, 32]} />
        <meshStandardMaterial
          color={hovered ? '#ffe08a' : '#ffd24d'}
          transparent
          opacity={hovered ? 0.85 : 0.55}
          roughness={0.4}
        />
      </mesh>
      <Billboard position={handlePos.clone().add(new THREE.Vector3(0, 14, 0))}>
        <Text fontSize={5.5} color="#ffd24d" anchorX="center" outlineWidth={0.4} outlineColor="#000000aa">
          {`${dof.name} = ${value.toFixed(2)} ${dof.unit}`}
        </Text>
      </Billboard>
    </group>
  );
}

// ── one assembly part ─────────────────────────────────────────────────────────

function AssemblyPart({
  part,
  mechanics,
  markers,
  unbound,
  dimmed = false,
}: {
  part: DocPart;
  mechanics: PartMechanics | undefined;
  markers: Marker[];
  /** WP-60: a bare optical symbol — not in a cube yet (≠ missing template). */
  unbound: boolean;
  /** WP-65: the part's layer is dimmed — low opacity, non-interactive. */
  dimmed?: boolean;
}) {
  const selectedId = useSelectedPartId();
  const selected = selectedId === part.id;
  const [hovered, setHovered] = useState(false);
  // T-rule rendering (WP-23): the cube SHELL always sits axis-aligned on the
  // grid (cell position + R24 only); the residual yaw / δ offsets show up on
  // the INSERT content inside it. DRC flags residuals on T1 shells as before.
  const shellPos = toThree([
    part.gridPose.cell[0] * UC2_GRID_MM[0],
    part.gridPose.cell[1] * UC2_GRID_MM[1],
    part.gridPose.cell[2] * UC2_GRID_MM[2],
  ]);
  const shellQuat = useMemo(() => {
    const docQuat = new THREE.Quaternion().setFromRotationMatrix(
      rot24Matrix(part.gridPose.rot24),
    );
    return docQuatToThree([docQuat.x, docQuat.y, docQuat.z, docQuat.w]);
  }, [part.gridPose.rot24]);
  // The insert (optical element) at its FULL world pose, incl. residuals.
  const insertPos = toThree(part.worldPose.positionMm);
  const insertQuat = useMemo(
    () => docQuatToThree(part.worldPose.rotation),
    [part.worldPose.rotation],
  );
  // Same convention as the schematic (WP-29): entry/exit axes + fold angle
  // come from the record ports, for palette and imported parts alike.
  const insertAxisQuat = useMemo(() => glyphQuatOf(part), [part]);
  const insertFoldDeg = useMemo(() => beamAxesOf(part).foldDeg, [part]);
  const render = renderInfoOf(part.libraryRef);
  const color = GLYPH_COLORS[part.category];
  // WP-99: the T-class comes from the PALETTE registry, not from the exported
  // service design. `bareComponentSpec` emits no `template:` block (WP-96's
  // convert.ts), so `mechanics.templateClass` is null for every palette-placed
  // part — which used to send them all down the "no template" ghost branch and
  // made `render.glbUrl` unreachable. `mechanics` stays as the fallback for
  // designs imported with a retained source YAML that DOES declare a template.
  const entry = libraryEntryOf(part.libraryRef);
  const templateClass = entry?.templateClass ?? mechanics?.templateClass ?? null;
  const partMarkers = markers.filter(m => m.partId === part.id);
  const locked = templateClass === 'fixed';
  // WP-92: a part with NO cube shell (unbound primitive or template-less
  // module) has nothing the T-rule could pin to the grid — its body renders
  // at the FULL world pose (discrete + residual yaw + δ), so typing yaw 55°
  // with snap off visibly sits at 55°, not the snapped 90°.
  const noShell = unbound || templateClass === null;
  const bodyOffset: [number, number, number] = noShell
    ? [insertPos[0] - shellPos[0], insertPos[1] - shellPos[1], insertPos[2] - shellPos[2]]
    : [0, 0, 0];
  const bodyQuat = noShell ? insertQuat : shellQuat;
  // WP-92: an interface part (plate / puzzle joint / baseplate) draws its
  // flat glyph AS the body, full size — before, the "no template" ghost cube
  // drew on top of a 0.55-scale glyph and the joints read as generic ghosts.
  const ifaceKind = useMemo(() => interfaceKindOf(part.libraryRef), [part.libraryRef]);
  const ifaceBody = ifaceKind !== null && !render.glbUrl;

  // WP-65: dimmed layers are non-interactive — without handlers R3F skips
  // raycasting these meshes entirely, so clicks fall through.
  const handlers = dimmed
    ? {}
    : {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          selectPart(part.id);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = locked ? 'not-allowed' : 'pointer';
        },
        onPointerOut: () => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        },
      };

  return (
    <group position={shellPos}>
      <group position={bodyOffset} quaternion={bodyQuat} {...handlers}>
        {ifaceBody ? (
          // WP-92: the flat interface glyph IS the body — no ghost cube to
          // occlude it, and at full size.
          <SchematicGlyph
            category={part.category}
            label={part.ref}
            foldDeg={null}
            dimmed={dimmed}
            interfaceKind={ifaceKind}
          />
        ) : render.glbUrl ? (
          // WP-99: a mesh always wins. This used to sit BELOW the two ghost
          // branches, so a housed (WP-67) part never showed its housing and a
          // palette-placed cube never showed its cube. Each fallback now says
          // which one it is — the shared "no template" label is what made this
          // bug take a full session to find.
          <GLBErrorBoundary fallback={<GhostBox color={color} label="mesh failed" dimmed={dimmed} />}>
            <Suspense fallback={<GhostBox color={color} label="loading…" dimmed={dimmed} />}>
              <GLBModel
                url={render.glbUrl}
                offset={render.glbOffset}
                meshFrame={render.meshFrame}
                dimmed={dimmed}
              />
            </Suspense>
          </GLBErrorBoundary>
        ) : unbound ? (
          // WP-60: an optical primitive with no mechanics at all — drawn as a
          // fainter "not in a cube yet" ghost, distinct from the missing-
          // template ghost (that one is a module whose mesh is absent).
          <GhostBox color={color} label="UNBOUND" labelColor="#7bdcff" opacity={0.08} dimmed={dimmed} />
        ) : templateClass === null ? (
          <GhostBox color={color} dimmed={dimmed} />
        ) : (
          <GhostBox color={color} label="no mesh" dimmed={dimmed} />
        )}
        {(selected || hovered) && (
          <mesh>
            <boxGeometry args={[52, 52, 52]} />
            <meshBasicMaterial
              color={selected ? '#FFAA00' : '#88CCFF'}
              wireframe
              transparent
              opacity={0.35}
            />
          </mesh>
        )}
      </group>

      {/* Insert content at the true world pose (residual yaw + δ visible
          against the axis-aligned shell). An interface part already drew its
          glyph as the body above — no 0.55-scale duplicate. */}
      {!ifaceBody && (
        <group position={[insertPos[0] - shellPos[0], insertPos[1] - shellPos[1], insertPos[2] - shellPos[2]]}>
          <group quaternion={insertQuat} scale={0.55}>
            <group quaternion={insertAxisQuat}>
              <SchematicGlyph
                category={part.category}
                label={part.ref}
                foldDeg={insertFoldDeg}
                dimmed={dimmed}
                interfaceKind={null}
              />
            </group>
          </group>
        </group>
      )}

      <Text
        position={[0, 34, 0]}
        fontSize={7}
        color={selected ? '#ffd24d' : '#aeb6c2'}
        fillOpacity={dimmed ? 0.35 : 1}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.4}
        outlineColor="#00000088"
      >
        {part.ref}
        {locked && selected ? '  🔒 T1' : ''}
      </Text>

      {/* DRC billboards */}
      {partMarkers.slice(0, 1).map(marker => (
        <Billboard key={marker.id} position={[0, 46, 0]}>
          <mesh raycast={NO_RAYCAST}>
            <circleGeometry args={[6, 24]} />
            <meshBasicMaterial color={marker.severity === 'error' ? '#e74c3c' : '#f2a33c'} />
          </mesh>
          <Text position={[0, 0, 0.1]} fontSize={8} color="#ffffff" anchorX="center" anchorY="middle">
            !
          </Text>
          <Text position={[9, 0, 0.1]} fontSize={5} color="#ff8f7d" anchorX="left" anchorY="middle">
            {marker.code}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}

// ── scene root ────────────────────────────────────────────────────────────────

interface AssemblySceneProps {
  mechanics: PartMechanics[];
  /** WP-60: library refs that are bare component ids (no module binds them). */
  unboundIds: ReadonlySet<string>;
  /** Locked 2.5D camera (WP-23): LMB is for parts; orbit on RMB only. */
  lockView: boolean;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef?: React.MutableRefObject<{ target: THREE.Vector3; update: () => void } | null>;
}

function CameraCapture({ cameraRef }: { cameraRef: AssemblySceneProps['cameraRef'] }) {
  const camera = useThree(s => s.camera);
  const scene = useThree(s => s.scene);
  const gl = useThree(s => s.gl);
  cameraRef.current = camera as THREE.PerspectiveCamera;
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__assemblyScene = scene;
    w.__assemblyGl = gl;
    w.__assemblyCamera = camera;
  }
  return null;
}

function SceneContent({ mechanics, unboundIds, lockView, cameraRef, controlsRef, colors }: AssemblySceneProps & { colors: ReturnType<typeof useSceneColors> }) {
  const parts = useDocParts();
  const markers = useAssemblyStore(s => s.markers);
  const mechanicsById = useMemo(
    () => new Map(mechanics.map(m => [m.partId, m])),
    [mechanics],
  );

  // WP-65: shared layer visibility — hidden layers unmount, dimmed layers
  // render faint and non-interactive (same rules as the schematic).
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
  // A part hidden while selected gets deselected (WP-65 delete guard).
  const selectedId = useSelectedPartId();
  useEffect(() => {
    if (selectedId && appearances.get(selectedId) === 'hidden') selectPart(null);
  }, [selectedId, appearances]);

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a929c', 0.75]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[250, 500, 250]} intensity={1.2} />
      <directionalLight position={[-200, 300, -250]} intensity={0.35} />

      <OrbitControls
        makeDefault
        ref={controlsRef as React.Ref<never>}
        enableDamping
        dampingFactor={0.12}
        minDistance={60}
        maxDistance={8000}
        maxPolarAngle={Math.PI * 0.495}
        mouseButtons={
          lockView
            ? {
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

      {/* Lines at cube boundaries: snapped shells land in cell centers. */}
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
        position={[UC2_GRID_MM[0] / 2, -UC2_GRID_MM[2] / 2, UC2_GRID_MM[1] / 2]}
      />
      <axesHelper args={[80]} position={[0, -UC2_GRID_MM[2] / 2 + 0.2, 0]} />

      <Suspense fallback={null}>
        {parts
          .filter(part => appearances.get(part.id) !== 'hidden')
          .map(part => (
            <AssemblyPart
              key={part.id}
              part={part}
              mechanics={mechanicsById.get(part.id)}
              markers={markers}
              unbound={unboundIds.has(part.libraryRef)}
              dimmed={appearances.get(part.id) === 'dimmed'}
            />
          ))}
      </Suspense>

      {/* T2 insert handles (outside the part groups: they position in world
          space). Only fully visible parts stay draggable (WP-65). */}
      {parts.map(part => {
        if (appearances.get(part.id) !== 'visible') return null;
        const mech = mechanicsById.get(part.id);
        const entry = libraryEntryOf(part.libraryRef);
        const tClass = entry?.templateClass ?? mech?.templateClass ?? null;
        if (tClass === 'fixed') return null;
        // WP-99: registry DOFs when the export carries none (palette-placed).
        const dofs = mech?.translationDofs.length
          ? mech.translationDofs
          : entryTranslationDofs(part.id, entry);
        return dofs.map(dof => (
          <InsertHandle
            key={`${part.id}-${dof.key}`}
            part={part}
            dof={{ ...dof, value: part.dofs.find(d => d.name === dof.name)?.value ?? dof.value }}
          />
        ));
      })}

      <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
        <GizmoViewport axisColors={['#e0533d', '#7cc142', '#2c8fff']} labelColor="#ffffff" />
      </GizmoHelper>
    </>
  );
}

export function AssemblyScene(props: AssemblySceneProps) {
  // Resolved outside the Canvas (MUI context doesn't cross R3F).
  const colors = useSceneColors();
  return (
    <Canvas
      camera={{ position: [340, 420, 520], near: 1, far: 30000, fov: 45 }}
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

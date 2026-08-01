/**
 * The binding canvas (WP-19, reworked in WP-31): the loaded part against a
 * toggleable ghost 50 mm cube at the origin. Translate/rotate via
 * TransformControls (with snapping); in datum mode a click on the part
 * surface authors an optical datum at the hit point along the face normal —
 * stored in the PART frame, so datums follow the part when it moves.
 *
 * Views: a single perspective viewport, or a linked 2×2 layout
 * (perspective + top/front/side orthographic, each flippable to its
 * opposite). All viewports render the same store state, so edits in any
 * view appear in all of them.
 *
 * Frames: the scene renders the CUBE frame as three-space with y up —
 * conversions to the document convention (z up): doc(x, y, z) =
 * three(x, −z, y).
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import {
  Billboard,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Line,
  OrbitControls,
  OrthographicCamera,
  Text,
  TransformControls,
} from '@react-three/drei';
import { Box, IconButton, Tooltip } from '@mui/material';
import { SwapVert as FlipIcon } from '@mui/icons-material';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { RefObject } from 'react';
import type { Vec3 } from '../../document';
import type { BindDatum, MeshTransform } from '../../model/bindRecord';
import {
  datumQuatToCubeQuat,
  datumToCube,
  docQuatToThree,
  snapToAxis,
  threePoseToDatum,
  threePoseToMeshTransform,
} from '../../model/bindRecord';
import { useBindStore } from './bindStore';
import { PreviewCanvas } from '../common/PreviewCanvas';
import { OpticGlyph, OpticsOverlay } from './OpticsOverlay';
import type { RecordDraft } from '../../model/componentRecord';
import { useSceneColors } from '../../theme/sceneColors';
import type { OrthoView } from './bindStore';

const NO_RAYCAST = () => null;

const threeToDoc = (v: THREE.Vector3): Vec3 => [v.x, -v.z, v.y];
const docToThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];

const KIND_COLORS: Record<string, string> = {
  source: '#e74c3c',
  sensor: '#546878',
  reflective: '#b8c4cc',
  front: '#69d2ff',
  back: '#ffd24d',
  custom: '#e478ff',
};

function GhostCube() {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(50, 50, 50)), []);
  return (
    <group>
      <mesh raycast={NO_RAYCAST}>
        <boxGeometry args={[50, 50, 50]} />
        <meshStandardMaterial color="#4aa3ff" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={NO_RAYCAST}>
        <lineBasicMaterial color="#4aa3ff" transparent opacity={0.5} />
      </lineSegments>
      {/* origin cross */}
      <axesHelper args={[30]} />
    </group>
  );
}

function DatumPin({ datum, transform }: { datum: BindDatum; transform: MeshTransform }) {
  // Part-frame datum → cube frame through the live mesh placement (WP-31):
  // moving or rotating the part carries the pin along.
  const world = datumToCube(datum, transform);
  const p = docToThree(world.pointMm);
  const dir = new THREE.Vector3(...docToThree(world.direction)).normalize();
  const tip = new THREE.Vector3(...p).add(dir.clone().multiplyScalar(12));
  const snap = snapToAxis(world.direction);
  const color = KIND_COLORS[datum.kind] ?? '#ffffff';
  const discQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir),
    [dir],
  );
  return (
    <group>
      <mesh position={p} raycast={NO_RAYCAST}>
        <sphereGeometry args={[1.6, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Line raycast={NO_RAYCAST} points={[p, tip.toArray()]} color={color} lineWidth={2} />
      <mesh position={tip} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)} raycast={NO_RAYCAST}>
        <coneGeometry args={[1.4, 4, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {datum.areaDiameterMm !== null && datum.areaDiameterMm > 0 && (
        <mesh position={p} quaternion={discQuat} raycast={NO_RAYCAST}>
          <ringGeometry args={[datum.areaDiameterMm / 2 - 0.4, datum.areaDiameterMm / 2, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Billboard position={[p[0], p[1] + 6, p[2]]}>
        <Text fontSize={4} color={color} anchorX="center" outlineWidth={0.3} outlineColor="#000000aa">
          {`${datum.name} (${snap.axis})`}
        </Text>
      </Billboard>
    </group>
  );
}

function PartMesh() {
  const glbBytes = useBindStore(s => s.glbBytes);
  const transform = useBindStore(s => s.transform);
  const mode = useBindStore(s => s.mode);
  const snap = useBindStore(s => s.snap);
  const setTransform = useBindStore(s => s.setTransform);
  const addDatum = useBindStore(s => s.addDatum);
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (!glbBytes) {
      setScene(null);
      return;
    }
    const loader = new GLTFLoader();
    const buffer = glbBytes.buffer.slice(
      glbBytes.byteOffset,
      glbBytes.byteOffset + glbBytes.byteLength,
    ) as ArrayBuffer;
    loader.parse(
      buffer,
      '',
      gltf => {
        setScene(gltf.scene);
        // WP-41: report the mesh bbox center (doc mm) for the fit-to-cube snap.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (!box.isEmpty()) {
          const c = box.getCenter(new THREE.Vector3());
          useBindStore.getState().reportMeshBbox(threeToDoc(c));
        }
      },
      err => {
        useBindStore.getState().setError(`GLB parse failed: ${String(err)}`);
      },
    );
  }, [glbBytes]);

  // Doc-frame transform → three: position (x, z, −y); rotation extrinsic ZXY
  // in doc axes ≈ three-order 'YXZ'… keep it simple and apply doc-axis
  // rotations explicitly (Rz then Rx then Ry, extrinsic, doc axes).
  const quaternion = useMemo(() => {
    const [rx, ry, rz] = transform.rotationDeg.map(v => (v * Math.PI) / 180);
    const q = new THREE.Quaternion();
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rz); // doc z = three y
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx); // doc x = three x
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), ry); // doc y = three −z
    // extrinsic Z·X·Y (schema offset-deg convention)
    q.copy(qz).multiply(qx).multiply(qy);
    return q;
  }, [transform.rotationDeg]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'datum' || !e.face || !groupRef.current) return;
    e.stopPropagation();
    // Convert the world hit into the PART frame (WP-31): datums belong to
    // the mesh and follow it through later transforms.
    const g = groupRef.current;
    const localPoint = g.worldToLocal(e.point.clone());
    const worldNormal = e.face.normal.clone().transformDirection(e.object.matrixWorld);
    const groupQuat = g.getWorldQuaternion(new THREE.Quaternion());
    const localNormal = worldNormal.applyQuaternion(groupQuat.invert()).normalize();
    addDatum(threeToDoc(localPoint), threeToDoc(localNormal));
  };

  const commitTransform = () => {
    const g = groupRef.current;
    if (!g) return;
    setTransform(threePoseToMeshTransform(g.position, g.quaternion));
  };

  if (!scene) return null;
  // WP-33 bug fix: the gizmo must attach to OUR group via the explicit
  // `object` prop. As a child of <TransformControls> the controls attach to
  // their own internal wrapper group instead — drags moved that throwaway
  // object, commitTransform read our never-moved group, and the part
  // "jumped back" when the gizmo unmounted (datum mode), silently recording
  // a stale mesh-offset. (AssemblyScene audited: its insert drag is custom
  // pointer math, no TransformControls — unaffected.)
  return (
    <>
      <group
        ref={groupRef}
        position={docToThree(transform.positionMm)}
        quaternion={quaternion}
        onClick={onClick}
      >
        <primitive object={scene} />
      </group>
      {mode !== 'datum' && mode !== 'optics' && (
        <TransformControls
          ref={controls => {
            // DEV probe: lets tests assert the gizmo is attached to OUR
            // group and simulate a drag commit (the WP-33 bug regression).
            if (import.meta.env.DEV) {
              (window as unknown as Record<string, unknown>).__bindTC = controls;
              (window as unknown as Record<string, unknown>).__bindPartGroup = groupRef.current;
            }
          }}
          object={groupRef as RefObject<THREE.Object3D>}
          mode={mode}
          translationSnap={snap ? 1 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
          onMouseUp={commitTransform}
        />
      )}
    </>
  );
}

/** One gizmo-placed optical primitive against the frozen module mesh (WP-41).
 * The overlay group IS the gizmo target; on commit its world pose becomes the
 * datum's part-frame point + direction + orientation quaternion. */
function PlacedOptic({
  datum,
  draft,
  selected,
}: {
  datum: BindDatum;
  draft?: RecordDraft;
  selected: boolean;
}) {
  const transform = useBindStore(s => s.transform);
  const mode = useBindStore(s => s.mode);
  const snap = useBindStore(s => s.snap);
  const updateDatum = useBindStore(s => s.updateDatum);
  const selectOptic = useBindStore(s => s.selectOptic);
  const showOptics = useBindStore(s => s.showOptics);
  const tiltDeg = useBindStore(s => s.opticTilt[datum.id] ?? 0);
  const gizmoMode = useBindStore(s => s.opticsGizmoMode);
  const groupRef = useRef<THREE.Group>(null);

  // Cube pose from the part-frame datum through the mesh placement.
  const cube = useMemo(() => datumToCube(datum, transform), [datum, transform]);
  const position = docToThree(cube.pointMm);
  const quaternion = useMemo(
    () =>
      datum.quaternion
        ? docQuatToThree(datumQuatToCubeQuat(datum.quaternion, transform))
        : new THREE.Quaternion(),
    [datum.quaternion, transform],
  );

  const commit = () => {
    const g = groupRef.current;
    if (!g) return;
    updateDatum(datum.id, threePoseToDatum(g.position, g.quaternion, transform));
  };

  if (!showOptics) return null;
  const gizmoOn = mode === 'optics' && selected;
  return (
    <>
      <group
        ref={groupRef}
        position={position}
        quaternion={quaternion}
        onClick={e => {
          if (mode === 'optics') {
            e.stopPropagation();
            selectOptic(datum.id);
          }
        }}
      >
        {draft && (
          <OpticGlyph
            category={draft.category}
            surfaces={draft.surfaces}
            diameterMm={datum.areaDiameterMm}
            galvoTiltDeg={tiltDeg}
          />
        )}
        {/* selection ring on the placement plane */}
        {gizmoOn && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
            <ringGeometry args={[(datum.areaDiameterMm ?? 20) / 2 + 1, (datum.areaDiameterMm ?? 20) / 2 + 2.5, 48]} />
            <meshBasicMaterial color="#ffaa00" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
      {gizmoOn && (
        <TransformControls
          object={groupRef as RefObject<THREE.Object3D>}
          mode={gizmoMode}
          // Local space: the rotation rings follow the optic's own axes, so
          // "rotate onto the face" reads intuitively (WP-41 follow-up).
          space={gizmoMode === 'rotate' ? 'local' : 'world'}
          translationSnap={snap ? 1 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
          onMouseUp={commit}
        />
      )}
    </>
  );
}

/** Shared scene content — identical in every viewport. */
function SceneContent({
  colors,
  draft,
}: {
  colors: ReturnType<typeof useSceneColors>;
  draft?: RecordDraft;
}) {
  const ghostCube = useBindStore(s => s.ghostCube);
  const datums = useBindStore(s => s.datums);
  const transform = useBindStore(s => s.transform);
  const selectedOpticId = useBindStore(s => s.selectedOpticId);
  const placed = datums.filter(d => d.quaternion);
  const clicked = datums.filter(d => !d.quaternion);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a929c', 0.8]} />
      <directionalLight position={[150, 250, 120]} intensity={1.1} />
      <directionalLight position={[-120, 150, -140]} intensity={0.4} />
      <Grid
        args={[500, 500]} cellSize={10} sectionSize={50}
        cellColor={colors.gridCell} sectionColor={colors.gridSection}
        position={[0, -25, 0]} infiniteGrid fadeDistance={1500}
      />
      {ghostCube && <GhostCube />}
      <Suspense fallback={null}>
        <PartMesh />
      </Suspense>
      {clicked.map(datum => (
        <DatumPin key={datum.id} datum={datum} transform={transform} />
      ))}
      {/* WP-41: gizmo-placed optics, each independently draggable. */}
      {placed.map(datum => (
        <PlacedOptic
          key={datum.id}
          datum={datum}
          draft={draft}
          selected={datum.id === selectedOpticId}
        />
      ))}
      {/* WP-40: the optical model drawn where a clicked datum sits. */}
      {draft && <OpticsOverlay draft={draft} />}
    </>
  );
}

/** Camera pose per orthographic view (three-space; doc z renders up). */
const ORTHO_POSES: Record<OrthoView, { normal: [number, number, number]; flipped: [number, number, number]; up: [number, number, number]; label: string; flipLabel: string }> = {
  top: { normal: [0, 300, 0], flipped: [0, -300, 0], up: [0, 0, -1], label: 'top', flipLabel: 'bottom' },
  front: { normal: [0, 0, 300], flipped: [0, 0, -300], up: [0, 1, 0], label: 'front', flipLabel: 'back' },
  side: { normal: [300, 0, 0], flipped: [-300, 0, 0], up: [0, 1, 0], label: 'right', flipLabel: 'left' },
};

function Viewport({ ortho, draft }: { ortho: OrthoView | null; draft?: RecordDraft }) {
  const mode = useBindStore(s => s.mode);
  const flip = useBindStore(s => (ortho ? s.orthoFlip[ortho] : false));
  const pose = ortho ? ORTHO_POSES[ortho] : null;
  // Resolved outside the Canvas (MUI context doesn't cross R3F).
  const colors = useSceneColors();
  return (
    // WP-92: quad view is FOUR live WebGL contexts, remounted on every
    // mechanics-tab flip — released synchronously via PreviewCanvas so the
    // browser's context cap never evicts the main scene canvases.
    <PreviewCanvas
      camera={ortho ? undefined : { position: [120, 100, 140], near: 0.5, far: 10000, fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ alpha: false, preserveDrawingBuffer: true }}
    >
      <color attach="background" args={[colors.background]} />
      {pose && (
        <OrthographicCamera
          makeDefault
          position={flip ? pose.flipped : pose.normal}
          up={pose.up}
          zoom={4}
          near={0.5}
          far={10000}
        />
      )}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enabled={mode !== 'datum'}
        enableRotate={!ortho}
      />
      <SceneContent colors={colors} draft={draft} />
      {!ortho && (
        <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
          <GizmoViewport axisColors={['#e0533d', '#7cc142', '#2c8fff']} labelColor="#ffffff" />
        </GizmoHelper>
      )}
    </PreviewCanvas>
  );
}

function OrthoCell({ view, draft }: { view: OrthoView; draft?: RecordDraft }) {
  const flip = useBindStore(s => s.orthoFlip[view]);
  const flipOrtho = useBindStore(s => s.flipOrtho);
  const pose = ORTHO_POSES[view];
  return (
    <Box sx={{ position: 'relative', borderLeft: '1px solid', borderTop: '1px solid', borderColor: 'divider' }}>
      <Viewport ortho={view} draft={draft} />
      <Tooltip title={`flip to ${flip ? pose.label : pose.flipLabel}`}>
        <IconButton
          size="small"
          onClick={() => flipOrtho(view)}
          sx={{
            position: 'absolute', top: 4, left: 4, zIndex: 5,
            bgcolor: 'background.paper', boxShadow: 2, fontSize: 11, borderRadius: 1, px: 0.75,
            border: '1px solid', borderColor: 'divider',
          }}
        >
          <FlipIcon sx={{ fontSize: 14, mr: 0.5 }} />
          {flip ? pose.flipLabel : pose.label}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export function BindScene({ draft }: { draft?: RecordDraft }) {
  const quadView = useBindStore(s => s.quadView);
  if (!quadView) return <Viewport ortho={null} draft={draft} />;
  // Linked 2×2: perspective + top / front / side, all rendering the same
  // store state — a gizmo drag or datum click in any view shows everywhere.
  return (
    <Box
      sx={{
        display: 'grid', width: '100%', height: '100%',
        gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <Viewport ortho={null} draft={draft} />
      </Box>
      <OrthoCell view="top" draft={draft} />
      <OrthoCell view="front" draft={draft} />
      <OrthoCell view="side" draft={draft} />
    </Box>
  );
}

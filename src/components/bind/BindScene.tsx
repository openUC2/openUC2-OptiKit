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
import { Canvas } from '@react-three/fiber';
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
import type { Vec3 } from '../../document';
import type { BindDatum, MeshTransform } from '../../model/bindRecord';
import { datumToCube, snapToAxis } from '../../model/bindRecord';
import { useBindStore } from './bindStore';
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
      gltf => setScene(gltf.scene),
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
    // Decompose back to doc-frame values: position directly; rotation via the
    // controls stays in our quaternion composition, so read the deltas from
    // the group's euler in the same doc-axis order.
    const p = g.position;
    const docPos: Vec3 = [
      Math.round(p.x * 100) / 100,
      Math.round(-p.z * 100) / 100,
      Math.round(p.y * 100) / 100,
    ];
    // Extract extrinsic doc-ZXY from the group quaternion: doc z=three y,
    // doc x=three x, doc y=three −z ⇒ three-order YXZ with sign flips.
    const e = new THREE.Euler().setFromQuaternion(g.quaternion, 'YXZ');
    const docRot: Vec3 = [
      Math.round(THREE.MathUtils.radToDeg(e.x) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(-e.z) * 10) / 10,
      Math.round(THREE.MathUtils.radToDeg(e.y) * 10) / 10,
    ];
    setTransform({ positionMm: docPos, rotationDeg: docRot });
  };

  if (!scene) return null;
  const content = (
    <group
      ref={groupRef}
      position={docToThree(transform.positionMm)}
      quaternion={quaternion}
      onClick={onClick}
    >
      <primitive object={scene} />
    </group>
  );

  if (mode === 'datum') return content;
  return (
    <TransformControls
      mode={mode}
      translationSnap={snap ? 1 : null}
      rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
      onMouseUp={commitTransform}
    >
      {content}
    </TransformControls>
  );
}

/** Shared scene content — identical in every viewport. */
function SceneContent({ colors }: { colors: ReturnType<typeof useSceneColors> }) {
  const ghostCube = useBindStore(s => s.ghostCube);
  const datums = useBindStore(s => s.datums);
  const transform = useBindStore(s => s.transform);
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
      {datums.map(datum => (
        <DatumPin key={datum.id} datum={datum} transform={transform} />
      ))}
    </>
  );
}

/** Camera pose per orthographic view (three-space; doc z renders up). */
const ORTHO_POSES: Record<OrthoView, { normal: [number, number, number]; flipped: [number, number, number]; up: [number, number, number]; label: string; flipLabel: string }> = {
  top: { normal: [0, 300, 0], flipped: [0, -300, 0], up: [0, 0, -1], label: 'top', flipLabel: 'bottom' },
  front: { normal: [0, 0, 300], flipped: [0, 0, -300], up: [0, 1, 0], label: 'front', flipLabel: 'back' },
  side: { normal: [300, 0, 0], flipped: [-300, 0, 0], up: [0, 1, 0], label: 'right', flipLabel: 'left' },
};

function Viewport({ ortho }: { ortho: OrthoView | null }) {
  const mode = useBindStore(s => s.mode);
  const flip = useBindStore(s => (ortho ? s.orthoFlip[ortho] : false));
  const pose = ortho ? ORTHO_POSES[ortho] : null;
  // Resolved outside the Canvas (MUI context doesn't cross R3F).
  const colors = useSceneColors();
  return (
    <Canvas
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
      <SceneContent colors={colors} />
      {!ortho && (
        <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
          <GizmoViewport axisColors={['#e0533d', '#7cc142', '#2c8fff']} labelColor="#ffffff" />
        </GizmoHelper>
      )}
    </Canvas>
  );
}

function OrthoCell({ view }: { view: OrthoView }) {
  const flip = useBindStore(s => s.orthoFlip[view]);
  const flipOrtho = useBindStore(s => s.flipOrtho);
  const pose = ORTHO_POSES[view];
  return (
    <Box sx={{ position: 'relative', borderLeft: '1px solid #2a3442', borderTop: '1px solid #2a3442' }}>
      <Viewport ortho={view} />
      <Tooltip title={`flip to ${flip ? pose.label : pose.flipLabel}`}>
        <IconButton
          size="small"
          onClick={() => flipOrtho(view)}
          sx={{
            position: 'absolute', top: 4, left: 4, zIndex: 5,
            bgcolor: 'rgba(23,28,36,0.8)', fontSize: 11, borderRadius: 1, px: 0.75,
          }}
        >
          <FlipIcon sx={{ fontSize: 14, mr: 0.5 }} />
          {flip ? pose.flipLabel : pose.label}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export function BindScene() {
  const quadView = useBindStore(s => s.quadView);
  if (!quadView) return <Viewport ortho={null} />;
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
        <Viewport ortho={null} />
      </Box>
      <OrthoCell view="top" />
      <OrthoCell view="front" />
      <OrthoCell view="side" />
    </Box>
  );
}

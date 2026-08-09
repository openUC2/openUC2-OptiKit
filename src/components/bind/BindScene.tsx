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
// NOTE: two functions share this name. bindRecord's is a LEFT MULTIPLY
// (QB·q, for F3-authored children); mapping's is the CONJUGATION
// (B·R·B⁻¹, for a rotation that must act in doc/cube axes above a
// content basis). WP-148 needs the conjugation — hence the alias.
import { DOC_AXIS_LABELS, axisText, docQuatToThree as docRotToViewer } from '../../document';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { hasWrapperRotation, meshContentQuat } from '../assembly/meshFrame';
import { insertPoseMatrix } from '../../model/bindRecord';
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

/** WP-121: doc(x, y, z) = three(x, −z, y) as a quaternion — the rotation
 * that stands doc-z-up (cube-frame) mesh content upright in three's y-up. */
const docToThree = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]];

const KIND_COLORS: Record<string, string> = {
  source: '#e74c3c',
  sensor: '#546878',
  reflective: '#b8c4cc',
  front: '#69d2ff',
  back: '#ffd24d',
  custom: '#e478ff',
};

/** The 1x1 cell. WP-114: 50 x 50 x 55 mm in DOC axes (CLAUDE.md / UC2_GRID_MM)
 * — three-space is y-up, so the 55 mm z pitch is the y extent here. It was
 * drawn as a 50 cube, which is why it vanished inside a real whole-cube mesh
 * and the toggle looked dead. */
function GhostCube() {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(50, 55, 50)), []);
  return (
    <group>
      <mesh raycast={NO_RAYCAST}>
        <boxGeometry args={[50, 55, 50]} />
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
          {`${datum.name} · ${axisText(snap.axis, 'cube')}`}
        </Text>
      </Billboard>
    </group>
  );
}

/** WP-117: the Inventor naming contract calls the cube body's two halves
 * `PRT - <n> - CUBHLF... ` — everything else in the export is the INSERT.
 * Hiding only the halves shows the insert in place. */
const CUBE_HALF_RE = /CUBHLF/i;

function PartMesh() {
  const glbBytes = useBindStore(s => s.glbBytes);
  const transform = useBindStore(s => s.transform);
  const mode = useBindStore(s => s.mode);
  const snap = useBindStore(s => s.snap);
  const showMesh = useBindStore(s => s.showMesh);
  const hideCubeHalves = useBindStore(s => s.hideCubeHalves);
  const setTransform = useBindStore(s => s.setTransform);
  const addDatum = useBindStore(s => s.addDatum);
  const meshFrameDetected = useBindStore(s => s.meshFrameDetected);
  const meshPoseGrid = useBindStore(s => s.meshPoseGrid);
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  // WP-114: where the pointer went down, so an ORBIT DRAG that happens to end
  // on the part is not mistaken for a datum click (datum mode now leaves the
  // camera free — see Viewport).
  const downAt = useRef<{ x: number; y: number } | null>(null);

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
        // WP-109: and its SIZE, so the emitted template declares the envelope
        // the mesh actually has instead of a guessed 50/50/55 — `library
        // validate` checks the two against each other now.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (!box.isEmpty()) {
          const c = box.getCenter(new THREE.Vector3());
          const s = box.getSize(new THREE.Vector3());
          // WP-120: FILE-NATIVE axes — exactly what optikit-core's
          // glb_bounding_box measures. The old [s.x, s.z, s.y] viewer swap
          // made the frontend and `library validate` disagree about which
          // axis carries the 55 mm (49.8 × 54.4 × 49.8 here vs
          // 49.8 × 49.8 × 54.4 there) and shipped swapped envelopes.
          useBindStore.getState().reportMeshBbox(
            [c.x, c.y, c.z],
            [Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)],
          );
          // WP-120: the two glTF conventions (mesh.py's W_MESH_AXES_PERMUTED)
          // — older exports carry an Rx(±90°) wrapper node that pre-rotates
          // the cube-frame content. Detect it so the emitted template can
          // DECLARE its mesh-frame instead of leaving validate guessing.
          // WP-132: ONE rule, shared with the assembly — the wrapper node is
          // often nested, and a depth-1 scan mis-declared seven shipped GLBs.
          const wrapper = hasWrapperRotation(gltf.scene.children);
          useBindStore.setState({ meshFrameDetected: wrapper ? 'record' : 'cube' });
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

  // WP-135: the SAME content-basis rule as the assembly (meshContentQuat):
  // 'cube' → B, 'record' → identity. The detector already ran at load.
  // WP-148: only the cube road splits — a housing has no "halves" to hold
  // still, and an identity pose would render two identical copies for
  // nothing. The pose ITSELF is the trigger: no pose, no turning.
  const insertPose = useBindStore(s => s.insertPose);
  const wholeModule = useBindStore(s => s.wholeModule);
  const insertQuatThree = useMemo(() => {
    if (!insertPose) return new THREE.Quaternion();
    const m = insertPoseMatrix(insertPose);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    return docRotToViewer([q.x, q.y, q.z, q.w]);
  }, [insertPose]);
  const splitInsert = Boolean(insertPose && wholeModule);

  const contentQuat = useMemo(
    () => meshContentQuat(meshFrameDetected ?? '', scene?.children ?? [], meshPoseGrid),
    [meshFrameDetected, scene, meshPoseGrid],
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if ((mode !== 'datum' && mode !== 'pose') || !e.face || !groupRef.current) return;
    // A drag is a camera move, not an authoring click.
    const from = downAt.current;
    downAt.current = null;
    if (from) {
      const moved = Math.hypot(e.nativeEvent.clientX - from.x, e.nativeEvent.clientY - from.y);
      if (moved > 4) return;
    }
    e.stopPropagation();
    // WP-116 pose mode: the click is a POSITION picker — it sets the insert
    // pose's origin in the CUBE frame (world/doc coords; the cube frame is
    // the scene frame). Never a direction oracle.
    if (mode === 'pose') {
      const p = threeToDoc(e.point.clone());
      useBindStore.getState().setInsertOffsetMm([
        Math.round(p[0] * 100) / 100,
        Math.round(p[1] * 100) / 100,
        Math.round(p[2] * 100) / 100,
      ]);
      return;
    }
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

  /**
   * WP-148: the insert TURNS, the cube does not.
   *
   * Round 22 and 23 asked for this twice: rotating the insert pose should
   * turn everything that is not a cube half, while the halves stay pins-up —
   * because that is what the hardware does. Only the optics overlay
   * previewed the pose before, so the mesh sat still and the user had to
   * imagine the result.
   *
   * The split renders the SAME loaded scene twice with complementary
   * visibility masks: the original carries the halves, a clone carries the
   * insert and hangs under the pose rotation. (A node's `visible` hides its
   * whole subtree, so the mask is decided per MESH by walking its ancestors
   * for the `CUBHLF` name — the halves are not always leaves.)
   */
  const insertClone = useMemo(
    () => (scene && splitInsert ? (skeletonClone(scene) as THREE.Object3D) : null),
    [scene, splitInsert],
  );

  const belongsToHalf = (node: THREE.Object3D): boolean => {
    for (let n: THREE.Object3D | null = node; n; n = n.parent) {
      if (CUBE_HALF_RE.test(n.name)) return true;
    }
    return false;
  };

  useEffect(() => {
    if (!scene) return;
    scene.traverse(node => {
      const half = CUBE_HALF_RE.test(node.name);
      if (half) node.visible = !hideCubeHalves;
      // When the insert is drawn by the clone, this copy shows halves only.
      else if (splitInsert && (node as THREE.Mesh).isMesh) {
        node.visible = belongsToHalf(node) ? !hideCubeHalves : false;
      }
    });
  }, [scene, hideCubeHalves, splitInsert]);

  useEffect(() => {
    if (!insertClone) return;
    insertClone.traverse(node => {
      if ((node as THREE.Mesh).isMesh) node.visible = !belongsToHalf(node);
    });
  }, [insertClone]);

  if (!scene || !showMesh) return null;
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
        onPointerDown={onPointerDown}
        onClick={onClick}
      >
        {/* WP-121/135: the doc→three basis, applied to CUBE-frame content —
            and ONLY to cube-frame content, by the same meshContentQuat rule
            the assembly uses. This was an unconditional B: a converted STP
            (the service emits y-up glTF with an Rx(−90°) wrapper) rendered
            double-rotated HERE while the assembly, honouring mesh-frame:
            record, drew it correctly — so the user posed the optic against
            a mesh the assembly would never show ("there seems to be an
            offset between the parts editor and the assembly view"). One
            rule, one place, both views. */}
        <group quaternion={contentQuat}>
          <primitive object={scene} />
        </group>
        {insertClone && (
          // The pose is a rotation in CUBE axes, and the group below maps
          // file→cube→viewer — so it enters CONJUGATED (B·R·B⁻¹), above the
          // content basis. Composed: B·R·M, i.e. the insert turned by R in
          // the cube frame. Pure display; the records never see it.
          <group quaternion={insertQuatThree}>
            <group quaternion={contentQuat}>
              <primitive object={insertClone} />
            </group>
          </group>
        )}
      </group>
      {mode !== 'datum' && mode !== 'optics' && mode !== 'pose' && (
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
            // WP-135: without the record's fold a gizmo-placed mirror drew a
            // plate square to the beam — a retro-reflector, the one thing a
            // fold mirror never is (the overlay learned this in WP-107; this
            // call site was missed).
            mountAngleDeg={draft.mirrorAngleDeg ?? 0}
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
      {/* WP-114: datum mode used to DISABLE the camera, so the only way to
          reach a face was the fixed ortho views — "we cannot move the glb
          freely". The camera stays live; PartMesh ignores a click that
          travelled more than a few pixels, so orbiting never drops a datum. */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        enableRotate={!ortho}
      />
      <SceneContent colors={colors} draft={draft} />
      {!ortho && (
        <GizmoHelper alignment="bottom-right" margin={[72, 88]}>
          {/* WP-130: this viewport shows the CUBE frame (z = the pin axis),
              so the triad must say z where three.js would say y. */}
          <GizmoViewport
            axisColors={['#e0533d', '#2c8fff', '#7cc142']}
            labels={DOC_AXIS_LABELS}
            labelColor="#ffffff"
          />
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

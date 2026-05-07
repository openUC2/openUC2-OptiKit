/**
 * PhysicalModuleOverlay - Konva layer for geometry-derived optical element icons.
 *
 * Instead of hand-drawn SVG thumbnails, every optical element is rendered from the
 * same physical model that drives the ray-tracer:
 *   - Mirror: line at the angle stored in params.angle
 *   - Lens:   biconvex / biconcave arcs sized by aperture and focal length sign
 *   - Beamsplitter / Dichroic: diagonal with partial transparency
 *   - Aperture: two blocking bars with an opening in the centre
 *   - Filter / Bandpass: coloured semi-transparent rectangle
 *   - Laser / LED: directional arrow
 *   - Detector: crosshatch active-area rectangle
 *   - Fluorescent: glowing green slab
 *   - Aquarium: rectangle half filled with blue
 *
 * Toggle via the `showPhysicalIcons` flag in SimulationConfig.
 */

import React, { useMemo } from 'react';
import { Group, Line, Rect, Arrow, Circle, Text } from 'react-konva';
import { useSimulationStore } from '../stores/simulationStore';
import { useAppStore } from '../stores/appStore';
import { MODULE_SIMULATION_MODELS } from '../types';
import { getModuleCenterSimCoords } from '../utils/sceneBuilder';
import type { SimPoint, ViewportConfig, OpticalElement } from '../types';

interface PhysicalModuleOverlayProps {
  viewport: ViewportConfig;
  gridCellSize: number;
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/** Simulation mm → canvas pixels */
function simToCanvas(pt: SimPoint, gridCellSize: number): { x: number; y: number } {
  const scale = gridCellSize / 50;
  return { x: pt.x * scale, y: pt.y * scale };
}

/** Rotation offset applied to all Konva shapes (Konva: 0° = right; we keep that) */

// ---------------------------------------------------------------------------
// Individual shape renderers
// ---------------------------------------------------------------------------

export interface ElementShapeProps {
  el: OpticalElement;
  gridCellSize: number;
  /** pixel size of one grid cell – used to scale aperture etc. */
  cellPx: number;
}

function LensShape({ el, gridCellSize, cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const aperture = (el.params.aperture || 25) * gridCellSize / 50;
  const focalLength = el.params.focalLength ?? 100;
  const positive = focalLength > 0;
  const halfA = aperture / 2;

  // Principal plane offset: shift the lens icon along the optical axis
  const ppOffset = (el.params.principalPlaneOffset ?? 0) * gridCellSize / 50;

  // Scale bulge inversely with focal length (shorter fl = more curvature)
  // Nominal bulge at fl=100mm; clamped to avoid extreme shapes
  const fAbsNorm = Math.min(3, 100 / Math.abs(focalLength)); // 1× at 100mm, 2× at 50mm, etc.
  const bulge = Math.min(halfA * 0.55, cellPx * 0.35) * Math.max(0.15, fAbsNorm);

  const lineW = 2;
  const color = '#5dade2';

  if (positive) {
    // Biconvex: both surfaces bow OUTWARD from the centre line.
    // Left surface control point bulges LEFT (−x), right surface bulges RIGHT (+x).
    // The two arcs share endpoints at (0, ±halfA) so no closing lines are needed.
    return (
      <Group x={cx.x} y={cx.y} rotation={el.rotation} offsetX={-ppOffset}>
        {/* Left convex surface: top-centre → left bulge → bottom-centre */}
        <Line
          points={[0, -halfA, -bulge, 0, 0, halfA]}
          stroke={color}
          strokeWidth={lineW}
          tension={0.5}
          lineCap="round"
        />
        {/* Right convex surface: top-centre → right bulge → bottom-centre */}
        <Line
          points={[0, -halfA, bulge, 0, 0, halfA]}
          stroke={color}
          strokeWidth={lineW}
          tension={0.5}
          lineCap="round"
        />
        {/* Optical axis tick */}
        <Line points={[-cellPx * 0.2, 0, cellPx * 0.2, 0]} stroke={color} strokeWidth={1} dash={[4, 3]} opacity={0.5} />
      </Group>
    );
  } else {
    // Biconcave: flat edges at ±bulge/2, surfaces bow INWARD toward the centre.
    const edge = bulge * 0.6; // half-thickness at the flat edges
    return (
      <Group x={cx.x} y={cx.y} rotation={el.rotation} offsetX={-ppOffset}>
        {/* Left concave surface: top-left → centre → bottom-left */}
        <Line
          points={[-edge, -halfA, 0, 0, -edge, halfA]}
          stroke={color} strokeWidth={lineW} tension={0.5} lineCap="round"
        />
        {/* Right concave surface: top-right → centre → bottom-right */}
        <Line
          points={[edge, -halfA, 0, 0, edge, halfA]}
          stroke={color} strokeWidth={lineW} tension={0.5} lineCap="round"
        />
        {/* Top and bottom flat closing lines */}
        <Line points={[-edge, -halfA, edge, -halfA]} stroke={color} strokeWidth={lineW} />
        <Line points={[-edge,  halfA, edge,  halfA]} stroke={color} strokeWidth={lineW} />
        <Line points={[-cellPx * 0.2, 0, cellPx * 0.2, 0]} stroke={color} strokeWidth={1} dash={[4, 3]} opacity={0.5} />
      </Group>
    );
  }
}

function MirrorShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const aperture = (el.params.aperture || 25) * gridCellSize / 50;
  const halfA = aperture / 2;
  // The surface angle in world space — mirrors use angle=-45 convention
  // (positive x-axis rotated by (rotation - mirrorAngle) so a '/' surface at default).
  // Keep canvas icon consistent with simulation: surface direction = rotation - angle.
  const surfaceAngle = el.rotation - (el.params.angle ?? -45);

  return (
    <Group x={cx.x} y={cx.y} rotation={surfaceAngle}>
      {/* Reflective surface line */}
      <Line points={[0, -halfA, 0, halfA]} stroke="#e8e8e8" strokeWidth={3} lineCap="round" />
      {/* Backing hatching (indicates solid side — always offset to one side) */}
      {[-halfA * 0.6, -halfA * 0.2, halfA * 0.2, halfA * 0.6].map((y, i) => (
        <Line key={i} points={[0, y, 5, y + 5]} stroke="#999" strokeWidth={1} opacity={0.7} />
      ))}
      {/* Normal arrow showing reflection direction */}
      <Arrow points={[0, 0, -8, 0]} pointerLength={4} pointerWidth={3} fill="#c0c0c0" stroke="#c0c0c0" strokeWidth={1} opacity={0.7} />
    </Group>
  );
}

function BeamSplitterShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const aperture = (el.params.aperture || 25) * gridCellSize / 50;
  const halfA = aperture / 2;
  const bsAngle = (el.params.angle || 45) + el.rotation;

  return (
    <Group x={cx.x} y={cx.y} rotation={bsAngle}>
      {/* Diagonal beamsplitter line – dashed to indicate partial transmission */}
      <Line
        points={[0, -halfA, 0, halfA]}
        stroke="#a29bfe" strokeWidth={2}
        dash={[4, 4]}
        lineCap="round"
        opacity={0.9}
      />
      {/* Cube border */}
      <Rect x={-halfA} y={-halfA} width={aperture} height={aperture}
        stroke="#a29bfe" strokeWidth={1} opacity={0.3}
        cornerRadius={2}
      />
    </Group>
  );
}

function DichroicShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const aperture = (el.params.aperture || 25) * gridCellSize / 50;
  const halfA = aperture / 2;
  const angle = 45 + el.rotation;
  const transmitAbove = el.params.transmitAbove !== false;
  const cutoff = el.params.cutoffWavelength || 510;
  // Approximate colour from cutoff wavelength (very rough)
  const hue = Math.round(((cutoff - 380) / (750 - 380)) * 270);
  const color = `hsl(${hue}, 90%, 60%)`;

  return (
    <Group x={cx.x} y={cx.y} rotation={angle}>
      <Line
        points={[0, -halfA, 0, halfA]}
        stroke={color} strokeWidth={3}
        lineCap="round"
        opacity={0.85}
      />
      <Text
        text={transmitAbove ? 'LP' : 'SP'}
        x={4} y={-7}
        fontSize={9} fill={color} fontStyle="bold"
        rotation={-angle}
      />
    </Group>
  );
}

function ApertureShape({ el, gridCellSize, cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const innerAperture = (el.params.aperture || 5) * gridCellSize / 50;
  const outerH = cellPx * 0.45;
  const blockW = cellPx * 0.18;

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      {/* Top blocking bar */}
      <Rect x={-blockW / 2} y={-outerH} width={blockW} height={outerH - innerAperture / 2}
        fill="#555" opacity={0.8}
      />
      {/* Bottom blocking bar */}
      <Rect x={-blockW / 2} y={innerAperture / 2} width={blockW} height={outerH - innerAperture / 2}
        fill="#555" opacity={0.8}
      />
      {/* Centre opening outline */}
      <Line points={[-blockW / 2, -innerAperture / 2, -blockW / 2, innerAperture / 2]}
        stroke="#aaa" strokeWidth={1}
      />
      <Line points={[blockW / 2, -innerAperture / 2, blockW / 2, innerAperture / 2]}
        stroke="#aaa" strokeWidth={1}
      />
    </Group>
  );
}

function FilterShape({ el, gridCellSize, cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const w = cellPx * 0.12;
  const h = (el.params.aperture || 25) * gridCellSize / 50;
  const center = el.params.bandpassCenter || 525;
  const hue = Math.round(((center - 380) / (750 - 380)) * 270);

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      <Rect
        x={-w / 2} y={-h / 2} width={w} height={h}
        fill={`hsl(${hue}, 80%, 55%)`} opacity={0.7}
        stroke={`hsl(${hue}, 80%, 35%)`} strokeWidth={1}
        cornerRadius={2}
      />
    </Group>
  );
}

function SourceShape({ el, gridCellSize, cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const wavelength = el.params.wavelength || 532;
  const hue = Math.round(((wavelength - 380) / (750 - 380)) * 270);
  const color = `hsl(${hue}, 90%, 60%)`;
  const isLaser = el.type === 'laser';
  const arrowLen = cellPx * 0.4;

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      {/* Source body dot */}
      <Circle radius={cellPx * 0.12} fill={color} opacity={0.9} />
      {/* Emission arrow */}
      <Arrow
        points={[0, 0, arrowLen, 0]}
        pointerLength={5} pointerWidth={4}
        fill={color} stroke={color} strokeWidth={1.5}
        opacity={0.85}
      />
      {isLaser && (
        /* Collimation lines for laser */
        <>
          <Line points={[2, -cellPx * 0.07, arrowLen - 2, -cellPx * 0.07]}
            stroke={color} strokeWidth={1} opacity={0.5}
          />
          <Line points={[2, cellPx * 0.07, arrowLen - 2, cellPx * 0.07]}
            stroke={color} strokeWidth={1} opacity={0.5}
          />
        </>
      )}
    </Group>
  );
}

function DetectorShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const w = (el.params.width || 12) * gridCellSize / 50;
  const h = Math.max(4, (el.params.height || 8) * gridCellSize / 50);

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h}
        fill="#2d3436" opacity={0.7}
        stroke="#636e72" strokeWidth={1.5}
        cornerRadius={1}
      />
      {/* Crosshatch indicating active area */}
      <Line points={[-w / 2, -h / 2, w / 2, h / 2]} stroke="#74b9ff" strokeWidth={1} opacity={0.6} />
      <Line points={[w / 2, -h / 2, -w / 2, h / 2]} stroke="#74b9ff" strokeWidth={1} opacity={0.6} />
      <Circle x={0} y={0} radius={2} fill="#74b9ff" opacity={0.8} />
    </Group>
  );
}

function FluorescentShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const sz = (el.params.aperture || 25) * gridCellSize / 50;
  const emWL = el.params.emissionWavelength || 525;
  const hue = Math.round(((emWL - 380) / (750 - 380)) * 270);

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      {/* Outer glow halo */}
      <Rect x={-sz * 0.7} y={-sz * 0.7} width={sz * 1.4} height={sz * 1.4}
        fill={`hsl(${hue}, 90%, 60%)`} opacity={0.12}
        cornerRadius={4}
      />
      {/* Sample body */}
      <Rect x={-sz / 2} y={-sz / 2} width={sz} height={sz}
        fill={`hsl(${hue}, 70%, 40%)`} opacity={0.55}
        stroke={`hsl(${hue}, 90%, 55%)`} strokeWidth={1.5}
        cornerRadius={2}
      />
    </Group>
  );
}

function AquariumPhysicalShape({ el, gridCellSize, cellPx: _cellPx }: ElementShapeProps) {
  const cx = simToCanvas(el.position, gridCellSize);
  const sz = (el.params.aperture || 50) * gridCellSize / 50;
  const fillFraction = el.params.fillFraction ?? 0.5;

  return (
    <Group x={cx.x} y={cx.y} rotation={el.rotation}>
      {/* Container wall */}
      <Rect x={-sz / 2} y={-sz / 2} width={sz} height={sz}
        stroke="#0984e3" strokeWidth={2} fill="transparent"
        cornerRadius={2}
      />
      {/* Filled (absorbing) half – from bottom */}
      <Rect
        x={-sz / 2}
        y={sz / 2 - sz * fillFraction}
        width={sz} height={sz * fillFraction}
        fill="#0984e3" opacity={0.35}
        cornerRadius={1}
      />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function ElementShape(props: ElementShapeProps) {
  switch (props.el.type) {
    case 'lens':        return <LensShape {...props} />;
    case 'mirror':      return <MirrorShape {...props} />;
    case 'beamsplitter': return <BeamSplitterShape {...props} />;
    case 'dichroic':    return <DichroicShape {...props} />;
    case 'aperture':    return <ApertureShape {...props} />;
    case 'filter':      return <FilterShape {...props} />;
    case 'laser':
    case 'led':         return <SourceShape {...props} />;
    case 'detector':    return <DetectorShape {...props} />;
    case 'fluorescent': return <FluorescentShape {...props} />;
    case 'aquarium':    return <AquariumPhysicalShape {...props} />;
    default:            return null;
  }
}

// ---------------------------------------------------------------------------
// Main overlay component
// ---------------------------------------------------------------------------

export const PhysicalModuleOverlay: React.FC<PhysicalModuleOverlayProps> = ({
  viewport: _viewport,
  gridCellSize,
}) => {
  const { config, elements } = useSimulationStore();
  const { modules, placedModules } = useAppStore();

  // Build elements for any placed module that doesn't have an explicit OpticalElement yet
  // (simulation may not have run). We compute positions from placed modules directly.
  const physicalElements = useMemo((): OpticalElement[] => {
    // If the simulation has generated elements, use those (authoritative positions + rotations).
    if (elements.length > 0) return elements;

    // Fallback: synthesise elements from placed modules using simulation model defaults.
    const defMap = new Map(modules.map(m => [m.id, m]));
    const result: OpticalElement[] = [];

    for (const pm of placedModules) {
      const def = defMap.get(pm.moduleId);
      if (!def) continue;
      const model = MODULE_SIMULATION_MODELS[pm.moduleId];
      if (!model || model.elementType === 'compound') continue;

      const center = getModuleCenterSimCoords(pm, def, 50);
      let effectiveRotation = ((pm.rotation + (model.rotationOffset ?? 0)) % 360 + 360) % 360;

      // Apply intra-cube placement offsets from the module definition (sourced from CSV).
      const po = def.placementOffset;
      if (po) {
        if (po.rzOffset_deg) {
          effectiveRotation = ((effectiveRotation + po.rzOffset_deg) % 360 + 360) % 360;
        }
        if (po.dz_mm || po.dx_mm) {
          const facingRad = (effectiveRotation * Math.PI) / 180;
          center.x += Math.cos(facingRad) * po.dz_mm - Math.sin(facingRad) * po.dx_mm;
          center.y += Math.sin(facingRad) * po.dz_mm + Math.cos(facingRad) * po.dx_mm;
        }
      }

      result.push({
        id: `phy-${pm.id}`,
        moduleInstanceId: pm.id,
        type: model.elementType,
        position: center,
        rotation: effectiveRotation,
        params: { ...model.defaultParams, ...(pm.params ?? {}) } as OpticalElement['params'],
      });
    }
    return result;
  }, [elements, modules, placedModules]);

  if (!config.enabled || !config.showPhysicalIcons) return null;

  return (
    <>
      {physicalElements.map(el => (
        <ElementShape
          key={el.id}
          el={el}
          gridCellSize={gridCellSize}
          cellPx={gridCellSize}
        />
      ))}
    </>
  );
};

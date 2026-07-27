/**
 * SimulationEngine - 2D Geometric Ray Tracing Engine
 * 
 * Implements paraxial ray tracing for the OptiKit configurator.
 * This is an in-browser implementation that handles:
 * - Ray generation from sources (laser/LED)
 * - Ray-surface intersections (lenses, mirrors, beam splitters)
 * - Refraction and reflection calculations
 * - Detector hit detection and intensity accumulation
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  OpticalElement,
  SimPoint,
  RayPath,
  RaySegment,
  DetectorReading,
  SimulationConfig,
  SimulationResult,
  SimulationWarning,
  SimulationError
} from '../types';

// Small value for numerical comparisons
const EPSILON = 1e-10;
const RAY_LENGTH_LIMIT = 10000; // Maximum ray travel distance in mm

/**
 * 2D Vector operations
 */
interface Vec2 {
  x: number;
  y: number;
}

function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function vec2Length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len < EPSILON) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function vec2Rotate(v: Vec2, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos
  };
}

function vec2Perpendicular(v: Vec2): Vec2 {
  return { x: -v.y, y: v.x };
}

/**
 * Ray representation during tracing
 */
interface Ray {
  origin: SimPoint;
  direction: Vec2; // Normalized
  wavelength: number;
  intensity: number;
  id: string;
  bounceCount: number;
  totalDistance: number;
}

/**
 * Intersection result
 */
interface Intersection {
  point: SimPoint;
  distance: number;
  normal: Vec2;
  element: OpticalElement;
  entering: boolean; // True if ray is entering the element
}

/**
 * Generate rays from a light source element
 */
function generateSourceRays(source: OpticalElement, config: SimulationConfig): Ray[] {
  const rays: Ray[] = [];
  const params = source.params;
  const rayCount = params.rayCount || config.maxRays;
  const wavelength = params.wavelength || config.wavelength;
  const divergence = params.divergence || 0;
  const beamDiameter = params.beamDiameter || 2;
  const power = params.power || 1;
  
  // Direction vector based on element rotation (0 = +x direction)
  const baseDirection = vec2Rotate({ x: 1, y: 0 }, source.rotation);
  
  // Generate rays
  for (let i = 0; i < rayCount; i++) {
    // Distribute rays across beam diameter
    const offset = rayCount > 1 
      ? (i / (rayCount - 1) - 0.5) * beamDiameter 
      : 0;
    
    // Perpendicular offset from beam center
    const perpDir = vec2Perpendicular(baseDirection);
    const origin: SimPoint = {
      x: source.position.x + perpDir.x * offset,
      y: source.position.y + perpDir.y * offset
    };
    
    // Apply divergence if LED/divergent source
    let direction: Vec2;
    if (divergence > 0 && rayCount > 1) {
      // Fan out rays based on divergence angle
      const divergenceAngle = (i / (rayCount - 1) - 0.5) * 2 * divergence;
      direction = vec2Rotate(baseDirection, divergenceAngle);
    } else {
      direction = baseDirection;
    }
    
    rays.push({
      origin,
      direction: vec2Normalize(direction),
      wavelength,
      intensity: power / rayCount,
      id: uuidv4(),
      bounceCount: 0,
      totalDistance: 0
    });
  }
  
  return rays;
}

/**
 * Calculate ray-line segment intersection (for mirrors, detectors)
 */
function rayLineIntersection(
  ray: Ray,
  lineStart: SimPoint,
  lineEnd: SimPoint
): { point: SimPoint; distance: number; normal: Vec2 } | null {
  const lineDir = vec2Sub(lineEnd, lineStart);
  const lineLen = vec2Length(lineDir);
  if (lineLen < EPSILON) return null;
  
  const lineNorm = vec2Normalize(lineDir);
  const linePerpNorm = vec2Perpendicular(lineNorm);
  
  // Check if ray is parallel to line
  const denom = vec2Dot(ray.direction, linePerpNorm);
  if (Math.abs(denom) < EPSILON) return null;
  
  // Calculate intersection parameter
  const toStart = vec2Sub(lineStart, ray.origin);
  const t = vec2Dot(toStart, linePerpNorm) / denom;
  
  // Ray must go forward
  if (t < EPSILON) return null;
  
  // Calculate intersection point
  const point: SimPoint = {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t
  };
  
  // Check if intersection is within line segment
  const toPoint = vec2Sub(point, lineStart);
  const projLen = vec2Dot(toPoint, lineNorm);
  if (projLen < -EPSILON || projLen > lineLen + EPSILON) return null;
  
  // Determine normal direction (facing the ray)
  let normal = linePerpNorm;
  if (vec2Dot(normal, ray.direction) > 0) {
    normal = vec2Scale(normal, -1);
  }
  
  return { point, distance: t, normal };
}

/**
 * Calculate ray intersection with a thin lens (simplified model)
 * The lens is treated as a vertical line at the lens position
 */
function rayLensIntersection(
  ray: Ray,
  element: OpticalElement
): Intersection | null {
  const aperture = element.params.aperture || 25;
  const halfAperture = aperture / 2;
  
  // Lens is a vertical line centered at element position, rotated by element.rotation
  const lensNormal = vec2Rotate({ x: 1, y: 0 }, element.rotation);
  const lensDir = vec2Perpendicular(lensNormal);
  
  const lineStart: SimPoint = {
    x: element.position.x - lensDir.x * halfAperture,
    y: element.position.y - lensDir.y * halfAperture
  };
  const lineEnd: SimPoint = {
    x: element.position.x + lensDir.x * halfAperture,
    y: element.position.y + lensDir.y * halfAperture
  };
  
  const hit = rayLineIntersection(ray, lineStart, lineEnd);
  if (!hit) return null;
  
  return {
    point: hit.point,
    distance: hit.distance,
    normal: hit.normal,
    element,
    entering: vec2Dot(ray.direction, hit.normal) < 0
  };
}

/**
 * Calculate ray intersection with a mirror
 * Uses params.angle (degrees from +X of horizontal) for surface orientation.
 * angle=45 → redirects +X beam to +Y (standard diagonal mirror).
 * angle=90 → vertical surface, retro-reflects +X beams.
 */
function rayMirrorIntersection(
  ray: Ray,
  element: OpticalElement
): Intersection | null {
  const aperture = element.params.aperture || 25;
  const halfAperture = aperture / 2;
  
  // Mirror surface direction: surface runs in direction (rotation - mirrorAngle) from +X.
  // With default angle=-45, surface = rotate(1,0, rotation+45) = '/' shape, which
  // reflects a downward (+Y screen) beam to the LEFT (-X) as physically expected.
  const mirrorAngle = element.params.angle ?? -45;
  const mirrorDir = vec2Rotate({ x: 1, y: 0 }, element.rotation - mirrorAngle);
  
  const lineStart: SimPoint = {
    x: element.position.x - mirrorDir.x * halfAperture,
    y: element.position.y - mirrorDir.y * halfAperture
  };
  const lineEnd: SimPoint = {
    x: element.position.x + mirrorDir.x * halfAperture,
    y: element.position.y + mirrorDir.y * halfAperture
  };
  
  const hit = rayLineIntersection(ray, lineStart, lineEnd);
  if (!hit) return null;
  
  return {
    point: hit.point,
    distance: hit.distance,
    normal: hit.normal,
    element,
    entering: true
  };
}

/**
 * Calculate ray intersection with a detector
 */
function rayDetectorIntersection(
  ray: Ray,
  element: OpticalElement
): Intersection | null {
  const width = element.params.width || element.params.aperture || 12;
  const halfWidth = width / 2;
  
  // Detector surface perpendicular to rotation direction
  const detectorDir = vec2Rotate({ x: 0, y: 1 }, element.rotation);
  
  const lineStart: SimPoint = {
    x: element.position.x - detectorDir.x * halfWidth,
    y: element.position.y - detectorDir.y * halfWidth
  };
  const lineEnd: SimPoint = {
    x: element.position.x + detectorDir.x * halfWidth,
    y: element.position.y + detectorDir.y * halfWidth
  };
  
  const hit = rayLineIntersection(ray, lineStart, lineEnd);
  if (!hit) return null;
  
  return {
    point: hit.point,
    distance: hit.distance,
    normal: hit.normal,
    element,
    entering: true
  };
}

/**
 * Calculate ray intersection with a beam splitter
 * Beam splitter is oriented at an angle (default 45°) relative to element rotation
 */
function rayBeamSplitterIntersection(
  ray: Ray,
  element: OpticalElement
): Intersection | null {
  const aperture = element.params.aperture || 25;
  const halfAperture = aperture / 2;
  
  // Beam splitter angle: default 45° for 90° reflection
  const bsAngle = element.params.angle || 45;
  
  // The beam splitter surface is rotated by bsAngle relative to element rotation
  // At 45°, incoming +X ray reflects to +Y
  const surfaceRotation = element.rotation + bsAngle;
  const bsDir = vec2Rotate({ x: 0, y: 1 }, surfaceRotation);
  
  const lineStart: SimPoint = {
    x: element.position.x - bsDir.x * halfAperture,
    y: element.position.y - bsDir.y * halfAperture
  };
  const lineEnd: SimPoint = {
    x: element.position.x + bsDir.x * halfAperture,
    y: element.position.y + bsDir.y * halfAperture
  };
  
  const hit = rayLineIntersection(ray, lineStart, lineEnd);
  if (!hit) return null;
  
  return {
    point: hit.point,
    distance: hit.distance,
    normal: hit.normal,
    element,
    entering: vec2Dot(ray.direction, hit.normal) < 0
  };
}

/**
 * Calculate ray intersection with an aperture (iris/pinhole)
 */
function rayApertureIntersection(
  ray: Ray,
  element: OpticalElement
): Intersection | null {
  // Aperture blocks rays outside its diameter, passes rays inside
  // For simplicity, we model it as a line with a gap
  const outerAperture = 50; // Outer blocking area
  const innerAperture = element.params.aperture || 5;
  
  // Check if ray passes through the aperture opening
  const apertureNormal = vec2Rotate({ x: 1, y: 0 }, element.rotation);
  const apertureDir = vec2Perpendicular(apertureNormal);
  
  // Calculate intersection with aperture plane
  const denom = vec2Dot(ray.direction, apertureNormal);
  if (Math.abs(denom) < EPSILON) return null;
  
  const toCenter = vec2Sub(element.position, ray.origin);
  const t = vec2Dot(toCenter, apertureNormal) / denom;
  if (t < EPSILON) return null;
  
  const point: SimPoint = {
    x: ray.origin.x + ray.direction.x * t,
    y: ray.origin.y + ray.direction.y * t
  };
  
  // Distance from aperture center along aperture direction
  const offset = vec2Sub(point, element.position);
  const lateralDist = Math.abs(vec2Dot(offset, apertureDir));
  
  // If within aperture opening, ray passes through (no intersection for blocking)
  if (lateralDist < innerAperture / 2) {
    return null; // Ray passes through
  }
  
  // If outside outer aperture, ray misses entirely
  if (lateralDist > outerAperture / 2) {
    return null;
  }
  
  // Ray hits the blocking part of the aperture
  return {
    point,
    distance: t,
    normal: apertureNormal,
    element,
    entering: true
  };
}

/**
 * Find the nearest intersection for a ray with all elements
 */
function findNearestIntersection(
  ray: Ray,
  elements: OpticalElement[],
  excludeId?: string
): Intersection | null {
  let nearest: Intersection | null = null;
  let nearestDist = Infinity;
  
  for (const element of elements) {
    // Skip the element we just interacted with
    if (excludeId && element.id === excludeId) continue;
    
    let intersection: Intersection | null = null;
    
    switch (element.type) {
      case 'lens':
        intersection = rayLensIntersection(ray, element);
        break;
      case 'mirror':
        intersection = rayMirrorIntersection(ray, element);
        break;
      case 'detector':
        intersection = rayDetectorIntersection(ray, element);
        break;
      case 'aperture':
        intersection = rayApertureIntersection(ray, element);
        break;
      case 'beamsplitter':
        intersection = rayBeamSplitterIntersection(ray, element);
        break;
      case 'dichroic':
        intersection = rayBeamSplitterIntersection(ray, element); // Dichroic uses same geometry
        break;
      case 'filter':
        intersection = rayLensIntersection(ray, element);
        break;
      case 'fluorescent':
        intersection = rayLensIntersection(ray, element); // Use lens plane geometry
        break;
      case 'aquarium':
        intersection = rayLensIntersection(ray, element); // Use lens plane geometry
        break;
      // Sources don't block rays
      case 'laser':
      case 'led':
        break;
    }
    
    if (intersection && intersection.distance < nearestDist) {
      nearest = intersection;
      nearestDist = intersection.distance;
    }
  }
  
  return nearest;
}

/**
 * Apply thin lens transformation to a ray direction.
 * Correctly handles principal plane offset by tracing the incoming ray to the
 * principal plane, computing height there, and emitting the refracted ray from
 * the principal plane position (proper thick-lens / objective model).
 *
 * @returns new direction AND new ray origin (at principal plane)
 */
function applyLensRefraction(
  ray: Ray,
  intersection: Intersection
): { direction: Vec2; origin: SimPoint } {
  const focalLength = intersection.element.params.focalLength || 100;
  const principalPlaneOffset = intersection.element.params.principalPlaneOffset || 0;

  const opticalAxis = vec2Rotate({ x: 1, y: 0 }, intersection.element.rotation);
  const perpAxis = vec2Perpendicular(opticalAxis);

  // Default: thin lens — ray bends at the physical surface
  let principalPlaneOrigin: SimPoint = intersection.point;

  if (Math.abs(principalPlaneOffset) > EPSILON) {
    // Advance the incoming ray from the physical lens surface to the principal plane.
    // The principal plane lies at axial distance principalPlaneOffset from element center.
    // intersection.point is already on the lens surface (same axial position as element.position),
    // so we need to advance by principalPlaneOffset along the optical axis via the ray slope.
    const rayAxial = vec2Dot(ray.direction, opticalAxis);
    if (Math.abs(rayAxial) > EPSILON) {
      const advanceDist = principalPlaneOffset / rayAxial;
      principalPlaneOrigin = {
        x: intersection.point.x + ray.direction.x * advanceDist,
        y: intersection.point.y + ray.direction.y * advanceDist
      };
    }
  }

  // Height is measured as perpendicular offset from the element's optical axis
  const heightAtPrincipalPlane = vec2Dot(
    vec2Sub(principalPlaneOrigin, intersection.element.position),
    perpAxis
  );

  // Paraxial lens equation: deflection = −h / f  (result in radians, convert to degrees)
  // The sign of the deflection must account for the propagation direction:
  // a converging lens should converge rays regardless of whether they enter
  // from the left or the right.  Flip sign when the ray travels against the
  // optical axis so that the focal power is direction-independent.
  const rayAxial = vec2Dot(ray.direction, opticalAxis);
  const dirSign = rayAxial >= 0 ? 1 : -1;
  const deflectionAngle = dirSign * (-heightAtPrincipalPlane / focalLength) * (180 / Math.PI);
  const newDirection = vec2Normalize(vec2Rotate(ray.direction, deflectionAngle));

  return { direction: newDirection, origin: principalPlaneOrigin };
}

/**
 * Check if a ray passes through the clear aperture of a lens
 * Returns true if ray is blocked (outside aperture)
 */
function isBlockedByLensAperture(
  intersection: Intersection
): boolean {
  const aperture = intersection.element.params.aperture || 25;
  const halfAperture = aperture / 2;
  
  const perpAxis = vec2Perpendicular(vec2Rotate({ x: 1, y: 0 }, intersection.element.rotation));
  const toCenter = vec2Sub(intersection.point, intersection.element.position);
  const lateralDist = Math.abs(vec2Dot(toCenter, perpAxis));
  
  return lateralDist > halfAperture;
}

/**
 * Reflect a ray off a surface
 */
function reflectRay(direction: Vec2, normal: Vec2): Vec2 {
  const dotProduct = vec2Dot(direction, normal);
  return vec2Normalize({
    x: direction.x - 2 * dotProduct * normal.x,
    y: direction.y - 2 * dotProduct * normal.y
  });
}

/**
 * Process a beam splitter interaction
 * Returns both transmitted and reflected rays
 */
function processBeamSplitter(
  ray: Ray,
  intersection: Intersection
): { transmitted: Ray | null; reflected: Ray | null } {
  const splitRatio = intersection.element.params.splitRatio || 0.5;
  
  // Transmitted ray
  const transmitted: Ray = {
    ...ray,
    origin: intersection.point,
    intensity: ray.intensity * splitRatio,
    id: uuidv4(),
    bounceCount: ray.bounceCount + 1
  };
  
  // Reflected ray
  const reflectedDirection = reflectRay(ray.direction, intersection.normal);
  const reflected: Ray = {
    ...ray,
    origin: intersection.point,
    direction: reflectedDirection,
    intensity: ray.intensity * (1 - splitRatio),
    id: uuidv4(),
    bounceCount: ray.bounceCount + 1
  };
  
  return {
    transmitted: splitRatio > 0 ? transmitted : null,
    reflected: (1 - splitRatio) > 0 ? reflected : null
  };
}

/**
 * Process a dichroic mirror interaction (wavelength-selective)
 */
function processDichroic(
  ray: Ray,
  intersection: Intersection
): { transmitted: Ray | null; reflected: Ray | null } {
  const cutoff = intersection.element.params.cutoffWavelength || 510;
  const transmitAbove = intersection.element.params.transmitAbove !== false;
  
  // Determine if ray is transmitted or reflected based on wavelength
  const isTransmitted = transmitAbove
    ? ray.wavelength > cutoff
    : ray.wavelength < cutoff;
  
  if (isTransmitted) {
    return {
      transmitted: {
        ...ray,
        origin: intersection.point,
        bounceCount: ray.bounceCount + 1
      },
      reflected: null
    };
  } else {
    return {
      transmitted: null,
      reflected: {
        ...ray,
        origin: intersection.point,
        direction: reflectRay(ray.direction, intersection.normal),
        bounceCount: ray.bounceCount + 1
      }
    };
  }
}

/**
 * Main simulation function
 */
export function runSimulation(
  elements: OpticalElement[],
  config: SimulationConfig
): SimulationResult {
  const startTime = performance.now();
  const rays: RayPath[] = [];
  const detectorReadings = new Map<string, DetectorReading>();
  const warnings: SimulationWarning[] = [];
  const errors: SimulationError[] = [];
  
  // Initialize detector readings
  for (const element of elements) {
    if (element.type === 'detector') {
      detectorReadings.set(element.id, {
        detectorId: element.id,
        moduleInstanceId: element.moduleInstanceId,
        totalPower: 0,
        rayCount: 0,
        centroid: { x: 0, y: 0 },
        spread: { x: 0, y: 0 },
        rayImpacts: []
      });
    }
  }
  
  // Find all sources and generate rays
  const sources = elements.filter(e => e.type === 'laser' || e.type === 'led');
  
  if (sources.length === 0) {
    errors.push({ code: 'NO_SOURCES', message: 'No light sources in scene' });
    return {
      success: false,
      rays: [],
      detectorReadings: [],
      warnings,
      errors,
      executionTimeMs: performance.now() - startTime,
      rayCount: 0,
      segmentCount: 0
    };
  }
  
  // Process rays from each source
  let totalSegments = 0;
  const activeRays: Ray[] = [];
  
  for (const source of sources) {
    const sourceRays = generateSourceRays(source, config);
    activeRays.push(...sourceRays);
  }
  
  // Ray processing queue
  const rayQueue: { ray: Ray; segments: RaySegment[]; sourceId: string }[] = [];
  
  for (const ray of activeRays) {
    const source = sources.find(s => 
      Math.abs(s.position.x - ray.origin.x) < 50 && 
      Math.abs(s.position.y - ray.origin.y) < 50
    );
    rayQueue.push({
      ray,
      segments: [],
      sourceId: source?.id || ''
    });
  }
  
  // Process rays
  while (rayQueue.length > 0) {
    const current = rayQueue.shift()!;
    const { ray, segments, sourceId } = current;
    
    // Safety check for runaway rays
    if (ray.bounceCount >= config.maxBounces) {
      // Terminate ray and record path
      rays.push({
        id: ray.id,
        sourceId,
        segments,
        wavelength: ray.wavelength,
        terminated: true,
        terminationReason: 'max_bounces'
      });
      continue;
    }
    
    if (ray.totalDistance > RAY_LENGTH_LIMIT) {
      rays.push({
        id: ray.id,
        sourceId,
        segments,
        wavelength: ray.wavelength,
        terminated: true,
        terminationReason: 'boundary'
      });
      continue;
    }
    
    // Find nearest intersection
    const intersection = findNearestIntersection(
      ray, 
      elements,
      segments.length > 0 ? segments[segments.length - 1].rayId : undefined
    );
    
    if (!intersection) {
      // Ray escaped - add final segment to boundary
      const endPoint: SimPoint = {
        x: ray.origin.x + ray.direction.x * 500,
        y: ray.origin.y + ray.direction.y * 500
      };
      
      segments.push({
        start: ray.origin,
        end: endPoint,
        wavelength: ray.wavelength,
        intensity: ray.intensity,
        rayId: ray.id
      });
      totalSegments++;
      
      rays.push({
        id: ray.id,
        sourceId,
        segments,
        wavelength: ray.wavelength,
        terminated: true,
        terminationReason: 'boundary'
      });
      continue;
    }
    
    // Add segment to intersection point
    segments.push({
      start: ray.origin,
      end: intersection.point,
      wavelength: ray.wavelength,
      intensity: ray.intensity,
      rayId: ray.id
    });
    totalSegments++;
    
    // Process interaction based on element type
    const element = intersection.element;
    
    switch (element.type) {
      case 'lens': {
        // Check if ray is blocked by lens aperture
        if (isBlockedByLensAperture(intersection)) {
          rays.push({
            id: ray.id,
            sourceId,
            segments,
            wavelength: ray.wavelength,
            terminated: true,
            terminationReason: 'absorbed'
          });
          break;
        }
        
        // Refract through lens — principal plane model returns new origin + direction
        const { direction: newDirection, origin: lensOrigin } = applyLensRefraction(ray, intersection);
        const newRay: Ray = {
          ...ray,
          origin: lensOrigin,
          direction: newDirection,
          bounceCount: ray.bounceCount + 1,
          totalDistance: ray.totalDistance + intersection.distance
        };
        rayQueue.push({ ray: newRay, segments: [...segments], sourceId });
        break;
      }
      
      case 'mirror': {
        // Reflect off mirror
        const reflectivity = element.params.reflectivity || 0.99;
        const reflectedDir = reflectRay(ray.direction, intersection.normal);
        const newRay: Ray = {
          ...ray,
          origin: intersection.point,
          direction: reflectedDir,
          intensity: ray.intensity * reflectivity,
          bounceCount: ray.bounceCount + 1,
          totalDistance: ray.totalDistance + intersection.distance
        };
        rayQueue.push({ ray: newRay, segments: [...segments], sourceId });
        break;
      }
      
      case 'beamsplitter': {
        const { transmitted, reflected } = processBeamSplitter(ray, intersection);
        if (transmitted) {
          transmitted.totalDistance = ray.totalDistance + intersection.distance;
          rayQueue.push({ ray: transmitted, segments: [...segments], sourceId });
        }
        if (reflected) {
          reflected.totalDistance = ray.totalDistance + intersection.distance;
          rayQueue.push({ ray: reflected, segments: [...segments], sourceId });
        }
        break;
      }
      
      case 'dichroic': {
        const { transmitted, reflected } = processDichroic(ray, intersection);
        if (transmitted) {
          transmitted.totalDistance = ray.totalDistance + intersection.distance;
          rayQueue.push({ ray: transmitted, segments: [...segments], sourceId });
        }
        if (reflected) {
          reflected.totalDistance = ray.totalDistance + intersection.distance;
          rayQueue.push({ ray: reflected, segments: [...segments], sourceId });
        }
        break;
      }
      
      case 'detector': {
        // Record hit on detector
        const reading = detectorReadings.get(element.id);
        if (reading) {
          reading.totalPower += ray.intensity;
          reading.rayCount += 1;
          reading.rayImpacts.push(intersection.point);
        }
        
        rays.push({
          id: ray.id,
          sourceId,
          segments,
          wavelength: ray.wavelength,
          terminated: true,
          terminationReason: 'detector'
        });
        break;
      }
      
      case 'aperture': {
        // Ray is blocked by aperture
        rays.push({
          id: ray.id,
          sourceId,
          segments,
          wavelength: ray.wavelength,
          terminated: true,
          terminationReason: 'absorbed'
        });
        break;
      }
      
      case 'filter': {
        // Wavelength-selective bandpass filter
        const bandpassCenter = element.params.bandpassCenter;
        const bandpassWidth = element.params.bandpassWidth;

        if (bandpassCenter !== undefined && bandpassWidth !== undefined) {
          const halfBW = bandpassWidth / 2;
          const inPass = Math.abs(ray.wavelength - bandpassCenter) <= halfBW;
          if (!inPass) {
            // Ray blocked outside passband
            rays.push({
              id: ray.id, sourceId, segments,
              wavelength: ray.wavelength, terminated: true,
              terminationReason: 'absorbed'
            });
            break;
          }
        }

        // Apply in-band transmission loss
        const transmission = element.params.transmission || 0.9;
        const newRay: Ray = {
          ...ray,
          origin: intersection.point,
          intensity: ray.intensity * transmission,
          bounceCount: ray.bounceCount + 1,
          totalDistance: ray.totalDistance + intersection.distance
        };
        rayQueue.push({ ray: newRay, segments: [...segments], sourceId });
        break;
      }

      case 'fluorescent': {
        // Fluorescent sample: absorb excitation wavelength, emit at emission wavelength
        const excitationWL = element.params.excitationWavelength || 488;
        const excBW = element.params.excitationBandwidth || 50;
        const emissionWL = element.params.emissionWavelength || 525;
        const conversionEff = element.params.conversionEfficiency || 0.5;
        const numEmissionRays = element.params.rayCount || 8;

        const isExcited = Math.abs(ray.wavelength - excitationWL) <= excBW / 2;

        if (!isExcited) {
          // Non-excitation wavelength passes through
          rayQueue.push({
            ray: { ...ray, origin: intersection.point, bounceCount: ray.bounceCount + 1, totalDistance: ray.totalDistance + intersection.distance },
            segments: [...segments], sourceId
          });
          break;
        }

        // Excitation ray is absorbed
        rays.push({
          id: ray.id, sourceId, segments,
          wavelength: ray.wavelength, terminated: true,
          terminationReason: 'absorbed'
        });

        // Emit isotropic fluorescence at emission wavelength
        for (let fi = 0; fi < numEmissionRays; fi++) {
          const emAngle = (fi / numEmissionRays) * 360;
          const emDir = vec2Rotate({ x: 1, y: 0 }, emAngle);
          const emRay: Ray = {
            origin: intersection.point,
            direction: emDir,
            wavelength: emissionWL,
            intensity: (ray.intensity * conversionEff) / numEmissionRays,
            id: uuidv4(),
            bounceCount: ray.bounceCount + 1,
            totalDistance: ray.totalDistance + intersection.distance
          };
          rayQueue.push({ ray: emRay, segments: [], sourceId });
        }
        break;
      }

      case 'aquarium': {
        // Aquarium blocks rays in the filled half of its volume.
        // Fill level is from one side: fillFraction=0.5 → bottom half blocked.
        const fillFraction = element.params.fillFraction || 0.5;
        const perpAxis = vec2Perpendicular(vec2Rotate({ x: 1, y: 0 }, element.rotation));
        const halfSize = (element.params.aperture || 50) / 2;
        const toHit = vec2Sub(intersection.point, element.position);
        const lateralPos = vec2Dot(toHit, perpAxis); // signed offset from center
        // Normalise to [0,1]: 0 = one edge, 1 = other edge
        const relPos = (lateralPos + halfSize) / (halfSize * 2);
        const inFill = relPos < fillFraction;

        if (inFill) {
          rays.push({
            id: ray.id, sourceId, segments,
            wavelength: ray.wavelength, terminated: true,
            terminationReason: 'absorbed'
          });
        } else {
          rayQueue.push({
            ray: { ...ray, origin: intersection.point, bounceCount: ray.bounceCount + 1, totalDistance: ray.totalDistance + intersection.distance },
            segments: [...segments], sourceId
          });
        }
        break;
      }
      
      default:
        // Unknown element type - pass through
        warnings.push({
          code: 'UNKNOWN_ELEMENT',
          message: `Unknown element type: ${element.type}`,
          elementId: element.id
        });
    }
  }
  
  // Calculate detector statistics
  const finalReadings: DetectorReading[] = [];
  for (const reading of detectorReadings.values()) {
    if (reading.rayCount > 0) {
      // Calculate centroid
      let sumX = 0, sumY = 0;
      for (const impact of reading.rayImpacts) {
        sumX += impact.x;
        sumY += impact.y;
      }
      reading.centroid = {
        x: sumX / reading.rayCount,
        y: sumY / reading.rayCount
      };
      
      // Calculate spread (RMS)
      let sumDx2 = 0, sumDy2 = 0;
      for (const impact of reading.rayImpacts) {
        sumDx2 += Math.pow(impact.x - reading.centroid.x, 2);
        sumDy2 += Math.pow(impact.y - reading.centroid.y, 2);
      }
      reading.spread = {
        x: Math.sqrt(sumDx2 / reading.rayCount),
        y: Math.sqrt(sumDy2 / reading.rayCount)
      };
    }
    finalReadings.push(reading);
  }
  
  return {
    success: true,
    rays,
    detectorReadings: finalReadings,
    warnings,
    errors,
    executionTimeMs: performance.now() - startTime,
    rayCount: rays.length,
    segmentCount: totalSegments
  };
}

/**
 * Create a simple test scene for debugging
 */
export function createTestScene(): OpticalElement[] {
  return [
    {
      id: 'source-1',
      moduleInstanceId: 'test-laser',
      type: 'laser',
      position: { x: 50, y: 250 },
      rotation: 0,
      params: {
        wavelength: 532,
        power: 1,
        divergence: 0,
        beamDiameter: 10,
        rayCount: 5
      }
    },
    {
      id: 'lens-1',
      moduleInstanceId: 'test-lens',
      type: 'lens',
      position: { x: 150, y: 250 },
      rotation: 0,
      params: {
        focalLength: 100,
        aperture: 30
      }
    },
    {
      id: 'detector-1',
      moduleInstanceId: 'test-detector',
      type: 'detector',
      position: { x: 350, y: 250 },
      rotation: 0,
      params: {
        width: 20,
        height: 20
      }
    }
  ];
}

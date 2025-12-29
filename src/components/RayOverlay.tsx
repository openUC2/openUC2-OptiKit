/**
 * RayOverlay - Konva layer for visualizing ray paths
 * 
 * Renders ray paths as colored lines on top of the grid canvas.
 * Supports different color modes (wavelength, intensity, source).
 */

import React, { useMemo } from 'react';
import { Line, Circle, Group } from 'react-konva';
import { useSimulationStore } from '../stores/simulationStore';
import { getRayColor, wavelengthToColor } from '../utils/sceneBuilder';
import type { SimPoint, ViewportConfig } from '../types';

interface RayOverlayProps {
  viewport: ViewportConfig;
  gridCellSize: number;
}

// Convert simulation coordinates (mm) to canvas pixel coordinates
function simToCanvas(point: SimPoint, gridCellSize: number): { x: number; y: number } {
  // Simulation uses mm, grid uses 50mm cells
  // gridCellSize is the pixel size of a cell
  // 50mm in simulation = 1 grid cell = gridCellSize pixels
  const scale = gridCellSize / 50; // pixels per mm
  return {
    x: point.x * scale,
    y: point.y * scale
  };
}

export const RayOverlay: React.FC<RayOverlayProps> = ({ viewport, gridCellSize }) => {
  const { 
    config, 
    rays, 
    detectorReadings,
    elements 
  } = useSimulationStore();
  
  // Get source indices for color coding - MUST be called before any conditional returns
  const sourceIds = useMemo(() => {
    return elements
      .filter(e => e.type === 'laser' || e.type === 'led')
      .map(e => e.id);
  }, [elements]);
  
  // Render ray paths - MUST be called before any conditional returns
  const rayLines = useMemo(() => {
    // Return empty if disabled
    if (!config.enabled || !config.showRays) return [];
    
    const lines: React.ReactNode[] = [];
    
    rays.forEach((ray, rayIndex) => {
      const sourceIndex = sourceIds.indexOf(ray.sourceId);
      
      ray.segments.forEach((segment, segIndex) => {
        const start = simToCanvas(segment.start, gridCellSize);
        const end = simToCanvas(segment.end, gridCellSize);
        
        const color = getRayColor(
          segment.wavelength,
          segment.intensity,
          sourceIndex >= 0 ? sourceIndex : 0,
          config.rayColorMode
        );
        
        // Calculate opacity based on intensity and config
        const opacity = Math.min(1, segment.intensity * config.rayBrightness);
        
        lines.push(
          <Line
            key={`ray-${rayIndex}-${segIndex}`}
            points={[start.x, start.y, end.x, end.y]}
            stroke={color}
            strokeWidth={2 / viewport.zoom}
            opacity={opacity}
            lineCap="round"
            lineJoin="round"
            // Add glow effect for better visibility
            shadowColor={color}
            shadowBlur={4 / viewport.zoom}
            shadowOpacity={0.5}
          />
        );
      });
    });
    
    return lines;
  }, [rays, sourceIds, gridCellSize, config.rayColorMode, config.rayBrightness, config.enabled, config.showRays, viewport.zoom]);
  
  // Render detector hit points - MUST be called before any conditional returns
  const detectorHits = useMemo(() => {
    if (!config.enabled || !config.showRays || !config.showDetectorReadings) return [];
    
    const hits: React.ReactNode[] = [];
    
    detectorReadings.forEach((reading, detIndex) => {
      // Get detector element for position
      const detector = elements.find(e => e.id === reading.detectorId);
      if (!detector) return;
      
      // Render hit points
      reading.rayImpacts.forEach((impact, hitIndex) => {
        const pos = simToCanvas(impact, gridCellSize);
        
        hits.push(
          <Circle
            key={`hit-${detIndex}-${hitIndex}`}
            x={pos.x}
            y={pos.y}
            radius={3 / viewport.zoom}
            fill="#ff0000"
            opacity={0.7}
          />
        );
      });
      
      // Render centroid marker if we have hits
      if (reading.rayCount > 0) {
        const centroidPos = simToCanvas(reading.centroid, gridCellSize);
        
        hits.push(
          <Circle
            key={`centroid-${detIndex}`}
            x={centroidPos.x}
            y={centroidPos.y}
            radius={6 / viewport.zoom}
            stroke="#ffff00"
            strokeWidth={2 / viewport.zoom}
            fill="transparent"
          />
        );
      }
    });
    
    return hits;
  }, [detectorReadings, elements, gridCellSize, config.showDetectorReadings, config.enabled, config.showRays, viewport.zoom]);
  
  // Render source indicators - MUST be called before any conditional returns
  const sourceIndicators = useMemo(() => {
    if (!config.enabled || !config.showRays) return [];
    
    const indicators: React.ReactNode[] = [];
    
    elements
      .filter(e => e.type === 'laser' || e.type === 'led')
      .forEach((source, idx) => {
        const pos = simToCanvas(source.position, gridCellSize);
        const wavelength = source.params.wavelength || 532;
        const color = wavelengthToColor(wavelength);
        
        // Draw a small indicator showing source direction
        const dirRad = (source.rotation * Math.PI) / 180;
        const arrowLength = 15 / viewport.zoom;
        const endX = pos.x + Math.cos(dirRad) * arrowLength;
        const endY = pos.y + Math.sin(dirRad) * arrowLength;
        
        indicators.push(
          <Group key={`source-${idx}`}>
            {/* Source point */}
            <Circle
              x={pos.x}
              y={pos.y}
              radius={5 / viewport.zoom}
              fill={color}
              stroke="#ffffff"
              strokeWidth={1 / viewport.zoom}
            />
            {/* Direction arrow */}
            <Line
              points={[pos.x, pos.y, endX, endY]}
              stroke={color}
              strokeWidth={3 / viewport.zoom}
              lineCap="round"
            />
          </Group>
        );
      });
    
    return indicators;
  }, [elements, gridCellSize, config.enabled, config.showRays, viewport.zoom]);
  
  // Render detector surfaces - MUST be called before any conditional returns
  const detectorSurfaces = useMemo(() => {
    if (!config.enabled || !config.showRays) return [];
    
    const surfaces: React.ReactNode[] = [];
    
    elements
      .filter(e => e.type === 'detector')
      .forEach((detector, idx) => {
        const pos = simToCanvas(detector.position, gridCellSize);
        const width = (detector.params.width || 12) * (gridCellSize / 50);
        
        // Draw detector surface
        const dirRad = (detector.rotation * Math.PI) / 180;
        const perpRad = dirRad + Math.PI / 2;
        const halfWidth = width / 2;
        
        const x1 = pos.x - Math.cos(perpRad) * halfWidth;
        const y1 = pos.y - Math.sin(perpRad) * halfWidth;
        const x2 = pos.x + Math.cos(perpRad) * halfWidth;
        const y2 = pos.y + Math.sin(perpRad) * halfWidth;
        
        surfaces.push(
          <Line
            key={`detector-surface-${idx}`}
            points={[x1, y1, x2, y2]}
            stroke="#00ff00"
            strokeWidth={3 / viewport.zoom}
            lineCap="round"
            opacity={0.8}
          />
        );
      });
    
    return surfaces;
  }, [elements, gridCellSize, config.enabled, config.showRays, viewport.zoom]);
  
  // Now we can do the conditional return AFTER all hooks
  if (!config.enabled || !config.showRays) {
    return null;
  }
  
  return (
    <Group>
      {/* Detector surfaces (drawn first, underneath rays) */}
      {detectorSurfaces}
      
      {/* Ray paths */}
      {rayLines}
      
      {/* Source indicators */}
      {sourceIndicators}
      
      {/* Detector hits (drawn on top) */}
      {detectorHits}
    </Group>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Image } from 'react-konva';
import { useAppStore } from '../stores/appStore';
import { AnnotationCanvas } from './AnnotationCanvas';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Point } from '../types';
import type Konva from 'konva';

const GRID_SIZE = 20; // Number of grid cells to show
const CANVAS_SIZE = 800; // Canvas size in pixels

export const GridCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const [moduleImages, setModuleImages] = useState<Record<string, HTMLImageElement>>({});
  
  const {
    grid,
    viewport,
    placedModules,
    layers,
    activeLayerId,
    selectedItemId,
    modules,
    placeModule,
    moveModule,
    selectItem,
    setViewport
  } = useAppStore();

  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  const currentLayerIndex = activeLayer?.index ?? 0;

  // Update stage size when window resizes
  useEffect(() => {
    const updateSize = () => {
      const container = stageRef.current?.container();
      if (container) {
        const rect = container.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Load SVG images for modules
  useEffect(() => {
    const loadModuleImages = async () => {
      const imagePromises = modules.map(async (module) => {
        if (module.thumbnail) {
          try {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
              img.onload = () => resolve([module.id, img]);
              img.onerror = reject;
              img.src = module.thumbnail!;
            });
          } catch (error) {
            console.warn(`Failed to load image for module ${module.id}:`, error);
            return null;
          }
        }
        return null;
      });

      const results = await Promise.allSettled(imagePromises);
      const imageMap: Record<string, HTMLImageElement> = {};
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const [moduleId, img] = result.value;
          imageMap[moduleId] = img;
        }
      });

      setModuleImages(imageMap);
    };

    if (modules.length > 0) {
      loadModuleImages();
    }
  }, [modules]);

  // Generate grid lines
  const generateGridLines = () => {
    const lines = [];
    const cellSize = grid.cellSize * viewport.zoom;
    const gridWidth = GRID_SIZE * cellSize;
    const gridHeight = GRID_SIZE * cellSize;

    // Vertical lines
    for (let i = 0; i <= GRID_SIZE; i++) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i * cellSize, 0, i * cellSize, gridHeight]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }

    // Horizontal lines
    for (let i = 0; i <= GRID_SIZE; i++) {
      lines.push(
        <Line
          key={`h-${i}`}
          points={[0, i * cellSize, gridWidth, i * cellSize]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }

    return lines;
  };

  // Snap position to grid
  const snapToGrid = (pos: Point): Point => {
    if (!grid.snapEnabled) return pos;
    
    const cellSize = grid.cellSize * viewport.zoom;
    return {
      x: Math.round(pos.x / cellSize) * cellSize,
      y: Math.round(pos.y / cellSize) * cellSize
    };
  };

  // Convert pixel coordinates to grid coordinates
  const pixelToGrid = (pos: Point): Point => {
    const cellSize = grid.cellSize * viewport.zoom;
    return {
      x: Math.floor(pos.x / cellSize),
      y: Math.floor(pos.y / cellSize)
    };
  };

  // Convert grid coordinates to pixel coordinates
  const gridToPixel = (pos: Point): Point => {
    const cellSize = grid.cellSize * viewport.zoom;
    return {
      x: pos.x * cellSize,
      y: pos.y * cellSize
    };
  };

  // Handle module drag end
  const handleModuleDragEnd = (moduleId: string, e: KonvaEventObject<DragEvent>) => {
    const pos = e.target.position();
    const snappedPos = snapToGrid(pos);
    const gridPos = pixelToGrid(snappedPos);
    
    moveModule(moduleId, gridPos);
  };

  // Handle canvas click
  const handleCanvasClick = (e: KonvaEventObject<MouseEvent>) => {
    // Check if clicking on empty area
    if (e.target === e.target.getStage()) {
      selectItem(null, null);
    }
  };

  // Handle drop from part library
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const moduleId = e.dataTransfer?.getData('moduleId');
    if (!moduleId) return;

    const stage = stageRef.current;
    if (!stage) return;

    // Get the mouse position relative to the stage
    const stageBox = stage.container().getBoundingClientRect();
    const pointerPos = {
      x: e.clientX - stageBox.left,
      y: e.clientY - stageBox.top
    };

    // Transform the pointer position based on current viewport
    const transformedPos = {
      x: (pointerPos.x - viewport.pan.x) / viewport.zoom,
      y: (pointerPos.y - viewport.pan.y) / viewport.zoom
    };

    const snappedPos = snapToGrid(transformedPos);
    const gridPos = pixelToGrid(snappedPos);
    
    placeModule(moduleId, gridPos, currentLayerIndex);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Render placed modules
  const renderPlacedModules = () => {
    return placedModules
      .filter(module => module.layer === currentLayerIndex)
      .map(module => {
        const moduleDefinition = modules.find(m => m.id === module.moduleId);
        if (!moduleDefinition) return null;

        const pos = gridToPixel(module.position);
        const cellSize = grid.cellSize * viewport.zoom;
        const width = moduleDefinition.footprint.width * cellSize;
        const height = moduleDefinition.footprint.height * cellSize;
        const moduleImage = moduleImages[module.moduleId];

        return (
          <Group
            key={module.id}
            x={pos.x}
            y={pos.y}
            draggable
            onDragEnd={(e) => handleModuleDragEnd(module.id, e)}
            onClick={() => selectItem(module.id, 'module')}
          >
            {moduleImage ? (
              <Image
                image={moduleImage}
                width={width}
                height={height}
                stroke={selectedItemId === module.id ? '#2980b9' : '#34495e'}
                strokeWidth={selectedItemId === module.id ? 3 : 1}
                opacity={0.9}
              />
            ) : (
              <Rect
                width={width}
                height={height}
                fill={moduleDefinition.color}
                stroke={selectedItemId === module.id ? '#2980b9' : '#34495e'}
                strokeWidth={selectedItemId === module.id ? 3 : 1}
                opacity={0.8}
              />
            )}
            <Text
              text={moduleDefinition.name}
              x={4}
              y={height - 16}
              fontSize={10}
              fill="#000000"
              fontFamily="Arial"
              width={width - 8}
              height={12}
              verticalAlign="middle"
              align="center"
            />
          </Group>
        );
      });
  };

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={viewport.zoom}
        scaleY={viewport.zoom}
        x={viewport.pan.x}
        y={viewport.pan.y}
        onClick={handleCanvasClick}
        onWheel={(e) => {
          // Handle zoom with mouse wheel
          e.evt.preventDefault();
          const scaleBy = 1.1;
          const stage = e.target.getStage();
          if (!stage) return;
          
          const oldScale = stage.scaleX();
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          
          const newScale = e.evt.deltaY > 0 ? oldScale * scaleBy : oldScale / scaleBy;
          const clampedScale = Math.max(0.1, Math.min(3, newScale));
          
          if (clampedScale !== oldScale) {
            const mousePointTo = {
              x: (pointer.x - stage.x()) / oldScale,
              y: (pointer.y - stage.y()) / oldScale,
            };
            
            const newPos = {
              x: pointer.x - mousePointTo.x * clampedScale,
              y: pointer.y - mousePointTo.y * clampedScale,
            };
            
            setViewport({
              zoom: clampedScale,
              pan: newPos
            });
          }
        }}
        draggable
        onDragEnd={(e) => {
          setViewport({
            pan: { x: e.target.x(), y: e.target.y() }
          });
        }}
      >
        <Layer>
          {/* Grid lines */}
          {grid.gridVisible && generateGridLines()}
          
          {/* Placed modules */}
          {renderPlacedModules()}
          
          {/* Annotations */}
          <AnnotationCanvas 
            currentLayerIndex={currentLayerIndex}
            viewport={viewport}
          />
        </Layer>
      </Stage>
    </div>
  );
};
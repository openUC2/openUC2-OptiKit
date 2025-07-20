import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Image } from 'react-konva';
import { useAppStore } from '../stores/appStore';
import { AnnotationCanvas } from './AnnotationCanvas';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Point } from '../types';
import type Konva from 'konva';

const GRID_SIZE = 10; // Number of grid cells to show (limited to 10x10 as requested)
const CANVAS_SIZE = 800; // Canvas size in pixels

export const GridCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const [moduleImages, setModuleImages] = useState<Record<string, HTMLImageElement>>({});
  const [isDraggingModule, setIsDraggingModule] = useState(false);
  const annotationMode = useAppStore((state) => state.annotationMode);
  
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

  // Snap position to grid
  const snapToGrid = useCallback((pos: Point): Point => {
    if (!grid.snapEnabled) return pos;
    
    const cellSize = grid.cellSize; // Don't multiply by zoom for snapping
    return {
      x: Math.round(pos.x / cellSize) * cellSize,
      y: Math.round(pos.y / cellSize) * cellSize
    };
  }, [grid.snapEnabled, grid.cellSize]);

  // Convert pixel coordinates to grid coordinates
  const pixelToGrid = useCallback((pos: Point): Point => {
    const cellSize = grid.cellSize; // Don't multiply by zoom for grid conversion
    return {
      x: Math.floor(pos.x / cellSize),
      y: Math.floor(pos.y / cellSize)
    };
  }, [grid.cellSize]);

  // Convert grid coordinates to pixel coordinates
  const gridToPixel = useCallback((pos: Point): Point => {
    const cellSize = grid.cellSize; // Don't multiply by zoom for grid conversion
    return {
      x: pos.x * cellSize,
      y: pos.y * cellSize
    };
  }, [grid.cellSize]);

  // Update stage size when window resizes
  useEffect(() => {
    const updateSize = () => {
      const container = stageRef.current?.container();
      if (container) {
        const rect = container.getBoundingClientRect();
        setStageSize({ width: rect.width, height: rect.height });
      }
    };

    const handleScreenshotDownload = () => {
      if (stageRef.current) {
        const stage = stageRef.current;
        const dataURL = stage.toDataURL({
          mimeType: 'image/png',
          quality: 1.0,
          pixelRatio: 2 // Higher quality
        });
        
        // Check if this is for download or for export
        const isExportCapture = (window as unknown as { isExportCapture?: boolean }).isExportCapture;
        
        if (isExportCapture) {
          // Emit event with screenshot data for export
          const event = new CustomEvent('screenshot-captured', { detail: dataURL });
          window.dispatchEvent(event);
          (window as unknown as { isExportCapture?: boolean }).isExportCapture = false;
        } else {
          // Regular download
          const link = document.createElement('a');
          link.download = 'optikit-assembly-screenshot.png';
          link.href = dataURL;
          link.click();
        }
      }
    };

    const handleMobileDrop = (e: CustomEvent) => {
      const { moduleId, x, y } = e.detail;
      const stage = stageRef.current;
      if (!stage) return;

      // Get the stage position
      const stageBox = stage.container().getBoundingClientRect();
      const pointerPos = {
        x: x - stageBox.left,
        y: y - stageBox.top
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

    window.addEventListener('resize', updateSize);
    window.addEventListener('download-screenshot', handleScreenshotDownload);
    
    // Add mobile drop event listener
    const canvasElement = stageRef.current?.container();
    if (canvasElement) {
      canvasElement.addEventListener('mobile-drop', handleMobileDrop as EventListener);
    }
    
    updateSize();
    
    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('download-screenshot', handleScreenshotDownload);
      if (canvasElement) {
        canvasElement.removeEventListener('mobile-drop', handleMobileDrop as EventListener);
      }
    };
  }, [viewport.pan.x, viewport.pan.y, viewport.zoom, currentLayerIndex, placeModule, pixelToGrid, snapToGrid]);

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

  // Generate grid lines and labels
  const generateGridLines = () => {
    const lines = [];
    const cellSize = grid.cellSize; // Don't scale with zoom for grid lines
    const gridWidth = GRID_SIZE * cellSize;
    const gridHeight = GRID_SIZE * cellSize;

    // Vertical lines
    for (let i = 0; i <= GRID_SIZE; i++) {
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i * cellSize, 0, i * cellSize, gridHeight]}
          stroke="#ddd"
          strokeWidth={1 / viewport.zoom} // Scale stroke width inversely with zoom
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
          strokeWidth={1 / viewport.zoom} // Scale stroke width inversely with zoom
        />
      );
    }

    return lines;
  };

  // Generate grid labels (A-J for columns, 0-9 for rows)
  const generateGridLabels = () => {
    const labels = [];
    const cellSize = grid.cellSize; // Don't scale with zoom
    const fontSize = 12 / viewport.zoom; // Scale font size inversely with zoom

    // Column labels (A-J)
    for (let i = 0; i < GRID_SIZE; i++) {
      const letter = String.fromCharCode(65 + i); // A, B, C, ...
      labels.push(
        <Text
          key={`col-${i}`}
          x={i * cellSize + cellSize / 2}
          y={-25 / viewport.zoom}
          text={letter}
          fontSize={fontSize}
          fontFamily="Arial"
          fill="#666"
          align="center"
          width={cellSize}
        />
      );
    }

    // Row labels (0-9)
    for (let i = 0; i < GRID_SIZE; i++) {
      labels.push(
        <Text
          key={`row-${i}`}
          x={-25 / viewport.zoom}
          y={i * cellSize + cellSize / 2 - fontSize / 2}
          text={i.toString()}
          fontSize={fontSize}
          fontFamily="Arial"
          fill="#666"
          align="center"
          width={20 / viewport.zoom}
        />
      );
    }

    return labels;
  };



  // Handle module drag start
  const handleModuleDragStart = () => {
    setIsDraggingModule(true);
  };

  // Handle module drag end
  const handleModuleDragEnd = (moduleId: string, e: KonvaEventObject<DragEvent>) => {
    const pos = e.target.position();
    const snappedPos = snapToGrid(pos);
    const gridPos = pixelToGrid(snappedPos);
    
    // Move module to new position
    moveModule(moduleId, gridPos);
    
    // Reset the visual position to the snapped grid position
    e.target.position(gridToPixel(gridPos));
    
    // Force redraw to prevent visual glitches
    e.target.getStage()?.batchDraw();
    
    setIsDraggingModule(false);
  };

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
        const cellSize = grid.cellSize; // Don't scale with zoom for positioning
        
        // Calculate dimensions considering rotation
        const isRotated90or270 = module.rotation === 90 || module.rotation === 270;
        const actualFootprint = isRotated90or270 ? 
          { width: moduleDefinition.footprint.height, height: moduleDefinition.footprint.width } : 
          { width: moduleDefinition.footprint.width, height: moduleDefinition.footprint.height };
        
        const width = actualFootprint.width * cellSize;
        const height = actualFootprint.height * cellSize;
        const moduleImage = moduleImages[module.moduleId];

        return (
          <Group
            key={module.id}
            x={pos.x}
            y={pos.y}
            draggable
            onDragStart={handleModuleDragStart}
            onDragEnd={(e) => handleModuleDragEnd(module.id, e)}
            onClick={() => selectItem(module.id, 'module')}
          >
            <Group
              rotation={module.rotation}
              offsetX={module.rotation === 90 || module.rotation === 270 ? 0 : 0}
              offsetY={module.rotation === 90 || module.rotation === 270 ? 0 : 0}
              x={module.rotation === 90 ? width : (module.rotation === 180 ? width : 0)}
              y={module.rotation === 90 ? 0 : (module.rotation === 180 ? height : (module.rotation === 270 ? height : 0))}
            >
              {moduleImage ? (
                <Image
                  image={moduleImage}
                  width={moduleDefinition.footprint.width * cellSize}
                  height={moduleDefinition.footprint.height * cellSize}
                  stroke={selectedItemId === module.id ? '#2980b9' : '#34495e'}
                  strokeWidth={(selectedItemId === module.id ? 3 : 1) / viewport.zoom}
                  opacity={0.9}
                />
              ) : (
                <Rect
                  width={moduleDefinition.footprint.width * cellSize}
                  height={moduleDefinition.footprint.height * cellSize}
                  fill={moduleDefinition.color}
                  stroke={selectedItemId === module.id ? '#2980b9' : '#34495e'}
                  strokeWidth={(selectedItemId === module.id ? 3 : 1) / viewport.zoom}
                  opacity={0.8}
                />
              )}
              <Text
                text={
                  moduleDefinition.defaultParams?.isWildCard === true && module.customText
                    ? module.customText
                    : moduleDefinition.name
                }
                x={4}
                y={moduleDefinition.footprint.height * cellSize - 16}
                fontSize={10 / viewport.zoom}
                fill="#000000"
                fontFamily="Arial"
                width={moduleDefinition.footprint.width * cellSize - 8}
                height={12 / viewport.zoom}
                verticalAlign="middle"
                align="center"
              />
            </Group>
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
        draggable={annotationMode === 'none'}
        onDragStart={(e) => {
          // Prevent stage dragging while dragging modules
          if (isDraggingModule) {
            e.evt.preventDefault();
            return false;
          }
        }}
        onDragEnd={(e) => {
          if (!isDraggingModule) {
            setViewport({
              pan: { x: e.target.x(), y: e.target.y() }
            });
          }
        }}
      >
        <Layer>
          {/* Grid lines and labels */}
          {grid.gridVisible && (
            <>
              {generateGridLines()}
              {generateGridLabels()}
            </>
          )}
          {/* Placed modules */}
          {renderPlacedModules()}
        </Layer>
        {/* Annotations always on top */}
        <Layer listening={true}>
          <AnnotationCanvas 
            currentLayerIndex={currentLayerIndex}
            viewport={viewport}
          />
        </Layer>
      </Stage>
    </div>
  );
};
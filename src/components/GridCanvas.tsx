import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Image } from 'react-konva';
import { useAppStore } from '../stores/appStore';
import { AnnotationCanvas } from './AnnotationCanvas';
import { RayOverlay } from './RayOverlay';
import { PhysicalModuleOverlay } from './PhysicalModuleOverlay';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Point } from '../types';
import type Konva from 'konva';

/** Inline style for context-menu items */
const ctxItemStyle: React.CSSProperties = {
  padding: '7px 16px',
  cursor: 'pointer',
  fontSize: 13,
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
const ctxItemHover = (e: React.MouseEvent<HTMLDivElement>) => {
  (e.currentTarget as HTMLDivElement).style.background = '#f0f4f8';
};
const ctxItemLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  (e.currentTarget as HTMLDivElement).style.background = '';
};

const GRID_SIZE = 10; // Number of grid cells to show (limited to 10x10 as requested)
const CANVAS_SIZE = 800; // Canvas size in pixels

export const GridCanvas: React.FC = () => {
  const stageRef = useRef<Konva.Stage>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: CANVAS_SIZE, height: CANVAS_SIZE });
  const [moduleImages, setModuleImages] = useState<Record<string, HTMLImageElement>>({});
  const [isDraggingModule, setIsDraggingModule] = useState(false);
  const annotationMode = useAppStore((state) => state.annotationMode);

  // Touch pinch-zoom support
  const touchDistRef = useRef<number | null>(null);
  // Keep a synchronously-updated viewport ref to avoid stale closures in touch handlers
  const viewportRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });

  // Context-menu state (position in screen pixels)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; moduleId: string | null } | null>(null);

  // Box-select state (positions in canvas content space, i.e. after pan/zoom)
  const [boxSelect, setBoxSelect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isBoxSelecting = useRef(false);

  // Records pixel positions of selected modules when multi-drag starts
  const dragAnchor = useRef<{ moduleId: string; origPos: Point } | null>(null);
  const dragGroupOrigins = useRef<Record<string, Point>>({});
  
  const {
    grid,
    viewport,
    placedModules,
    layers,
    activeLayerId,
    selectedItemId,
    selectedItems,
    modules,
    placeModule,
    moveModule,
    selectItem,
    setViewport,
    deleteSelectedItems,
    copyToClipboard,
    cutToClipboard,
    pasteFromClipboard,
    moveSelectedModules,
    addToSelection,
    clearSelection,
  } = useAppStore();

  const activeLayer = layers.find(layer => layer.id === activeLayerId);
  const currentLayerIndex = activeLayer?.index ?? 0;

  // Keep viewportRef in sync so touch handlers always read up-to-date values
  useEffect(() => {
    viewportRef.current = { zoom: viewport.zoom, pan: { ...viewport.pan } };
  }, [viewport]);

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
      // Read size from the wrapper div, NOT the Konva container (which sizes itself to the stage)
      const wrapper = wrapperRef.current;
      if (wrapper) {
        setStageSize({ width: wrapper.clientWidth, height: wrapper.clientHeight });
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

      // Get the stage position with more robust calculations for mobile
      const stageContainer = stage.container();
      const stageBox = stageContainer.getBoundingClientRect();
      
      // Account for any parent container offsets
      let pointerPos = {
        x: x - stageBox.left,
        y: y - stageBox.top
      };

      // Ensure coordinates are within bounds
      pointerPos.x = Math.max(0, Math.min(pointerPos.x, stageBox.width));
      pointerPos.y = Math.max(0, Math.min(pointerPos.y, stageBox.height));

      // Transform the pointer position based on current viewport
      const transformedPos = {
        x: (pointerPos.x - viewport.pan.x) / viewport.zoom,
        y: (pointerPos.y - viewport.pan.y) / viewport.zoom
      };

      const snappedPos = snapToGrid(transformedPos);
      const gridPos = pixelToGrid(snappedPos);
      
      // Ensure grid position is valid (within bounds)
      if (gridPos.x >= 0 && gridPos.x < GRID_SIZE && gridPos.y >= 0 && gridPos.y < GRID_SIZE) {
        placeModule(moduleId, gridPos, currentLayerIndex);
        
        // Visual feedback for successful placement on mobile
        const successEvent = new CustomEvent('module-placed-success');
        window.dispatchEvent(successEvent);
      }
    };

    window.addEventListener('resize', updateSize);
    window.addEventListener('download-screenshot', handleScreenshotDownload);
    // Listen on window so PartLibrary can reliably dispatch mobile-drop regardless of DOM structure
    window.addEventListener('mobile-drop', handleMobileDrop as EventListener);
    
    // Use ResizeObserver for accurate sizing of the wrapper div
    const wrapper = wrapperRef.current;
    let resizeObserver: ResizeObserver | undefined;
    if (wrapper) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(wrapper);
    }
    
    updateSize();
    
    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('download-screenshot', handleScreenshotDownload);
      window.removeEventListener('mobile-drop', handleMobileDrop as EventListener);
      resizeObserver?.disconnect();
    };
  }, [viewport.pan.x, viewport.pan.y, viewport.zoom, currentLayerIndex, placeModule, pixelToGrid, snapToGrid]);

  // Keyboard shortcuts: Delete, Ctrl+C/X/V, Arrow nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept when a text field is focused
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedItems();
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c') { e.preventDefault(); copyToClipboard(); }
        else if (e.key === 'x') { e.preventDefault(); cutToClipboard(); }
        else if (e.key === 'v') { e.preventDefault(); pasteFromClipboard(); }
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1; // Shift = 5-cell nudge
        const delta = {
          x: e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          y: e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0,
        };
        moveSelectedModules(delta);
      } else if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelectedItems, copyToClipboard, cutToClipboard, pasteFromClipboard, moveSelectedModules]);

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

  // Generate grid lines that fill the entire visible stage area
  const generateGridLines = () => {
    const lines = [];
    const cellSize = grid.cellSize;
    const strokeW = 1 / viewport.zoom;

    // Compute visible content-space range from viewport transform
    // visible_min = (-pan) / zoom,  visible_max = (stageSize - pan) / zoom
    const visMinX = (-viewport.pan.x - cellSize) / viewport.zoom;
    const visMaxX = (stageSize.width  - viewport.pan.x + cellSize) / viewport.zoom;
    const visMinY = (-viewport.pan.y - cellSize) / viewport.zoom;
    const visMaxY = (stageSize.height - viewport.pan.y + cellSize) / viewport.zoom;

    // Snap to cell boundaries
    const startCol = Math.floor(visMinX / cellSize);
    const endCol   = Math.ceil(visMaxX  / cellSize);
    const startRow = Math.floor(visMinY / cellSize);
    const endRow   = Math.ceil(visMaxY  / cellSize);

    // Background fill for the whole visible area (matches grid background)
    lines.push(
      <Rect
        key="bg"
        x={startCol * cellSize}
        y={startRow * cellSize}
        width={(endCol - startCol) * cellSize}
        height={(endRow - startRow) * cellSize}
        fill="#fafafa"
        listening={false}
      />
    );

    // Highlight the official GRID_SIZE × GRID_SIZE work area slightly
    lines.push(
      <Rect
        key="work-area"
        x={0} y={0}
        width={GRID_SIZE * cellSize}
        height={GRID_SIZE * cellSize}
        fill="#ffffff"
        listening={false}
      />
    );

    // Vertical lines across full visible range
    for (let i = startCol; i <= endCol; i++) {
      const isWorkBorder = i === 0 || i === GRID_SIZE;
      lines.push(
        <Line
          key={`v-${i}`}
          points={[i * cellSize, startRow * cellSize, i * cellSize, endRow * cellSize]}
          stroke={isWorkBorder ? '#bbb' : '#ddd'}
          strokeWidth={isWorkBorder ? 1.5 / viewport.zoom : strokeW}
        />
      );
    }

    // Horizontal lines across full visible range
    for (let i = startRow; i <= endRow; i++) {
      const isWorkBorder = i === 0 || i === GRID_SIZE;
      lines.push(
        <Line
          key={`h-${i}`}
          points={[startCol * cellSize, i * cellSize, endCol * cellSize, i * cellSize]}
          stroke={isWorkBorder ? '#bbb' : '#ddd'}
          strokeWidth={isWorkBorder ? 1.5 / viewport.zoom : strokeW}
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



  // Handle module drag start — record original positions for multi-select drag
  const handleModuleDragStart = (moduleId: string) => {
    setIsDraggingModule(true);
    const state = useAppStore.getState();
    const origins: Record<string, Point> = {};
    state.selectedItems
      .filter(i => i.type === 'module')
      .forEach(item => {
        const m = state.placedModules.find(pm => pm.id === item.id);
        if (m) origins[item.id] = { x: m.position.x, y: m.position.y };
      });
    dragGroupOrigins.current = origins;
    const dragged = state.placedModules.find(m => m.id === moduleId);
    dragAnchor.current = dragged ? { moduleId, origPos: { x: dragged.position.x, y: dragged.position.y } } : null;
  };

  // Handle module drag end — apply delta to all selected modules
  const handleModuleDragEnd = (moduleId: string, e: KonvaEventObject<DragEvent>) => {
    const pos = e.target.position();
    const snappedPos = snapToGrid(pos);
    const gridPos = pixelToGrid(snappedPos);

    // Reset visual position
    e.target.position(gridToPixel(gridPos));
    e.target.getStage()?.batchDraw();
    setIsDraggingModule(false);

    const anchor = dragAnchor.current;
    const origins = dragGroupOrigins.current;
    const selectedIds = Object.keys(origins);

    if (anchor && selectedIds.includes(moduleId) && selectedIds.length > 1) {
      // Multi-select drag: compute delta and move all selected modules
      const delta = { x: gridPos.x - anchor.origPos.x, y: gridPos.y - anchor.origPos.y };
      moveSelectedModules(delta);
    } else {
      // Single module drag
      moveModule(moduleId, gridPos);
    }

    dragAnchor.current = null;
    dragGroupOrigins.current = {};
  };

  const handleCanvasClick = (e: KonvaEventObject<MouseEvent>) => {
    // Ignore clicks that finished a box-select
    if (isBoxSelecting.current) return;
    // Close context menu on any canvas click
    setContextMenu(null);
    // Check if clicking on empty area
    if (e.target === e.target.getStage()) {
      selectItem(null, null);
    }
  };

  // Convert a screen-space pointer position to canvas content space
  const screenToCanvas = useCallback((screenX: number, screenY: number): Point => ({
    x: (screenX - viewport.pan.x) / viewport.zoom,
    y: (screenY - viewport.pan.y) / viewport.zoom,
  }), [viewport]);

  // Stage mouse events for Shift+drag box-select
  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (!e.evt.shiftKey || e.target !== e.target.getStage()) return;
    const p = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
    isBoxSelecting.current = true;
    setBoxSelect({ startX: p.x, startY: p.y, endX: p.x, endY: p.y });
    e.evt.preventDefault();
  };

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isBoxSelecting.current) return;
    const p = screenToCanvas(e.evt.offsetX, e.evt.offsetY);
    setBoxSelect(prev => prev ? { ...prev, endX: p.x, endY: p.y } : null);
  };

  const handleStageMouseUp = (_e: KonvaEventObject<MouseEvent>) => {
    if (!isBoxSelecting.current || !boxSelect) return;
    isBoxSelecting.current = false;

    // Rect in canvas content space
    const rx = Math.min(boxSelect.startX, boxSelect.endX);
    const ry = Math.min(boxSelect.startY, boxSelect.endY);
    const rw = Math.abs(boxSelect.endX - boxSelect.startX);
    const rh = Math.abs(boxSelect.endY - boxSelect.startY);

    if (rw > 4 || rh > 4) {
      const cellSize = grid.cellSize;
      clearSelection();
      placedModules.forEach(module => {
        const modDef = modules.find(m => m.id === module.moduleId);
        if (!modDef) return;
        const mx = module.position.x * cellSize;
        const my = module.position.y * cellSize;
        const mw = modDef.footprint.width * cellSize;
        const mh = modDef.footprint.height * cellSize;
        // AABB intersection test
        if (mx < rx + rw && mx + mw > rx && my < ry + rh && my + mh > ry) {
          addToSelection(module.id, 'module');
        }
      });
    }

    setBoxSelect(null);
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
      .filter(module => {
        const moduleLayer = layers.find(layer => layer.index === module.layer);
        return moduleLayer && moduleLayer.visible;
      })
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
        const isSelected = selectedItemId === module.id || selectedItems.some(item => item.id === module.id);

        return (
          <Group
            key={module.id}
            x={pos.x}
            y={pos.y}
            draggable
            onDragStart={() => handleModuleDragStart(module.id)}
            onDragEnd={(e) => handleModuleDragEnd(module.id, e)}
            onClick={(e) => {
              // Ctrl/Meta+click always toggles multi-selection
              if (e.evt.ctrlKey || e.evt.metaKey) {
                const alreadySelected = selectedItems.some(item => item.id === module.id);
                if (alreadySelected) {
                  useAppStore.getState().removeFromSelection(module.id);
                } else {
                  useAppStore.getState().addToSelection(module.id, 'module');
                }
              } else {
                selectItem(module.id, 'module');
              }
            }}
            onContextMenu={(e) => {
              // Show context menu at screen position
              e.evt.preventDefault();
              selectItem(module.id, 'module');
              setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, moduleId: module.id });
            }}
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
                  stroke={isSelected ? '#2980b9' : '#34495e'}
                  strokeWidth={(isSelected ? 3 : 1) / viewport.zoom}
                  opacity={0.9}
                />
              ) : (
                <Rect
                  width={moduleDefinition.footprint.width * cellSize}
                  height={moduleDefinition.footprint.height * cellSize}
                  fill={moduleDefinition.color}
                  stroke={isSelected ? '#2980b9' : '#34495e'}
                  strokeWidth={(isSelected ? 3 : 1) / viewport.zoom}
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
      ref={wrapperRef}
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative',
        touchAction: 'none', // Prevent default touch behaviors
        WebkitUserSelect: 'none',
        userSelect: 'none',
        overflow: 'hidden'
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      // Close context menu on any click outside the menu
      onClick={() => setContextMenu(null)}
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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onContextMenu={(e) => {
          // Right-click on empty canvas area: show paste-only menu
          if (e.target === e.target.getStage()) {
            e.evt.preventDefault();
            setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, moduleId: null });
          }
        }}
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
        onTouchStart={(e) => {
          // When two fingers touch, stop any ongoing drag and record pinch distance
          if (e.evt.touches.length === 2) {
            e.evt.preventDefault();
            stageRef.current?.stopDrag();
            const t1 = e.evt.touches[0];
            const t2 = e.evt.touches[1];
            touchDistRef.current = Math.hypot(
              t2.clientX - t1.clientX,
              t2.clientY - t1.clientY
            );
          } else {
            touchDistRef.current = null;
          }
        }}
        onTouchMove={(e) => {
          // Pinch-to-zoom: only process when exactly two fingers are down
          if (e.evt.touches.length !== 2 || touchDistRef.current === null) return;
          e.evt.preventDefault();
          const stage = stageRef.current;
          if (!stage) return;

          const t1 = e.evt.touches[0];
          const t2 = e.evt.touches[1];
          const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

          // Pinch centre in stage-container-local coordinates
          const stageBox = stage.container().getBoundingClientRect();
          const cx = (t1.clientX + t2.clientX) / 2 - stageBox.left;
          const cy = (t1.clientY + t2.clientY) / 2 - stageBox.top;

          const { zoom: oldScale, pan } = viewportRef.current;
          const scaleBy = newDist / touchDistRef.current;
          const newScale = Math.max(0.1, Math.min(3, oldScale * scaleBy));

          const pt = {
            x: (cx - pan.x) / oldScale,
            y: (cy - pan.y) / oldScale,
          };
          const newPos = {
            x: cx - pt.x * newScale,
            y: cy - pt.y * newScale,
          };

          // Update ref synchronously so next event sees the latest values
          viewportRef.current = { zoom: newScale, pan: newPos };
          setViewport({ zoom: newScale, pan: newPos });
          touchDistRef.current = newDist;
        }}
        onTouchEnd={() => {
          touchDistRef.current = null;
        }}
        draggable={annotationMode === 'none' && !isBoxSelecting.current}
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
        {/* Box-select rubber-band rectangle */}
        {boxSelect && (
          <Layer listening={false}>
            <Rect
              x={Math.min(boxSelect.startX, boxSelect.endX)}
              y={Math.min(boxSelect.startY, boxSelect.endY)}
              width={Math.abs(boxSelect.endX - boxSelect.startX)}
              height={Math.abs(boxSelect.endY - boxSelect.startY)}
              fill="rgba(41, 128, 185, 0.08)"
              stroke="#2980b9"
              strokeWidth={1 / viewport.zoom}
              dash={[5 / viewport.zoom, 3 / viewport.zoom]}
            />
          </Layer>
        )}
        {/* Ray tracing overlay */}
        <Layer listening={false}>
          <RayOverlay 
            viewport={viewport}
            gridCellSize={grid.cellSize}
          />
          {/* Physical geometry icons overlaid when enabled */}
          <PhysicalModuleOverlay
            viewport={viewport}
            gridCellSize={grid.cellSize}
          />
        </Layer>
        {/* Annotations always on top */}
        <Layer listening={annotationMode !== 'none'}>
          <AnnotationCanvas 
            currentLayerIndex={currentLayerIndex}
            viewport={viewport}
          />
        </Layer>
      </Stage>

      {/* Context menu (rendered as regular DOM element over the canvas) */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#fff',
            border: '1px solid #dde1e7',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 99999,
            minWidth: 170,
            padding: '4px 0',
            fontSize: 13,
          }}
          // Stop propagation so the parent onClick (which closes menu) is not triggered
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.moduleId && (
            <>
              <div
                style={ctxItemStyle}
                onMouseEnter={ctxItemHover}
                onMouseLeave={ctxItemLeave}
                onClick={() => { copyToClipboard(); setContextMenu(null); }}
              >Copy&nbsp;&nbsp;<span style={{color:'#888',fontSize:11}}>Ctrl+C</span></div>
              <div
                style={ctxItemStyle}
                onMouseEnter={ctxItemHover}
                onMouseLeave={ctxItemLeave}
                onClick={() => { cutToClipboard(); setContextMenu(null); }}
              >Cut&nbsp;&nbsp;<span style={{color:'#888',fontSize:11}}>Ctrl+X</span></div>
            </>
          )}
          <div
            style={ctxItemStyle}
            onMouseEnter={ctxItemHover}
            onMouseLeave={ctxItemLeave}
            onClick={() => { pasteFromClipboard(); setContextMenu(null); }}
          >Paste&nbsp;&nbsp;<span style={{color:'#888',fontSize:11}}>Ctrl+V</span></div>
          {contextMenu.moduleId && (
            <>
              <div style={{ borderTop: '1px solid #eee', margin: '4px 0' }} />
              <div
                style={{ ...ctxItemStyle, color: '#e53935' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff3f3'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                onClick={() => { deleteSelectedItems(); setContextMenu(null); }}
              >Delete&nbsp;&nbsp;<span style={{color:'#e57373',fontSize:11}}>Del</span></div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
import React, { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  ButtonGroup,
  Button,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Paper,
} from '@mui/material';
import { Stage, Layer, Line, Rect, Circle, Ellipse, Text, Group } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';

export type DrawingTool = 'freehand' | 'rectangle' | 'circle' | 'ellipse' | 'text';

interface DrawingElement {
  id: string;
  type: DrawingTool;
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

interface ModuleDrawingCanvasProps {
  moduleSize: { width: number; height: number };
  elements: DrawingElement[];
  onElementsChange: (elements: DrawingElement[]) => void;
  onCanvasExport?: (dataUrl: string) => void;
}

const CELL_SIZE = 80; // Size of each grid cell in pixels
const COLORS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

export const ModuleDrawingCanvas = React.forwardRef<
  { exportAsImage: () => string | null; exportAsSVG: () => string | null },
  ModuleDrawingCanvasProps
>(({
  moduleSize,
  elements,
  onElementsChange,
  onCanvasExport
}, ref) => {
  const [activeTool, setActiveTool] = useState<DrawingTool>('freehand');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [textInput, setTextInput] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const stageRef = useRef<Konva.Stage>(null);

  const canvasWidth = moduleSize.width * CELL_SIZE;
  const canvasHeight = moduleSize.height * CELL_SIZE;

  const generateId = () => `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // History management
  const addToHistory = useCallback((newElements: DrawingElement[]) => {
    console.log('🎨 addToHistory called with', newElements.length, 'elements');
    console.log('🎨 Elements being added:', newElements);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newElements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    console.log('🎨 Calling onElementsChange with', newElements.length, 'elements');
    onElementsChange(newElements);
  }, [history, historyIndex, onElementsChange]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onElementsChange(history[newIndex]);
    }
  }, [historyIndex, history, onElementsChange]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onElementsChange(history[newIndex]);
    }
  }, [historyIndex, history, onElementsChange]);

  // Generate SVG from drawing elements
  const generateSVGFromElements = useCallback((elements: DrawingElement[], width: number, height: number): string => {
    console.log('🎨 generateSVGFromElements called with:');
    console.log('- Elements count:', elements.length);
    console.log('- Canvas size:', { width, height });
    console.log('- Module size:', moduleSize);
    console.log('- Elements data:', elements);
    
    const svgElements: string[] = [];
    
    // Add grid background
    const gridLines: string[] = [];
    // Vertical lines
    for (let i = 0; i <= moduleSize.width; i++) {
      const x = i * CELL_SIZE;
      gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ddd" stroke-width="1"/>`);
    }
    // Horizontal lines
    for (let i = 0; i <= moduleSize.height; i++) {
      const y = i * CELL_SIZE;
      gridLines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ddd" stroke-width="1"/>`);
    }
    
    svgElements.push(...gridLines);
    console.log('🎨 Added', gridLines.length, 'grid lines');
    
    // Convert each drawing element to SVG
    let processedElements = 0;
    elements.forEach((element) => {
      console.log('🎨 Processing element:', element);
      switch (element.type) {
        case 'freehand': {
          if (element.points && element.points.length >= 4) {
            let pathData = `M ${element.points[0]} ${element.points[1]}`;
            for (let i = 2; i < element.points.length; i += 2) {
              pathData += ` L ${element.points[i]} ${element.points[i + 1]}`;
            }
            svgElements.push(
              `<path d="${pathData}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="none" stroke-linecap="round"/>`
            );
            processedElements++;
          }
          break;
        }
        
        case 'rectangle':
          svgElements.push(
            `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
          );
          processedElements++;
          break;
        
        case 'circle':
          svgElements.push(
            `<circle cx="${element.x}" cy="${element.y}" r="${element.radius}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
          );
          processedElements++;
          break;
        
        case 'ellipse':
          svgElements.push(
            `<ellipse cx="${element.x}" cy="${element.y}" rx="${element.radiusX || 0}" ry="${element.radiusY || 0}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
          );
          processedElements++;
          break;
        
        case 'text':
          svgElements.push(
            `<text x="${element.x}" y="${element.y}" fill="${element.fill || '#000'}" font-size="16" font-family="Arial">${element.text || ''}</text>`
          );
          processedElements++;
          break;
      }
    });
    
    console.log('🎨 SVG generation complete:');
    console.log('- Processed', processedElements, 'drawing elements');
    console.log('- Total SVG elements:', svgElements.length);
    
    const finalSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
${svgElements.join('\n')}
</svg>`;
    
    console.log('🎨 Final SVG:', finalSvg);
    return finalSvg;
  }, [moduleSize]);

  // Export canvas as SVG
  const exportCanvasAsSVG = useCallback(() => {
    try {
      console.log('🎨 ModuleDrawingCanvas: Starting SVG export...');
      console.log('Elements to export:', elements.length);
      console.log('Canvas dimensions:', { width: canvasWidth, height: canvasHeight });
      console.log('Elements data:', elements);
      
      // Force use the latest elements from props
      const svg = generateSVGFromElements(elements, canvasWidth, canvasHeight);
      
      console.log('🎨 Generated SVG length:', svg.length);
      console.log('🎨 Generated SVG content:');
      console.log(svg);
      
      if (onCanvasExport) {
        onCanvasExport(svg);
      }
      return svg;
    } catch (error) {
      console.error('🎨 Failed to export canvas as SVG:', error);
      return null;
    }
  }, [elements, canvasWidth, canvasHeight, onCanvasExport, generateSVGFromElements]);

  // Export canvas as image (kept for backward compatibility)
  const exportCanvasAsImage = useCallback(() => {
    return exportCanvasAsSVG();
  }, [exportCanvasAsSVG]);

  // Expose export function to parent
  React.useImperativeHandle(ref, () => {
    console.log('🎨 ModuleDrawingCanvas: useImperativeHandle being called');
    console.log('🎨 Exposing methods:', { exportAsImage: !!exportCanvasAsImage, exportAsSVG: !!exportCanvasAsSVG });
    
    return {
      exportAsImage: exportCanvasAsImage,
      exportAsSVG: exportCanvasAsSVG
    };
  }, [exportCanvasAsImage, exportCanvasAsSVG]);

  // Debug component mounting
  React.useEffect(() => {
    console.log('🎨 ModuleDrawingCanvas: Component mounted/updated');
    console.log('🎨 Current elements:', elements.length);
    console.log('🎨 Module size:', moduleSize);
  }, [elements.length, moduleSize]);

  // Initialize history with current elements
  React.useEffect(() => {
    if (history.length === 1 && history[0].length === 0 && elements.length > 0) {
      setHistory([elements]);
      setHistoryIndex(0);
    }
  }, [elements, history]);

  const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    console.log('🖱️ handleMouseDown triggered');
    console.log('🖱️ selectMode:', selectMode);
    console.log('🖱️ activeTool:', activeTool);
    
    if (selectMode) {
      console.log('🖱️ In select mode, skipping draw');
      return;
    }

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) {
      console.log('🖱️ No position available');
      return;
    }

    console.log('🖱️ Starting draw at position:', pos);
    setIsDrawing(true);
    const id = generateId();

    switch (activeTool) {
      case 'freehand':
        console.log('🖱️ Creating freehand element');
        setCurrentElement({
          id,
          type: 'freehand',
          points: [pos.x, pos.y],
          stroke: currentColor,
          strokeWidth,
        });
        break;
      
      case 'rectangle':
        setCurrentElement({
          id,
          type: 'rectangle',
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
          stroke: currentColor,
          strokeWidth,
        });
        break;
      
      case 'circle':
        setCurrentElement({
          id,
          type: 'circle',
          x: pos.x,
          y: pos.y,
          radius: 0,
          stroke: currentColor,
          strokeWidth,
        });
        break;
      
      case 'ellipse':
        setCurrentElement({
          id,
          type: 'ellipse',
          x: pos.x,
          y: pos.y,
          radiusX: 0,
          radiusY: 0,
          stroke: currentColor,
          strokeWidth,
        });
        break;
      
      case 'text':
        if (textInput.trim()) {
          const newElement: DrawingElement = {
            id,
            type: 'text',
            x: pos.x,
            y: pos.y,
            text: textInput,
            fill: currentColor,
          };
          const newElements = [...elements, newElement];
          addToHistory(newElements);
          setTextInput('');
        }
        setIsDrawing(false);
        break;
    }
  }, [activeTool, elements, addToHistory, currentColor, strokeWidth, textInput, selectMode]);

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !currentElement || selectMode || activeTool === 'text') return;

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    const updatedElement = { ...currentElement };

    switch (activeTool) {
      case 'freehand':
        if (updatedElement.points) {
          updatedElement.points = [...updatedElement.points, pos.x, pos.y];
        }
        break;
      
      case 'rectangle':
        updatedElement.width = pos.x - (updatedElement.x || 0);
        updatedElement.height = pos.y - (updatedElement.y || 0);
        break;
      
      case 'circle':
        const dx = pos.x - (updatedElement.x || 0);
        const dy = pos.y - (updatedElement.y || 0);
        updatedElement.radius = Math.sqrt(dx * dx + dy * dy);
        break;
      
      case 'ellipse':
        updatedElement.radiusX = Math.abs(pos.x - (updatedElement.x || 0));
        updatedElement.radiusY = Math.abs(pos.y - (updatedElement.y || 0));
        break;
    }

    setCurrentElement(updatedElement);
  }, [isDrawing, currentElement, activeTool, selectMode]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentElement || activeTool === 'text') return;

    const newElements = [...elements, currentElement];
    addToHistory(newElements);
    setCurrentElement(null);
    setIsDrawing(false);
  }, [isDrawing, currentElement, elements, addToHistory, activeTool]);

  const renderElements = () => {
    const allElements = [...elements];
    if (currentElement) {
      allElements.push(currentElement);
    }

    return allElements.map((element) => {
      switch (element.type) {
        case 'freehand':
          return (
            <Line
              key={element.id}
              points={element.points}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth}
              tension={0.5}
              lineCap="round"
            />
          );
        
        case 'rectangle':
          return (
            <Rect
              key={element.id}
              x={element.x}
              y={element.y}
              width={element.width}
              height={element.height}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth}
              fill="transparent"
            />
          );
        
        case 'circle':
          return (
            <Circle
              key={element.id}
              x={element.x}
              y={element.y}
              radius={element.radius}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth}
              fill="transparent"
            />
          );
        
        case 'ellipse':
          return (
            <Ellipse
              key={element.id}
              x={element.x}
              y={element.y}
              radiusX={element.radiusX || 0}
              radiusY={element.radiusY || 0}
              stroke={element.stroke}
              strokeWidth={element.strokeWidth}
              fill="transparent"
            />
          );
        
        case 'text':
          return (
            <Text
              key={element.id}
              x={element.x}
              y={element.y}
              text={element.text}
              fill={element.fill}
              fontSize={16}
              fontFamily="Arial"
            />
          );
        
        default:
          return null;
      }
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Draw Your Module Design
      </Typography>
      
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <ButtonGroup size="small">
            <Button
              variant={selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(true); setActiveTool('freehand');}}
            >
              Select
            </Button>
            <Button
              variant={activeTool === 'freehand' && !selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(false); setActiveTool('freehand');}}
            >
              Freehand
            </Button>
            <Button
              variant={activeTool === 'rectangle' && !selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(false); setActiveTool('rectangle');}}
            >
              Rectangle
            </Button>
            <Button
              variant={activeTool === 'circle' && !selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(false); setActiveTool('circle');}}
            >
              Circle
            </Button>
            <Button
              variant={activeTool === 'ellipse' && !selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(false); setActiveTool('ellipse');}}
            >
              Ellipse
            </Button>
            <Button
              variant={activeTool === 'text' && !selectMode ? 'contained' : 'outlined'}
              onClick={() => {setSelectMode(false); setActiveTool('text');}}
            >
              Text
            </Button>
          </ButtonGroup>

          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>Color</InputLabel>
            <Select
              value={currentColor}
              onChange={(e) => setCurrentColor(e.target.value)}
              label="Color"
            >
              {COLORS.map((color) => (
                <MenuItem key={color} value={color}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      backgroundColor: color,
                      border: '1px solid #ccc',
                      mr: 1,
                      display: 'inline-block'
                    }}
                  />
                  {color}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ width: 120 }}>
            <Typography variant="caption">Stroke Width</Typography>
            <Slider
              value={strokeWidth}
              onChange={(_, value) => setStrokeWidth(value as number)}
              min={1}
              max={10}
              step={1}
              size="small"
            />
          </Box>

          {activeTool === 'text' && (
            <TextField
              size="small"
              label="Text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text to place"
            />
          )}

          <Button
            size="small"
            onClick={() => addToHistory([])}
            disabled={elements.length === 0}
          >
            Clear All
          </Button>

          <Button
            size="small"
            onClick={undo}
            disabled={historyIndex <= 0}
          >
            Undo
          </Button>

          <Button
            size="small"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            Redo
          </Button>
        </Box>
      </Paper>

      <Paper
        sx={{
          p: 1,
          display: 'inline-block',
          border: '2px solid #ccc',
        }}
      >
        <Stage
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          ref={stageRef}
        >
          <Layer>
            {/* Grid background */}
            <Group>
              {Array.from({ length: moduleSize.width + 1 }, (_, i) => (
                <Line
                  key={`v-${i}`}
                  points={[i * CELL_SIZE, 0, i * CELL_SIZE, canvasHeight]}
                  stroke="#ddd"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: moduleSize.height + 1 }, (_, i) => (
                <Line
                  key={`h-${i}`}
                  points={[0, i * CELL_SIZE, canvasWidth, i * CELL_SIZE]}
                  stroke="#ddd"
                  strokeWidth={1}
                />
              ))}
            </Group>
            {renderElements()}
          </Layer>
        </Stage>
      </Paper>
      
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Canvas size: {moduleSize.width} × {moduleSize.height} grid units
      </Typography>
    </Box>
  );
});
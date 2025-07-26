import React, { useState } from 'react';
import { Line, Arrow, Text, Group, Rect } from 'react-konva';
import { useAppStore } from '../stores/appStore';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Point, Annotation } from '../types';

interface AnnotationCanvasProps {
  currentLayerIndex: number;
  viewport: { zoom: number; pan: Point };
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({ 
  currentLayerIndex, 
  viewport
}) => {
  const { 
    annotations, 
    annotationMode, 
    addAnnotation, 
    moveAnnotation,
    selectItem, 
    selectedItemId,
    setAnnotationMode 
  } = useAppStore();
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  const handleCanvasClick = (e: KonvaEventObject<MouseEvent>) => {
    if (annotationMode === 'none') return;

    // Stop event propagation to prevent canvas click
    e.cancelBubble = true;
    
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Transform position based on viewport - corrected calculation
    const transformedPos = {
      x: pos.x / viewport.zoom - viewport.pan.x / viewport.zoom,
      y: pos.y / viewport.zoom - viewport.pan.y / viewport.zoom
    };

    if (annotationMode === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        addAnnotation({
          type: 'text',
          layer: currentLayerIndex,
          points: [transformedPos],
          text,
          style: {
            color: '#000000',
            fontSize: 14,
            fontFamily: 'Arial'
          }
        });
      }
      setAnnotationMode('none');
      return;
    }

    if (annotationMode === 'line' || annotationMode === 'arrow' || annotationMode === 'optical-axis') {
      if (!isDrawing) {
        setIsDrawing(true);
        setCurrentPoints([transformedPos]);
      } else {
        // Finish drawing
        const newPoints = [...currentPoints, transformedPos];
        
        let annotationType: Annotation['type'] = 'line';
        let style: Annotation['style'] = { color: '#000000', strokeWidth: 2 };
        
        if (annotationMode === 'arrow') {
          annotationType = 'arrow';
        } else if (annotationMode === 'optical-axis') {
          annotationType = 'optical-axis';
          style = { color: '#ff0000', strokeWidth: 2, strokeStyle: 'dashed' };
        }
        
        addAnnotation({
          type: annotationType,
          layer: currentLayerIndex,
          points: newPoints,
          style
        });
        
        setIsDrawing(false);
        setCurrentPoints([]);
        setAnnotationMode('none');
      }
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || currentPoints.length === 0) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const transformedPos = {
      x: pos.x / viewport.zoom - viewport.pan.x / viewport.zoom,
      y: pos.y / viewport.zoom - viewport.pan.y / viewport.zoom
    };

    // For preview, only keep the start point and current mouse position
    setCurrentPoints([currentPoints[0], transformedPos]);
  };

  const renderAnnotations = () => {
    const layerAnnotations = annotations.filter(ann => ann.layer === currentLayerIndex);
    
    return layerAnnotations.map(annotation => {
      const isSelected = selectedItemId === annotation.id;
      const strokeColor = isSelected ? '#2980b9' : (annotation.style?.color || '#000000');
      const strokeWidth = ((annotation.style?.strokeWidth || 2) * (isSelected ? 1.5 : 1)) / viewport.zoom;
      
      if (annotation.type === 'text' && annotation.points && annotation.points.length > 0) {
        return (
          <Text
            key={annotation.id}
            x={annotation.points[0].x}
            y={annotation.points[0].y}
            text={annotation.text || ''}
            fontSize={(annotation.style?.fontSize || 14) / viewport.zoom}
            fontFamily={annotation.style?.fontFamily || 'Arial'}
            fill={strokeColor}
            draggable
            onClick={() => selectItem(annotation.id, 'annotation')}
            onDragEnd={(e) => {
              const pos = e.target.position();
              moveAnnotation(annotation.id, pos);
            }}
          />
        );
      }
      
      if (annotation.points && annotation.points.length >= 2) {
        const points = annotation.points.flatMap(p => [p.x, p.y]);
        
        if (annotation.type === 'arrow') {
          return (
            <Arrow
              key={annotation.id}
              points={points}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill={strokeColor}
              onClick={() => selectItem(annotation.id, 'annotation')}
            />
          );
        } else if (annotation.type === 'optical-axis') {
          return (
            <Line
              key={annotation.id}
              points={points}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              dash={[10, 5]}
              onClick={() => selectItem(annotation.id, 'annotation')}
            />
          );
        } else {
          return (
            <Line
              key={annotation.id}
              points={points}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              onClick={() => selectItem(annotation.id, 'annotation')}
            />
          );
        }
      }
      
      return null;
    });
  };

  const renderCurrentDrawing = () => {
    if (!isDrawing || currentPoints.length < 1) return null;
    
    const points = currentPoints.flatMap(p => [p.x, p.y]);
    
    if (annotationMode === 'arrow') {
      return (
        <Arrow
          points={points}
          stroke="#666666"
          strokeWidth={2}
          fill="#666666"
          opacity={0.7}
        />
      );
    } else if (annotationMode === 'optical-axis') {
      return (
        <Line
          points={points}
          stroke="#ff0000"
          strokeWidth={2}
          dash={[10, 5]}
          opacity={0.7}
        />
      );
    } else {
      return (
        <Line
          points={points}
          stroke="#666666"
          strokeWidth={2}
          opacity={0.7}
        />
      );
    }
  };

  return (
    <Group
      listening={annotationMode !== 'none'}
    >
      {/* Invisible background to capture mouse events - only when in annotation mode */}
      {annotationMode !== 'none' && (
        <Rect
          x={-5000}
          y={-5000}
          width={10000}
          height={10000}
          fill="transparent"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          listening={true}
        />
      )}
      {renderAnnotations()}
      {renderCurrentDrawing()}
    </Group>
  );
};
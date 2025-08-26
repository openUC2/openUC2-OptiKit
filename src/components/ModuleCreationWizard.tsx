import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { ModuleSizeSelector } from './ModuleSizeSelector';
import { ModuleDrawingCanvas } from './ModuleDrawingCanvas';
import { ModuleMetadataForm, type ModuleMetadata } from './ModuleMetadataForm';
import { saveModuleToGitHubCSV } from '../utils/csvHandler';
import { useAppStore } from '../stores/appStore';

interface DrawingElement {
  id: string;
  type: 'freehand' | 'rectangle' | 'circle' | 'ellipse' | 'text';
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

export type { DrawingElement };

interface CustomModule {
  id: string;
  name: string;
  group: string;
  color: string;
  width: string;
  height: string;
  thumbnail: string;
  cadUrl: string;
  description: string;
  defaultParams: string;
  price: string;
  notification: string;
  linkUrl: string;
  isCustom: boolean;
}

interface ModuleCreationWizardProps {
  open: boolean;
  onClose: () => void;
  onModuleCreated?: (module: CustomModule) => void;
}

const steps = ['Module Size', 'Draw Design', 'Module Details', 'Review & Save'];

// Manual SVG generation function as fallback
const generateManualSVG = (elements: DrawingElement[], moduleSize: { width: number; height: number }): string => {
  const CELL_SIZE = 80;
  const width = moduleSize.width * CELL_SIZE;
  const height = moduleSize.height * CELL_SIZE;
  
  console.log('🔧 Manual SVG generation:', { elements: elements.length, width, height });
  
  const svgElements: string[] = [];
  
  // Add grid background
  for (let i = 0; i <= moduleSize.width; i++) {
    const x = i * CELL_SIZE;
    svgElements.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#ddd" stroke-width="1"/>`);
  }
  for (let i = 0; i <= moduleSize.height; i++) {
    const y = i * CELL_SIZE;
    svgElements.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#ddd" stroke-width="1"/>`);
  }
  
  // Convert drawing elements to SVG
  elements.forEach((element) => {
    console.log('🔧 Processing element manually:', element.type);
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
        }
        break;
      }
      case 'rectangle':
        svgElements.push(
          `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
        );
        break;
      case 'circle':
        svgElements.push(
          `<circle cx="${element.x}" cy="${element.y}" r="${element.radius}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
        );
        break;
      case 'ellipse':
        svgElements.push(
          `<ellipse cx="${element.x}" cy="${element.y}" rx="${element.radiusX || 0}" ry="${element.radiusY || 0}" stroke="${element.stroke || '#000'}" stroke-width="${element.strokeWidth || 2}" fill="transparent"/>`
        );
        break;
      case 'text':
        svgElements.push(
          `<text x="${element.x}" y="${element.y}" fill="${element.fill || '#000'}" font-size="16" font-family="Arial">${element.text || ''}</text>`
        );
        break;
    }
  });
  
  const finalSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
${svgElements.join('\n')}
</svg>`;
  
  console.log('🔧 Manual SVG generated:', finalSvg);
  return finalSvg;
};

export const ModuleCreationWizard: React.FC<ModuleCreationWizardProps> = ({
  open,
  onClose,
  onModuleCreated
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [moduleSize, setModuleSize] = useState({ width: 1, height: 1 });
  const [drawingElements, setDrawingElements] = useState<DrawingElement[]>([]);
  const [capturedSVG, setCapturedSVG] = useState<string>(''); // Store captured SVG

  // Enhanced debugging for drawing elements changes
  const handleDrawingElementsChange = useCallback((newElements: DrawingElement[]) => {
    console.log('🎨 Drawing elements changed:', {
      from: drawingElements.length,
      to: newElements.length,
      elements: newElements
    });
    setDrawingElements(newElements);
  }, [drawingElements.length]);
  const [metadata, setMetadata] = useState<ModuleMetadata>({
    name: '',
    group: 'custom',
    color: '#1e4670',
    description: '',
    price: undefined,
    notification: '',
    linkUrl: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  const { loadModules } = useAppStore();
  const drawingCanvasRef = useRef<{ exportAsImage: () => string | null; exportAsSVG: () => string | null } | null>(null);

  // Debug ref changes
  React.useEffect(() => {
    console.log('🖼️ Drawing canvas ref changed:', {
      isNull: drawingCanvasRef.current === null,
      hasExportAsSVG: drawingCanvasRef.current?.exportAsSVG !== undefined,
      methods: drawingCanvasRef.current ? Object.keys(drawingCanvasRef.current) : 'none'
    });
  }, [drawingCanvasRef.current]);

  const handleNext = async () => {
    // Capture SVG when leaving the drawing step (step 1)
    if (activeStep === 1) {
      console.log('🚀 Leaving drawing step - capturing SVG...');
      console.log('🖼️ Canvas ref available:', !!drawingCanvasRef.current);
      console.log('🎨 Current drawing elements in wizard state:', drawingElements.length);
      console.log('🎨 Drawing elements data:', drawingElements);
      
      if (drawingCanvasRef.current && drawingCanvasRef.current.exportAsSVG) {
        try {
          const svgData = drawingCanvasRef.current.exportAsSVG();
          console.log('✅ SVG captured successfully:', !!svgData);
          console.log('SVG length:', svgData ? svgData.length : 0);
          if (svgData) {
            console.log('SVG preview (first 200 chars):', svgData.substring(0, 200));
            setCapturedSVG(svgData);
          }
        } catch (error) {
          console.error('❌ Failed to capture SVG:', error);
        }
      } else {
        console.warn('⚠️ Canvas ref not available when leaving drawing step');
        
        // Fallback: Generate SVG manually from the drawing elements
        if (drawingElements.length > 0) {
          console.log('🔧 Attempting manual SVG generation from elements...');
          const manualSVG = generateManualSVG(drawingElements, moduleSize);
          if (manualSVG) {
            console.log('✅ Manual SVG generated successfully');
            setCapturedSVG(manualSVG);
          }
        }
      }
    }
    
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setModuleSize({ width: 1, height: 1 });
    setDrawingElements([]);
    setCapturedSVG(''); // Reset captured SVG
    setMetadata({
      name: '',
      group: 'custom',
      color: '#1e4670',
      description: '',
      price: undefined,
      notification: '',
      linkUrl: ''
    });
  };

  const canProceedToNext = () => {
    switch (activeStep) {
      case 0:
        return true; // Size is always valid
      case 1:
        return true; // Drawing is optional
      case 2:
        return metadata.name.trim() && metadata.description.trim();
      default:
        return true;
    }
  };

  const handleCreateModule = async () => {
    setIsCreating(true);
    try {
      // DETAILED DEBUGGING: Check drawing state
      console.log('🚀 === STARTING MODULE CREATION ===');
      console.log('📏 Module size:', moduleSize);
      console.log('📝 Metadata:', metadata);
      console.log('🎨 Drawing elements count:', drawingElements.length);
      console.log('🎨 Drawing elements data:', JSON.stringify(drawingElements, null, 2));
      console.log('🖼️ Canvas ref available:', !!drawingCanvasRef.current);
      
      // Log each individual drawing element for debugging
      drawingElements.forEach((element, index) => {
        console.log(`🎨 Element ${index}:`, {
          id: element.id,
          type: element.type,
          hasPoints: !!element.points,
          pointsLength: element.points?.length || 0,
          hasCoordinates: !!(element.x !== undefined && element.y !== undefined),
          stroke: element.stroke,
          strokeWidth: element.strokeWidth
        });
      });

      // Use pre-captured SVG data
      console.log('📸 Using pre-captured SVG data...');
      console.log('🎨 Captured SVG available:', !!capturedSVG);
      console.log('🎨 Captured SVG length:', capturedSVG.length);
      
      if (capturedSVG) {
        console.log('✅ Using captured SVG for upload');
        console.log('SVG preview (first 200 chars):', capturedSVG.substring(0, 200));
      } else {
        console.warn('⚠️ No pre-captured SVG available - will generate from elements');
        
        // Fallback: try to generate SVG from elements if no captured SVG
        if (drawingElements.length > 0) {
          console.log('📝 Will generate fallback from drawing elements');
        }
      }

      console.log('Calling saveModuleToGitHubCSV with:', {
        hasMetadata: !!metadata,
        hasModuleSize: !!moduleSize,
        hasDrawingElements: drawingElements.length > 0,
        hasSVGData: !!capturedSVG,
        svgDataLength: capturedSVG.length
      });

      // Save module to GitHub CSV with SVG icon
      const result = await saveModuleToGitHubCSV({
        metadata,
        moduleSize,
        drawingElements,
        canvasSVGData: capturedSVG // Use the captured SVG directly
      });

      console.log('GitHub save result:', result);

      if (result.success) {
        // Reload modules to include the new one in the sidebar
        await loadModules();
        
        // Generate unique ID for the custom module
        const moduleId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create module data structure for callback
        const customModule: CustomModule = {
          id: moduleId,
          name: metadata.name,
          group: metadata.group,
          color: metadata.color,
          width: moduleSize.width.toString(),
          height: moduleSize.height.toString(),
          thumbnail: result.iconPath || '', // Use the uploaded SVG icon path
          cadUrl: '',
          description: metadata.description,
          defaultParams: JSON.stringify({
            height: 50,
            drawingElements,
            isCustom: true
          }),
          price: metadata.price?.toString() || '',
          notification: metadata.notification || '',
          linkUrl: metadata.linkUrl || '',
          isCustom: true
        };

        // Notify parent component
        if (onModuleCreated) {
          onModuleCreated(customModule);
        }

        // Reset wizard and close
        handleReset();
        onClose();

        alert('✅ Custom module saved to GitHub successfully! It will appear in the part library shortly.');
      } else {
        alert('❌ Failed to save custom module to GitHub. Please try again.');
      }
    } catch (error) {
      console.error('Error creating custom module:', error);
      alert('❌ Error creating custom module. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <ModuleSizeSelector
            selectedSize={moduleSize}
            onSizeSelect={(width, height) => setModuleSize({ width, height })}
          />
        );
      case 1:
        return (
          <ModuleDrawingCanvas
            ref={drawingCanvasRef}
            moduleSize={moduleSize}
            elements={drawingElements}
            onElementsChange={handleDrawingElementsChange}
          />
        );
      case 2:
        return (
          <ModuleMetadataForm
            metadata={metadata}
            onMetadataChange={setMetadata}
          />
        );
      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review Your Custom Module
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Review your module details below. Once created, the module will be saved to the openUC2 parts database and will appear in your part library.
            </Alert>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Typography><strong>Name:</strong> {metadata.name}</Typography>
              <Typography><strong>Size:</strong> {moduleSize.width} × {moduleSize.height}</Typography>
              <Typography><strong>Group:</strong> {metadata.group}</Typography>
              <Typography><strong>Description:</strong> {metadata.description}</Typography>
              <Typography><strong>Drawing Elements:</strong> {drawingElements.length} element(s)</Typography>
              <Typography><strong>SVG Icon:</strong> {capturedSVG ? `Ready (${capturedSVG.length} chars)` : 'Not captured'}</Typography>
              {metadata.linkUrl && <Typography><strong>Part Link:</strong> {metadata.linkUrl}</Typography>}
              {metadata.price && <Typography><strong>Price:</strong> €{metadata.price}</Typography>}
              {metadata.notification && (
                <Typography><strong>Note:</strong> {metadata.notification}</Typography>
              )}
            </Box>
          </Box>
        );
      default:
        return 'Unknown step';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle>Create Custom Module</DialogTitle>
      
      <DialogContent>
        <Box sx={{ width: '100%', mb: 3 }}>
          <Stepper activeStep={activeStep}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Box sx={{ mt: 2, mb: 1 }}>
          {renderStepContent(activeStep)}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isCreating}>Cancel</Button>
        <Button
          disabled={activeStep === 0 || isCreating}
          onClick={handleBack}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={activeStep === steps.length - 1 ? handleCreateModule : handleNext}
          disabled={!canProceedToNext() || isCreating}
          startIcon={isCreating && activeStep === steps.length - 1 ? <CircularProgress size={16} /> : undefined}
        >
          {activeStep === steps.length - 1 ? (isCreating ? 'Creating...' : 'Create Module') : 'Next'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
import React, { useState, useRef } from 'react';
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

export const ModuleCreationWizard: React.FC<ModuleCreationWizardProps> = ({
  open,
  onClose,
  onModuleCreated
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [moduleSize, setModuleSize] = useState({ width: 1, height: 1 });
  const [drawingElements, setDrawingElements] = useState<DrawingElement[]>([]);
  const [canvasSVGData, setCanvasSVGData] = useState<string>('');
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

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setModuleSize({ width: 1, height: 1 });
    setDrawingElements([]);
    setCanvasSVGData('');
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
      // Capture canvas SVG before saving
      if (drawingCanvasRef.current && drawingCanvasRef.current.exportAsSVG) {
        const svgData = drawingCanvasRef.current.exportAsSVG();
        if (svgData) {
          setCanvasSVGData(svgData);
        }
      }

      // Save module to GitHub CSV with SVG icon
      const success = await saveModuleToGitHubCSV({
        metadata,
        moduleSize,
        drawingElements,
        canvasSVGData: canvasSVGData || ''
      });

      if (success) {
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
          thumbnail: '', // Could generate a thumbnail from the drawing
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
            onElementsChange={setDrawingElements}
            onCanvasExport={setCanvasSVGData}
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
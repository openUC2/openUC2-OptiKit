import React, { useState, useEffect } from 'react';
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
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Memory as MemoryIcon,
  Camera as CameraIcon,
  Lightbulb as LightbulbIcon,
  OpenWith as OpenWithIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import type { 
  ImSwitchConfiguration, 
  AvailableController,
  PlacedModule 
} from '../types';

interface ImSwitchConfigWizardProps {
  open: boolean;
  onClose: () => void;
}

const steps = ['Module Analysis', 'Controller Selection', 'Configuration Preview', 'Export'];

// Default available controllers
const DEFAULT_CONTROLLERS: AvailableController[] = [
  {
    id: 'settings',
    name: 'Settings',
    description: 'Basic application settings and configuration',
    category: 'widget',
  },
  {
    id: 'view',
    name: 'View',
    description: 'Camera view and image display',
    category: 'widget',
    dependencies: ['camera']
  },
  {
    id: 'recording',
    name: 'Recording',
    description: 'Video and image recording functionality',
    category: 'widget',
    dependencies: ['camera']
  },
  {
    id: 'image',
    name: 'Image',
    description: 'Image processing and analysis tools',
    category: 'widget',
    dependencies: ['camera']
  },
  {
    id: 'laser',
    name: 'Laser',
    description: 'Laser control and management',
    category: 'widget',
    dependencies: ['laser']
  },
  {
    id: 'positioner',
    name: 'Positioner',
    description: 'Stage and positioning controls',
    category: 'widget',
    dependencies: ['stage']
  },
  {
    id: 'autofocus',
    name: 'Autofocus',
    description: 'Automatic focusing system',
    category: 'widget',
    dependencies: ['camera', 'stage']
  },
  {
    id: 'focuslock',
    name: 'Focus Lock',
    description: 'Real-time focus stabilization',
    category: 'widget',
    dependencies: ['camera', 'stage']
  },
  {
    id: 'mct',
    name: 'MCT',
    description: 'Multi-channel time-lapse imaging',
    category: 'widget',
  },
  {
    id: 'uc2config',
    name: 'UC2Config',
    description: 'UC2 system configuration tools',
    category: 'widget',
  },
  {
    id: 'pixelcalibration',
    name: 'Pixel Calibration',
    description: 'Camera pixel size calibration',
    category: 'widget',
    dependencies: ['camera']
  },
  {
    id: 'histoscan',
    name: 'HistoScan',
    description: 'Histology scanning functionality',
    category: 'widget',
    dependencies: ['camera', 'stage']
  },
  {
    id: 'joystick',
    name: 'Joystick',
    description: 'Manual stage control with joystick',
    category: 'widget',
    dependencies: ['stage']
  },
  {
    id: 'flatfield',
    name: 'Flatfield',
    description: 'Flat field correction',
    category: 'widget',
    dependencies: ['camera']
  },
  {
    id: 'roiscan',
    name: 'ROI Scan',
    description: 'Region of interest scanning',
    category: 'widget',
    dependencies: ['camera', 'stage']
  },
  {
    id: 'objective',
    name: 'Objective',
    description: 'Objective lens control',
    category: 'widget',
  },
  {
    id: 'experiment',
    name: 'Experiment',
    description: 'Experiment workflow management',
    category: 'widget',
  },
  {
    id: 'lightsheet',
    name: 'Lightsheet',
    description: 'Light sheet microscopy controls',
    category: 'widget',
    dependencies: ['laser', 'camera']
  },
  {
    id: 'esp32infoscreen',
    name: 'ESP32 Info Screen',
    description: 'ESP32 device information and diagnostics',
    category: 'widget',
  },
  {
    id: 'wifi',
    name: 'WiFi',
    description: 'WiFi connectivity management',
    category: 'widget',
  },
];

export const ImSwitchConfigWizard: React.FC<ImSwitchConfigWizardProps> = ({
  open,
  onClose,
}) => {
  const { modules, placedModules } = useAppStore();
  const [activeStep, setActiveStep] = useState(0);
  const [detectedHardware, setDetectedHardware] = useState<{
    cameras: string[];
    lasers: string[];
    stages: string[];
  }>({
    cameras: [],
    lasers: [],
    stages: [],
  });
  const [imSwitchConfig, setImSwitchConfig] = useState<Partial<ImSwitchConfiguration>>({});
  const [selectedControllers, setSelectedControllers] = useState<string[]>([
    'settings', 'view', 'recording', 'image' // Default controllers
  ]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Parse ImSwitch data from module CSV
  const parseImSwitchData = (imSwitchString: string): Partial<ImSwitchConfiguration> => {
    try {
      if (!imSwitchString || imSwitchString.trim() === '') {
        return {};
      }

      let cleanedString = imSwitchString.trim();
      console.log('Original ImSwitch string:', cleanedString);
      
      // Handle the specific format from CSV: """key"":{""prop"":""value""}
      // First remove the outer triple quotes if they exist
      if (cleanedString.startsWith('"""') && cleanedString.endsWith('"""')) {
        cleanedString = cleanedString.slice(3, -3);
      }
      
      // Replace all instances of double quotes with single quotes
      // This handles the CSV escaping where " becomes ""
      cleanedString = cleanedString.replace(/""/g, '"');
      
      // Ensure it's wrapped in curly braces for valid JSON
      if (!cleanedString.startsWith('{')) {
        cleanedString = `{${cleanedString}}`;
      }
      
      console.log('Cleaned ImSwitch string:', cleanedString);
      
      // Parse as JSON
      const parsed = JSON.parse(cleanedString);
      console.log('Successfully parsed ImSwitch config:', parsed);
      return parsed;
    } catch (error) {
      console.warn('Failed to parse ImSwitch data:', imSwitchString);
      console.warn('Parse error:', error);
      return {};
    }
  };

  // Analyze placed modules and extract ImSwitch configurations
  useEffect(() => {
    if (!open) return;

    const cameras: string[] = [];
    const lasers: string[] = [];
    const stages: string[] = [];
    const mergedConfig: Partial<ImSwitchConfiguration> = {
      detectors: {},
      lasers: {},
      positioners: {},
      rs232devices: {},
      LEDs: {},
      LEDMatrixs: {},
      availableWidgets: [],
      nonAvailableWidgets: [],
    };

    placedModules.forEach((placedModule: PlacedModule) => {
      const moduleDefinition = modules.find(m => m.id === placedModule.moduleId);
      if (!moduleDefinition) return;

      // Get ImSwitch data from the module definition
      const imSwitchData = moduleDefinition.imSwitchConfig;
      console.log('Checking module:', moduleDefinition.name, 'ImSwitch data:', imSwitchData);
      
      if (!imSwitchData) return;

      const parsedConfig = parseImSwitchData(imSwitchData);
      console.log('Parsed ImSwitch config for', moduleDefinition.name, ':', parsedConfig);
      
      // Merge configurations
      if (parsedConfig.detectors) {
        Object.assign(mergedConfig.detectors!, parsedConfig.detectors);
        cameras.push(...Object.keys(parsedConfig.detectors));
      }
      if (parsedConfig.lasers) {
        Object.assign(mergedConfig.lasers!, parsedConfig.lasers);
        lasers.push(...Object.keys(parsedConfig.lasers));
      }
      if (parsedConfig.positioners) {
        Object.assign(mergedConfig.positioners!, parsedConfig.positioners);
        stages.push(...Object.keys(parsedConfig.positioners));
      }
      if (parsedConfig.rs232devices) {
        Object.assign(mergedConfig.rs232devices!, parsedConfig.rs232devices);
      }
    });

    setDetectedHardware({
      cameras: [...new Set(cameras)],
      lasers: [...new Set(lasers)],
      stages: [...new Set(stages)],
    });
    setImSwitchConfig(mergedConfig);
  }, [open, placedModules, modules]);

  const handleNext = () => {
    if (activeStep === 2) {
      // Generate final configuration
      generateFinalConfiguration();
    }
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleControllerToggle = (controllerId: string) => {
    setSelectedControllers(prev => {
      if (prev.includes(controllerId)) {
        return prev.filter(id => id !== controllerId);
      } else {
        return [...prev, controllerId];
      }
    });
  };

  const generateFinalConfiguration = () => {
    setIsGenerating(true);
    
    // Create the final ImSwitch configuration
    const finalConfig: ImSwitchConfiguration = {
      ...imSwitchConfig,
      availableWidgets: selectedControllers.map(id => {
        const controller = DEFAULT_CONTROLLERS.find(c => c.id === id);
        return controller?.name || id;
      }),
      nonAvailableWidgets: DEFAULT_CONTROLLERS
        .filter(c => !selectedControllers.includes(c.id))
        .map(c => c.name),
      // Add default values for required fields
      slm: null,
      sim: null,
      dpc: null,
      objective: {
        pixelsizes: [0.44, 0.74],
        NAs: [0.3, 0.16],
        magnifications: [10, 4],
        objectiveNames: ["10x", "4x"],
        objectivePositions: [0, 1],
        homeDirection: 1,
        homePolarity: 0,
        homeSpeed: 20000,
        homeAcceleration: 200000,
        calibrateOnStart: false,
        active: true
      },
      mct: { tWait: null },
      nidaq: {
        timerCounterChannel: null,
        startTrigger: false
      },
      roiscan: null,
      lightsheet: null,
      webrtc: null,
      hypha: null,
      mockxx: null,
      jetsonnano: null,
      Stresstest: null,
      HistoScan: { PreviewCamera: null },
      Workflow: null,
      FlowStop: null,
      Lepmon: null,
      Flatfield: null,
      PixelCalibration: {},
      experiment: null,
      uc2Config: null,
      ism: null,
      arkitekt: null,
      fovLock: null,
      autofocus: detectedHardware.cameras.length > 0 && detectedHardware.stages.length > 0 ? {
        camera: detectedHardware.cameras[0],
        positioner: detectedHardware.stages[0],
        updateFreq: 10,
        frameCropx: 780,
        frameCropy: 400,
        frameCropw: 500,
        frameCroph: 100
      } : undefined,
      scan: null,
      etSTED: null,
      rotators: null,
      microscopeStand: null,
      pulseStreamer: { ipAddress: null },
      pyroServerInfo: {
        name: "ImSwitchServer",
        host: "0.0.0.0",
        port: 54333,
        active: false
      },
      rois: {},
      ledPresets: {},
      defaultLEDPresetForScan: null,
      laserPresets: {},
      stageOffsets: {},
      defaultLaserPresetForScan: null,
    } as ImSwitchConfiguration;

    // Add focus lock if we have cameras and stages
    if (detectedHardware.cameras.length > 0 && detectedHardware.stages.length > 0) {
      finalConfig.focusLock = {
        camera: detectedHardware.cameras[0],
        positioner: detectedHardware.stages[0],
        updateFreq: 10,
        cropCenter: [1360, 1160],
        cropSize: 740,
        piKp: 1.0,
        piKi: 0.0,
        focusLockMetric: "astigmatism",
        laserName: detectedHardware.lasers[0] || "488",
        laserValue: 0,
        fovWidth: 2048,
        fovCenter: [null, null]
      };
    }

    setImSwitchConfig(finalConfig);
    setIsGenerating(false);
  };

  const handleDownload = () => {
    const configJson = JSON.stringify(imSwitchConfig, null, 2);
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imswitch_config.json';
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Detected Hardware Components
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              The wizard has analyzed your layout and detected the following ImSwitch-compatible components:
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Card>
                <CardHeader 
                  avatar={<CameraIcon color="primary" />}
                  title="Cameras"
                  subheader={`${detectedHardware.cameras.length} detected`}
                />
                <CardContent>
                  {detectedHardware.cameras.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {detectedHardware.cameras.map(camera => (
                        <Chip key={camera} label={camera} variant="outlined" />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      No cameras detected
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader 
                  avatar={<LightbulbIcon color="primary" />}
                  title="Lasers & LEDs"
                  subheader={`${detectedHardware.lasers.length} detected`}
                />
                <CardContent>
                  {detectedHardware.lasers.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {detectedHardware.lasers.map(laser => (
                        <Chip key={laser} label={`${laser}nm`} variant="outlined" />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      No lasers detected
                    </Typography>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader 
                  avatar={<OpenWithIcon color="primary" />}
                  title="Stages & Positioners"
                  subheader={`${detectedHardware.stages.length} detected`}
                />
                <CardContent>
                  {detectedHardware.stages.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {detectedHardware.stages.map(stage => (
                        <Chip key={stage} label={stage} variant="outlined" />
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="textSecondary">
                      No stages detected
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>

            {(detectedHardware.cameras.length === 0 && 
              detectedHardware.lasers.length === 0 && 
              detectedHardware.stages.length === 0) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                No ImSwitch-compatible hardware detected in your layout. 
                You can still configure software controllers in the next step.
              </Alert>
            )}
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select Available Controllers
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Choose which ImSwitch controllers should be available in your configuration.
              Controllers with hardware dependencies will be automatically enabled/disabled based on detected hardware.
            </Typography>

            <FormGroup>
              {DEFAULT_CONTROLLERS.map((controller) => {
                const hasRequiredHardware = !controller.dependencies || controller.dependencies.every(dep => {
                  switch (dep) {
                    case 'camera':
                      return detectedHardware.cameras.length > 0;
                    case 'laser':
                      return detectedHardware.lasers.length > 0;
                    case 'stage':
                      return detectedHardware.stages.length > 0;
                    default:
                      return true;
                  }
                });

                return (
                  <FormControlLabel
                    key={controller.id}
                    control={
                      <Checkbox
                        checked={selectedControllers.includes(controller.id)}
                        onChange={() => handleControllerToggle(controller.id)}
                        disabled={!hasRequiredHardware}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1">
                          {controller.name}
                          {!hasRequiredHardware && (
                            <Chip 
                              label="Hardware Missing" 
                              size="small" 
                              color="warning" 
                              sx={{ ml: 1 }} 
                            />
                          )}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {controller.description}
                        </Typography>
                        {controller.dependencies && (
                          <Typography variant="caption" color="textSecondary">
                            Requires: {controller.dependencies.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Configuration Preview
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Review the generated ImSwitch configuration before exporting.
            </Typography>

            {isGenerating ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Box>
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">Hardware Configuration</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ pl: 2 }}>
                      {Object.entries(imSwitchConfig.detectors || {}).length > 0 && (
                        <Typography variant="body2">
                          <strong>Detectors:</strong> {Object.keys(imSwitchConfig.detectors || {}).join(', ')}
                        </Typography>
                      )}
                      {Object.entries(imSwitchConfig.lasers || {}).length > 0 && (
                        <Typography variant="body2">
                          <strong>Lasers:</strong> {Object.keys(imSwitchConfig.lasers || {}).join(', ')}
                        </Typography>
                      )}
                      {Object.entries(imSwitchConfig.positioners || {}).length > 0 && (
                        <Typography variant="body2">
                          <strong>Positioners:</strong> {Object.keys(imSwitchConfig.positioners || {}).join(', ')}
                        </Typography>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>

                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">Available Widgets ({selectedControllers.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {selectedControllers.map(controllerId => {
                        const controller = DEFAULT_CONTROLLERS.find(c => c.id === controllerId);
                        return (
                          <Chip 
                            key={controllerId} 
                            label={controller?.name || controllerId} 
                            variant="outlined" 
                            size="small"
                          />
                        );
                      })}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}
          </Box>
        );

      case 3:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <DownloadIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Configuration Ready
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Your ImSwitch configuration has been generated and is ready for download.
              The configuration file includes all detected hardware and selected controllers.
            </Typography>
            <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
              The downloaded file can be used directly with ImSwitch software.
              Place it in your ImSwitch configuration directory and select it when starting ImSwitch.
            </Alert>
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
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '70vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MemoryIcon />
          ImSwitch Configuration Export
        </Box>
      </DialogTitle>
      
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
        <Button onClick={onClose}>Cancel</Button>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
        >
          Back
        </Button>
        {activeStep === steps.length - 1 ? (
          <Button
            variant="contained"
            onClick={handleDownload}
            startIcon={<DownloadIcon />}
          >
            Download Configuration
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleNext}
          >
            Next
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
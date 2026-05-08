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
import { ImSwitchJsonEditor } from './ImSwitchJsonEditor';
import type { 
  ImSwitchConfiguration, 
  AvailableController,
  PlacedModule 
} from '../types';

// Base path for standalone JSON config fragments shipped under public/imswitch_configs
const IMSWITCH_CONFIGS_BASE = '/configurator/imswitch_configs';

// --- These are built dynamically from widget_database.json ---
// Fallback empty values; will be populated from the database once loaded.
let WIDGET_CONFIG_MAP: Record<string, string> = {};
let WIDGET_TOPLEVEL_KEYS: Record<string, string[]> = {};
/** Fetch a JSON config fragment from public/imswitch_configs/. */
async function loadConfigFromFile(configFile: string): Promise<Partial<ImSwitchConfiguration>> {
  try {
    const response = await fetch(`${IMSWITCH_CONFIGS_BASE}/${configFile}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Partial<ImSwitchConfiguration>;
  } catch (error) {
    console.warn(`Failed to load config file: ${configFile}`, error);
    return {};
  }
}

/**
 * Deep-merge a per-module config fragment into the running merged config.
 *
 * For collection-style sections (detectors / lasers / LEDs / positioners /
 * rs232devices / LEDMatrixs) we deduplicate device names: when two modules
 * contribute the same key (e.g. two cameras both named "WidefieldCamera"),
 * the second instance is suffixed with an integer ("WidefieldCamera1",
 * "WidefieldCamera2", ...). The resulting names are returned via the
 * `nameMap` so the caller can update detected hardware lists.
 */
const COLLECTION_KEYS = [
  'detectors',
  'lasers',
  'LEDs',
  'LEDMatrixs',
  'positioners',
  'rs232devices',
] as const;

function mergeFragmentWithDedupe(
  target: Partial<ImSwitchConfiguration>,
  fragment: Partial<ImSwitchConfiguration>,
): { added: Partial<Record<(typeof COLLECTION_KEYS)[number], string[]>> } {
  const added: Partial<Record<(typeof COLLECTION_KEYS)[number], string[]>> = {};

  for (const key of COLLECTION_KEYS) {
    const src = (fragment as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
    if (!src || typeof src !== 'object') continue;
    const dst = ((target as Record<string, unknown>)[key] ||= {}) as Record<string, unknown>;
    const addedNames: string[] = [];
    for (const [origName, value] of Object.entries(src)) {
      let finalName = origName;
      if (Object.prototype.hasOwnProperty.call(dst, finalName)) {
        // Collision: append numeric suffix. If origName already ends with a digit
        // we still append; we want stable predictable names like Camera1, Camera2.
        let i = 1;
        // First duplicate: rename existing entry to "<name>1" and new to "<name>2"
        // for a more consistent enumeration.
        const existing = dst[finalName];
        delete dst[finalName];
        dst[`${finalName}${i}`] = existing;
        // Update added list if the original was previously added
        const prev = added[key];
        if (prev) {
          const idx = prev.indexOf(finalName);
          if (idx >= 0) prev[idx] = `${finalName}${i}`;
        }
        i = 2;
        while (Object.prototype.hasOwnProperty.call(dst, `${finalName}${i}`)) i++;
        finalName = `${finalName}${i}`;
      }
      dst[finalName] = value;
      addedNames.push(finalName);
    }
    added[key] = addedNames;
  }

  // Non-collection keys: shallow overwrite (later modules win).
  for (const [k, v] of Object.entries(fragment)) {
    if ((COLLECTION_KEYS as readonly string[]).includes(k)) continue;
    (target as Record<string, unknown>)[k] = v;
  }

  return { added };
}

interface ImSwitchConfigWizardProps {
  open: boolean;
  onClose: () => void;
}

const steps = ['Module Analysis', 'Controller Selection', 'Configuration Preview', 'Export'];

// Default available controllers
export const ImSwitchConfigWizard: React.FC<ImSwitchConfigWizardProps> = ({
  open,
  onClose,
}) => {
  const { modules, placedModules } = useAppStore();
  const [activeStep, setActiveStep] = useState(0);
  const [controllerDatabase, setControllerDatabase] = useState<AvailableController[]>([]);
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
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);

  // Load widget database from JSON on first open
  useEffect(() => {
    if (!open || controllerDatabase.length > 0) return;
    fetch(`${IMSWITCH_CONFIGS_BASE}/widget_database.json`)
      .then(r => r.json())
      .then((data: { controllers: AvailableController[] }) => {
        setControllerDatabase(data.controllers);
        // Rebuild lookup maps from database
        const cfgMap: Record<string, string> = {};
        const keysMap: Record<string, string[]> = {};
        for (const c of data.controllers) {
          if (c.configFile) cfgMap[c.id] = c.configFile;
          if (c.topLevelKeys?.length) keysMap[c.id] = c.topLevelKeys;
        }
        WIDGET_CONFIG_MAP = cfgMap;
        WIDGET_TOPLEVEL_KEYS = keysMap;
      })
      .catch(err => console.warn('Failed to load widget_database.json', err));
  }, [open, controllerDatabase.length]);

  // Parse ImSwitch data from module CSV
  const parseImSwitchData = (imSwitchString: string): Partial<ImSwitchConfiguration> => {
    try {
      if (!imSwitchString || imSwitchString.trim() === '') {
        return {};
      }

      let cleanedString = imSwitchString.trim();
      console.log('Original ImSwitch string:', cleanedString);
      
      // Remove outer single quotes if they exist
      if (cleanedString.startsWith("'") && cleanedString.endsWith("'")) {
        cleanedString = cleanedString.slice(1, -1);
      }
      
      // Handle the specific format from CSV: """key"":{""prop"":""value""}
      // First remove the outer triple quotes if they exist
      if (cleanedString.startsWith('"""') && cleanedString.endsWith('"""')) {
        cleanedString = cleanedString.slice(3, -3);
      }
      
      // Replace all instances of double-double quotes with single quotes
      // This handles the CSV escaping where " becomes ""
      cleanedString = cleanedString.replace(/""/g, '"');
      
      console.log('After quote processing:', cleanedString);
      
      // Handle incomplete JSON - add missing closing braces
      let openBraces = 0;
      for (let char of cleanedString) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
      }
      
      // Add missing closing braces
      for (let i = 0; i < openBraces; i++) {
        cleanedString += '}';
      }
      
      // Ensure it's wrapped in curly braces for valid JSON
      if (!cleanedString.startsWith('{')) {
        cleanedString = `{${cleanedString}}`;
      }
      
      console.log('Final cleaned string:', cleanedString);
      
      // Parse as JSON
      const parsed = JSON.parse(cleanedString);
      console.log('Successfully parsed ImSwitch config:', parsed);
      return parsed;
    } catch (error) {
      console.warn('Failed to parse ImSwitch data:', imSwitchString);
      console.warn('Parse error:', error);
      console.warn('String that failed to parse:', imSwitchString);
      
      // Try alternative parsing approach
      try {
        console.log('Attempting alternative parsing...');
        let altString = imSwitchString.trim();
        
        // Remove outer quotes (single or double)
        if ((altString.startsWith("'") && altString.endsWith("'")) ||
            (altString.startsWith('"') && altString.endsWith('"'))) {
          altString = altString.slice(1, -1);
        }
        
        // Replace triple quotes with single quotes first
        altString = altString.replace(/"""/g, '"');
        
        // Replace double quotes with single quotes
        altString = altString.replace(/""/g, '"');
        
        // Handle incomplete JSON - count braces and add missing ones
        let openBraces = 0;
        for (let char of altString) {
          if (char === '{') openBraces++;
          if (char === '}') openBraces--;
        }
        
        // Add missing closing braces
        for (let i = 0; i < openBraces; i++) {
          altString += '}';
        }
        
        // Wrap in braces if needed
        if (!altString.startsWith('{')) {
          altString = `{${altString}}`;
        }
        
        console.log('Alternative cleaned string:', altString);
        const altParsed = JSON.parse(altString);
        console.log('Alternative parsing successful:', altParsed);
        return altParsed;
      } catch (altError) {
        console.warn('Alternative parsing also failed:', altError);
        
        // Last resort: try to extract key-value pairs manually
        try {
          console.log('Attempting manual extraction...');
          const result: any = {};
          
          // Look for patterns like "key":{...}
          const patterns = [
            /"""?([^"]+)"""?:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
            /"([^"]+)":\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g
          ];
          
          let match;
          for (const pattern of patterns) {
            while ((match = pattern.exec(imSwitchString)) !== null) {
              const key = match[1];
              let value = match[2];
              
              // Count braces in the value to ensure proper closing
              let openBraces = 1; // We already have the opening brace
              for (let char of value) {
                if (char === '{') openBraces++;
                if (char === '}') openBraces--;
              }
              
              // Add missing closing braces
              for (let i = 0; i < openBraces; i++) {
                value += '}';
              }
              
              try {
                const parsedValue = JSON.parse(`{${value}}`);
                result[key] = parsedValue;
                console.log(`Manually extracted ${key}:`, parsedValue);
              } catch (e) {
                console.warn(`Failed to parse manually extracted value for ${key}:`, value);
              }
            }
          }
          
          if (Object.keys(result).length > 0) {
            console.log('Manual extraction successful:', result);
            return result;
          }
        } catch (manualError) {
          console.warn('Manual extraction also failed:', manualError);
        }
        
        return {};
      }
    }
  };

  // Analyze placed modules and extract ImSwitch configurations.
  // Loads each module's standalone JSON config (preferred) or falls back to the
  // legacy inline `imSwitchConfig` CSV string. Per-module fragments are merged
  // in placement order with duplicate device names disambiguated by an integer
  // suffix (e.g. WidefieldCamera -> WidefieldCamera1, WidefieldCamera2).
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoadingConfigs(true);

    (async () => {
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

      // Load each placed module's config fragment in parallel, preserving order.
      const fragments = await Promise.all(
        placedModules.map(async (placedModule: PlacedModule) => {
          const moduleDefinition = modules.find(m => m.id === placedModule.moduleId);
          if (!moduleDefinition) return null;

          // Prefer the new file-based reference
          if (moduleDefinition.imSwitchConfigFile) {
            const frag = await loadConfigFromFile(moduleDefinition.imSwitchConfigFile);
            return { moduleDefinition, fragment: frag };
          }
          // Fall back to legacy inline string parsing
          if (moduleDefinition.imSwitchConfig) {
            const frag = parseImSwitchData(moduleDefinition.imSwitchConfig);
            return { moduleDefinition, fragment: frag };
          }
          return null;
        }),
      );

      const cameras: string[] = [];
      const lasers: string[] = [];
      const stages: string[] = [];

      for (const entry of fragments) {
        if (!entry) continue;
        const { added } = mergeFragmentWithDedupe(mergedConfig, entry.fragment);
        if (added.detectors) cameras.push(...added.detectors);
        if (added.lasers) lasers.push(...added.lasers);
        if (added.LEDs) lasers.push(...added.LEDs);
        if (added.positioners) stages.push(...added.positioners);
      }

      if (cancelled) return;

      setDetectedHardware({
        cameras: [...new Set(cameras)],
        lasers: [...new Set(lasers)],
        stages: [...new Set(stages)],
      });
      setImSwitchConfig(mergedConfig);
      setIsLoadingConfigs(false);
    })().catch(err => {
      console.error('Failed to analyze placed modules:', err);
      if (!cancelled) setIsLoadingConfigs(false);
    });

    return () => {
      cancelled = true;
    };
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
      const isOn = prev.includes(controllerId);
      const next = isOn ? prev.filter(id => id !== controllerId) : [...prev, controllerId];

      // Side effect: load or remove the corresponding JSON config fragment.
      if (!isOn && WIDGET_CONFIG_MAP[controllerId]) {
        // Toggling ON -> fetch widget defaults and merge into config
        loadConfigFromFile(WIDGET_CONFIG_MAP[controllerId]).then(fragment => {
          setImSwitchConfig(current => {
            const merged: Partial<ImSwitchConfiguration> = { ...current };
            // Auto-bind device references using detected hardware where applicable
            const bindFragment = JSON.parse(JSON.stringify(fragment)) as Record<string, unknown>;
            if (bindFragment.autofocus && typeof bindFragment.autofocus === 'object') {
              const af = bindFragment.autofocus as Record<string, unknown>;
              if (detectedHardware.cameras[0]) af.camera = detectedHardware.cameras[0];
              if (detectedHardware.stages[0]) af.positioner = detectedHardware.stages[0];
            }
            if (bindFragment.focusLock && typeof bindFragment.focusLock === 'object') {
              const fl = bindFragment.focusLock as Record<string, unknown>;
              if (detectedHardware.cameras[0]) fl.camera = detectedHardware.cameras[0];
              if (detectedHardware.stages[0]) fl.positioner = detectedHardware.stages[0];
              if (detectedHardware.lasers[0]) fl.laserName = detectedHardware.lasers[0];
            }
            for (const [k, v] of Object.entries(bindFragment)) {
              (merged as Record<string, unknown>)[k] = v;
            }
            return merged;
          });
        });
      } else if (isOn && WIDGET_TOPLEVEL_KEYS[controllerId]) {
        // Toggling OFF -> strip the widget's top-level keys from the config
        setImSwitchConfig(current => {
          const stripped: Partial<ImSwitchConfiguration> = { ...current };
          for (const k of WIDGET_TOPLEVEL_KEYS[controllerId]) {
            delete (stripped as Record<string, unknown>)[k];
          }
          return stripped;
        });
      }

      return next;
    });
  };

  /** Apply an edited JSON section back into the running config. */
  const handleSectionEdit = (key: string, value: unknown) => {
    setImSwitchConfig(current => ({ ...current, [key]: value } as Partial<ImSwitchConfiguration>));
  };

  const generateFinalConfiguration = () => {
    setIsGenerating(true);
    
    // Create the final ImSwitch configuration
    const finalConfig: ImSwitchConfiguration = {
      ...imSwitchConfig,
      availableWidgets: selectedControllers.map(id => {
        const controller = controllerDatabase.find(c => c.id === id);
        return controller?.name || id;
      }),
      nonAvailableWidgets: controllerDatabase
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
    // Build uc2_components in the same format as the standalone OptiKit JSON export
    // so the file can be re-imported by the OptiKit layout tools.
    const uc2Components = placedModules.flatMap((pm: PlacedModule, index: number) => {
      const def = modules.find(m => m.id === pm.moduleId);
      if (!def) return [];
      const baseName = def.name.replace(/\s+/g, '_');
      const runningNumber = index.toString().padStart(2, '0');
      return [{
        name: `${baseName}_${runningNumber}`,
        file: def.autodeskInventor ||
              `C:\\UC2_Components\\${def.name.replace(/\s+/g, '_')}.iam`,
        grid_pos: [pm.position.x, pm.position.y, pm.layer] as [number, number, number],
        rotation: [0, pm.rotation, 0] as [number, number, number],
        moduleId: pm.moduleId,
        originalName: def.name,
        description: def.description,
        params: pm.params || {},
        ...(pm.customText ? { customText: pm.customText } : {}),
      }];
    });

    const exported: ImSwitchConfiguration = {
      ...(imSwitchConfig as ImSwitchConfiguration),
      _optikitConfig: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        uc2_components: uc2Components,
        annotations: [],
        metadata: {
          version: '1.0',
          created: new Date().toISOString(),
          software: 'OpenUC2 OptiKit',
        },
      },
    };
    const configJson = JSON.stringify(exported, null, 2);
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

            {isLoadingConfigs && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="textSecondary">
                  Loading module configurations...
                </Typography>
              </Box>
            )}
            
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
              {controllerDatabase.map((controller) => {
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
                  <Box key={controller.id}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedControllers.includes(controller.id)}
                        onChange={() => handleControllerToggle(controller.id)}
                        disabled={!hasRequiredHardware}
                      />
                    }
                    label={
                      <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column' }}>
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body1" component="span">
                            {controller.name}
                          </Typography>
                          {!hasRequiredHardware && (
                            <Chip
                              label="Hardware Missing"
                              size="small"
                              color="warning"
                            />
                          )}
                        </Box>
                        <Typography variant="body2" component="span" color="textSecondary">
                          {controller.description}
                        </Typography>
                        {controller.dependencies && (
                          <Typography variant="caption" component="span" color="textSecondary">
                            Requires: {controller.dependencies.join(', ')}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  </Box>
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
                {COLLECTION_KEYS.filter(key => {
                  const col = (imSwitchConfig as Record<string, unknown>)[key];
                  return col && typeof col === 'object' && Object.keys(col).length > 0;
                }).map(collectionKey => {
                  const collection = (imSwitchConfig as Record<string, unknown>)[collectionKey] as Record<string, unknown>;
                  const label = collectionKey.charAt(0).toUpperCase() + collectionKey.slice(1);
                  return (
                    <Accordion key={collectionKey} defaultExpanded>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="subtitle1">{label} ({Object.keys(collection).length})</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {Object.entries(collection).map(([deviceName, deviceConfig]) => (
                          <Accordion key={deviceName} disableGutters sx={{ boxShadow: 1, mb: 0.5 }}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{deviceName}</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <ImSwitchJsonEditor
                                title=""
                                configKey={deviceName}
                                value={deviceConfig}
                                onChange={(_deviceKey, updated) => {
                                  handleSectionEdit(collectionKey, { ...collection, [deviceName]: updated });
                                }}
                                schemaOnly
                              />
                            </AccordionDetails>
                          </Accordion>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  );
                })}

                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle1">Available Widgets ({selectedControllers.length})</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                      {selectedControllers.map(controllerId => {
                        const controller = controllerDatabase.find(c => c.id === controllerId);
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
                    {/* Widget-specific config editors — only shown for widgets that have a config fragment */}
                    {selectedControllers.some(id => WIDGET_TOPLEVEL_KEYS[id]) && (
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Widget Configuration</Typography>
                        {selectedControllers.map(controllerId => {
                          const keys = WIDGET_TOPLEVEL_KEYS[controllerId];
                          if (!keys) return null;
                          const controller = controllerDatabase.find(c => c.id === controllerId);
                          return (
                            <Accordion key={controllerId} disableGutters sx={{ boxShadow: 1, mb: 0.5 }}>
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{controller?.name ?? controllerId}</Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                {keys.map(sectionKey => (
                                  (imSwitchConfig as Record<string, unknown>)[sectionKey] !== undefined && (
                                    <Box key={sectionKey} sx={{ mb: 1 }}>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{sectionKey}</Typography>
                                      <ImSwitchJsonEditor
                                        title=""
                                        configKey={sectionKey}
                                        value={(imSwitchConfig as Record<string, unknown>)[sectionKey]}
                                        onChange={handleSectionEdit}
                                        schemaOnly
                                      />
                                    </Box>
                                  )
                                ))}
                              </AccordionDetails>
                            </Accordion>
                          );
                        })}
                      </Box>
                    )}
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
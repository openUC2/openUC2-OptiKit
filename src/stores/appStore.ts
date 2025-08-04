import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Octokit } from '@octokit/rest';
import { loadModulesFromCSV } from '../utils/moduleLoader';
import type { 
  AppState, 
  ModuleDefinition, 
  PlacedModule, 
  Annotation, 
  Layer, 
  Point, 
  UC2Component,
  StateSnapshot,
  CompactExport,
  CompactModule,
  CompactAnnotation,
  SetupMetadata,
  FeedbackData
} from '../types';

const GRID_CELL_SIZE = 50; // 50mm in pixels (assuming 1:1 scale)

// Sample module definitions (fallback)
const sampleModules: ModuleDefinition[] = [
  {
    id: 'cube-1x1',
    name: 'Basic Cube',
    group: 'cubes',
    color: '#3498db',
    footprint: { width: 1, height: 1 },
    thumbnail: '/icons/cube-1x1.svg',
    defaultParams: { height: 50 }
  },
  {
    id: 'lens-1x1',
    name: 'Lens',
    group: 'lenses',
    color: '#f39c12',
    footprint: { width: 1, height: 1 },
    thumbnail: '/icons/lens-1x1.svg',
    defaultParams: { focalLength: 100 }
  }
];

interface AppStore extends AppState {
  // Actions
  loadModules: () => Promise<void>;
  addLayer: (name: string) => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string) => void;
  placeModule: (moduleId: string, position: Point, layer: number) => void;
  moveModule: (moduleId: string, position: Point) => void;
  rotateModule: (moduleId: string, rotation: number) => void;
  removeModule: (moduleId: string) => void;
  updateModuleCustomText: (moduleId: string, customText: string) => void;
  updateModuleParams: (moduleId: string, params: Record<string, unknown>) => void;
  addAnnotation: (annotation: Omit<Annotation, 'id'>) => void;
  moveAnnotation: (annotationId: string, position: Point) => void;
  removeAnnotation: (annotationId: string) => void;
  selectItem: (itemId: string | null, itemType: 'module' | 'annotation' | null) => void;
  setGridConfig: (config: Partial<AppState['grid']>) => void;
  setViewport: (config: Partial<AppState['viewport']>) => void;
  setAnnotationMode: (mode: AppState['annotationMode']) => void;
  checkCollision: (position: Point, footprint: { width: number; height: number }, layer: number, excludeId?: string) => boolean;
  exportData: () => Promise<string>;
  exportDataWithScreenshot: (screenshotDataUrl?: string) => Promise<string>;
  saveToGitHub: () => Promise<void>;
  generateShareableLink: () => string;
  downloadSTLBundle: (password: string) => Promise<void>;
  importData: (data: string) => void;
  importFromUrl: (url: string) => Promise<boolean>;
  undo: () => void;
  redo: () => void;
  pushToHistory: (snapshot: StateSnapshot) => void;
  centerView: () => void;
  saveStateToStorage: () => void;
  loadStateFromStorage: () => void;
  downloadScreenshot: () => void;
  clearAll: () => void;
  setActiveRightTab: (tab: 'layers' | 'properties' | 'bom') => void;
  updateSetupMetadata: (metadata: Partial<SetupMetadata>) => void;
  // Tutorial actions
  setTutorialCompleted: (completed: boolean) => void;
  // Feedback actions
  submitFeedback: (feedback: FeedbackData) => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  modules: sampleModules,
  placedModules: [],
  annotations: [],
  layers: [
    { id: 'layer-0', name: 'Layer 0', index: 0, visible: true }
  ],
  activeLayerId: 'layer-0',
  selectedItemId: null,
  selectedItemType: null,
  grid: {
    cellSize: GRID_CELL_SIZE,
    gridVisible: true,
    snapEnabled: true
  },
  viewport: {
    zoom: 1,
    pan: { x: 0, y: 0 }
  },
  history: [],
  historyIndex: -1,
  annotationMode: 'none',
  activeRightTab: 'properties',
  setupMetadata: {
    name: 'Untitled Setup',
    author: '',
    githubAccount: '',
    description: '',
    category: 'General',
    screenshot: ''
  },
  tutorialCompleted: false,

  // Actions
  loadModules: async () => {
    try {
      const modules = await loadModulesFromCSV();
      set({ modules });
    } catch (error) {
      console.error('Failed to load modules:', error);
      set({ modules: sampleModules });
    }
  },

  addLayer: (name: string) => {
    const newLayer: Layer = {
      id: uuidv4(),
      name,
      index: get().layers.length,
      visible: true
    };
    set(state => ({
      layers: [...state.layers, newLayer]
    }));
  },

  removeLayer: (layerId: string) => {
    const state = get();
    if (state.layers.length <= 1) return; // Don't remove the last layer
    
    set(state => ({
      layers: state.layers.filter(layer => layer.id !== layerId),
      placedModules: state.placedModules.filter(module => 
        state.layers.find(layer => layer.id === layerId)?.index !== module.layer
      ),
      annotations: state.annotations.filter(annotation => 
        state.layers.find(layer => layer.id === layerId)?.index !== annotation.layer
      ),
      activeLayerId: state.activeLayerId === layerId ? state.layers[0].id : state.activeLayerId
    }));
  },

  setActiveLayer: (layerId: string) => {
    set({ activeLayerId: layerId });
  },

  placeModule: (moduleId: string, position: Point, layer: number) => {
    const state = get();
    const moduleDefinition = state.modules.find(m => m.id === moduleId);
    if (!moduleDefinition) return;

    // Allow modules to be placed at the same location - no collision checking

    // Save current state to history
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });

    const newModule: PlacedModule = {
      id: uuidv4(),
      moduleId,
      position,
      rotation: 0,
      layer,
      params: { ...moduleDefinition.defaultParams },
      customText: moduleDefinition.isWildCard ? moduleDefinition.defaultParams?.customText as string : undefined
    };

    set(state => ({
      placedModules: [...state.placedModules, newModule],
      selectedItemId: newModule.id,
      selectedItemType: 'module',
      activeRightTab: 'properties'
    }));
  },

  moveModule: (moduleId: string, position: Point) => {
    const state = get();
    const module = state.placedModules.find(m => m.id === moduleId);
    if (!module) return;

    const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
    if (!moduleDefinition) return;

    // Allow modules to be moved to the same location as other modules - no collision checking

    // Save current state to history
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });

    set(state => ({
      placedModules: state.placedModules.map(m => 
        m.id === moduleId ? { ...m, position } : m
      )
    }));
  },

  rotateModule: (moduleId: string, rotation: number) => {
    set(state => ({
      placedModules: state.placedModules.map(m => {
        if (m.id === moduleId) {
          const moduleDefinition = state.modules.find(mod => mod.id === m.moduleId);
          if (!moduleDefinition) return m;
          
          // Allow rotation even if it would overlap with other modules
          return { ...m, rotation };
        }
        return m;
      })
    }));
  },

  removeModule: (moduleId: string) => {
    const state = get();
    
    // Save current state to history
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });

    set(state => ({
      placedModules: state.placedModules.filter(m => m.id !== moduleId),
      selectedItemId: state.selectedItemId === moduleId ? null : state.selectedItemId
    }));
  },

  updateModuleCustomText: (moduleId: string, customText: string) => {
    set(state => ({
      placedModules: state.placedModules.map(m => 
        m.id === moduleId ? { ...m, customText } : m
      )
    }));
  },

  updateModuleParams: (moduleId: string, params: Record<string, unknown>) => {
    set(state => ({
      placedModules: state.placedModules.map(m => 
        m.id === moduleId ? { ...m, params: { ...m.params, ...params } } : m
      )
    }));
  },

  addAnnotation: (annotation: Omit<Annotation, 'id'>) => {
    const state = get();
    
    // Save current state to history
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });

    const newAnnotation: Annotation = {
      ...annotation,
      id: uuidv4()
    };
    set(state => ({
      annotations: [...state.annotations, newAnnotation]
    }));
  },

  moveAnnotation: (annotationId: string, position: Point) => {
    set(state => ({
      annotations: state.annotations.map(annotation =>
        annotation.id === annotationId && annotation.points
          ? { ...annotation, points: [position, ...annotation.points.slice(1)] }
          : annotation
      )
    }));
    
    // Save state after moving
    get().saveStateToStorage();
  },

  removeAnnotation: (annotationId: string) => {
    const state = get();
    
    // Save current state to history
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });

    set(state => ({
      annotations: state.annotations.filter(a => a.id !== annotationId),
      selectedItemId: state.selectedItemId === annotationId ? null : state.selectedItemId
    }));
  },

  selectItem: (itemId: string | null, itemType: 'module' | 'annotation' | null) => {
    set({ selectedItemId: itemId, selectedItemType: itemType });
  },

  setGridConfig: (config: Partial<AppState['grid']>) => {
    set(state => ({
      grid: { ...state.grid, ...config }
    }));
  },

  setViewport: (config: Partial<AppState['viewport']>) => {
    set(state => ({
      viewport: { ...state.viewport, ...config }
    }));
  },

  setAnnotationMode: (mode: AppState['annotationMode']) => {
    set({ annotationMode: mode });
  },

  checkCollision: (position: Point, footprint: { width: number; height: number }, layer: number, excludeId?: string) => {
    const state = get();
    
    for (const module of state.placedModules) {
      if (module.id === excludeId || module.layer !== layer) continue;
      
      const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
      if (!moduleDefinition) continue;

      // Calculate actual footprint considering rotation
      const isRotated90or270 = module.rotation === 90 || module.rotation === 270;
      const actualFootprint = isRotated90or270 ? 
        { width: moduleDefinition.footprint.height, height: moduleDefinition.footprint.width } : 
        { width: moduleDefinition.footprint.width, height: moduleDefinition.footprint.height };

      // Check if rectangles overlap
      const rect1 = {
        x: position.x,
        y: position.y,
        width: footprint.width,
        height: footprint.height
      };
      
      const rect2 = {
        x: module.position.x,
        y: module.position.y,
        width: actualFootprint.width,
        height: actualFootprint.height
      };

      if (rect1.x < rect2.x + rect2.width &&
          rect1.x + rect1.width > rect2.x &&
          rect1.y < rect2.y + rect2.height &&
          rect1.y + rect1.height > rect2.y) {
        return true; // Collision detected
      }
    }
    
    return false;
  },

  exportData: async () => {
    // Trigger screenshot capture and wait for it
    const screenshotPromise = new Promise<string>((resolve) => {
      const handler = (event: CustomEvent) => {
        window.removeEventListener('screenshot-captured', handler as EventListener);
        resolve(event.detail);
      };
      window.addEventListener('screenshot-captured', handler as EventListener);
      
      // Set flag to indicate this is for export
      (window as unknown as { isExportCapture?: boolean }).isExportCapture = true;
      
      // Trigger screenshot
      const event = new CustomEvent('download-screenshot');
      window.dispatchEvent(event);
      
      // Fallback timeout
      setTimeout(() => {
        window.removeEventListener('screenshot-captured', handler as EventListener);
        resolve('');
      }, 3000);
    });

    const screenshotDataUrl = await screenshotPromise;
    return get().exportDataWithScreenshot(screenshotDataUrl);
  },

  exportDataWithScreenshot: async (screenshotDataUrl?: string) => {
    const state = get();
    const uc2_components: UC2Component[] = [];
    
    state.placedModules.forEach((module, index) => {
      const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
      if (moduleDefinition) {
        // Generate a unique name with running number
        const baseName = moduleDefinition.name.replace(/\s+/g, '_');
        const runningNumber = index.toString().padStart(2, '0');
        const name = `${baseName}_${runningNumber}`;
        
        // Convert rotation to PyInventor format (Y-axis rotation)
        const rotationY = module.rotation;
        
        uc2_components.push({
          name: name,
          file: moduleDefinition.autodeskInventor || `C:\\UC2_Components\\${moduleDefinition.name.replace(/\s+/g, '_')}.iam`,
          grid_pos: [module.position.x, module.position.y, module.layer],
          rotation: [0, rotationY, 0],
          moduleId: module.moduleId,
          originalName: moduleDefinition.name,
          description: moduleDefinition.description,
          params: module.params || {},
          customText: module.customText
        });
      }
    });
    
    return JSON.stringify({
      uc2_components,
      annotations: state.annotations,
      layers: state.layers,
      ...state.setupMetadata,
      screenshot: screenshotDataUrl || state.setupMetadata.screenshot || null,
      metadata: {
        version: "1.0",
        created: new Date().toISOString(),
        software: "OpenUC2 OptiKit"
      }
    }, null, 2);
  },

  exportToPyInventor: () => {
    // This is now deprecated - use exportData instead
    return get().exportData();
  },

  importData: (data: string) => {
    try {
      const parsed = JSON.parse(data);
      
      // Check if it's the compact GitHub discussions format
      if (parsed.m) {
        const compactData = parsed as CompactExport;
        // Convert from compact format to internal format
        const placedModules: PlacedModule[] = compactData.m.map((module: CompactModule) => ({
          id: uuidv4(),
          moduleId: module.i,
          position: { x: module.p[0], y: module.p[1] },
          rotation: module.r || 0,
          layer: module.p[2] || 0,
          params: {},
          customText: module.t
        }));
        
        // Convert annotations if they exist
        const annotations: Annotation[] = (compactData as CompactExport & { a?: CompactAnnotation[] }).a 
          ? (compactData as CompactExport & { a: CompactAnnotation[] }).a.map((ann: CompactAnnotation) => ({
              id: uuidv4(),
              type: ann.t,
              layer: 0,
              points: ann.p || [],
              text: ann.x
            })) 
          : [];
        
        set({
          placedModules,
          annotations,
          layers: [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }],
          // Import metadata if available
          setupMetadata: (compactData as CompactExport & { meta?: any }).meta || {
            name: 'Imported Setup',
            author: '',
            githubAccount: '',
            description: '',
            category: 'General',
            screenshot: ''
          }
        });
        return;
      }
      
      // Check if it's the new unified format with uc2_components
      if (parsed.uc2_components) {
        // Convert from new format to internal format
        const placedModules: PlacedModule[] = parsed.uc2_components.map((component: UC2Component) => ({
          id: uuidv4(),
          moduleId: component.moduleId || component.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '-'),
          position: { x: component.grid_pos[0], y: component.grid_pos[1] },
          rotation: component.rotation[1] || 0, // Use Y-axis rotation
          layer: component.grid_pos[2] || 0,
          params: component.params || {},
          customText: component.customText
        }));
        
        set({
          placedModules,
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
      } else {
        // Legacy format support
        set({
          placedModules: parsed.placedModules || [],
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
      }
    } catch (error) {
      console.error('Failed to import data:', error);
    }
  },

  importFromUrl: async (url: string) => {
    try {
      let finalUrl = url;
      let data: string;

      // Check if it's a GitHub URL and convert to API or CORS-friendly format
      if (url.includes('github.com') || url.includes('raw.githubusercontent.com')) {
        // Convert GitHub URLs to use raw.githubusercontent.com which has better CORS support
        if (url.includes('github.com') && url.includes('/blob/')) {
          // Convert from blob URL to raw URL
          finalUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        }
        
        // Try direct fetch first (works with raw.githubusercontent.com)
        try {
          const response = await fetch(finalUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
          data = await response.text();
        } catch (directError) {
          console.warn('Direct fetch failed, trying GitHub API:', directError);
          
          // Extract GitHub repo info and try API approach
          const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)/);
          if (githubMatch) {
            const [, owner, repo, branch, path] = githubMatch;
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
            
            const apiResponse = await fetch(apiUrl);
            if (!apiResponse.ok) {
              throw new Error(`GitHub API failed: ${apiResponse.status}`);
            }
            
            const apiData = await apiResponse.json();
            // GitHub API returns base64 encoded content
            data = atob(apiData.content);
          } else {
            throw directError;
          }
        }
      } else {
        // For non-GitHub URLs, try direct fetch
        const response = await fetch(finalUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch JSON from URL: ${response.status}`);
        }
        data = await response.text();
      }

      const parsed = JSON.parse(data);
      
      // Check if it's the compact GitHub discussions format
      if (parsed.m) {
        const compactData = parsed as CompactExport;
        // Convert from compact format to internal format
        const placedModules: PlacedModule[] = compactData.m.map((module: CompactModule) => ({
          id: uuidv4(),
          moduleId: module.i,
          position: { x: module.p[0], y: module.p[1] },
          rotation: module.r || 0,
          layer: module.p[2] || 0,
          params: {},
          customText: module.t
        }));
        
        set({
          placedModules,
          annotations: [],
          layers: [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
        return true;
      }
      
      // Check if it's the new unified format with uc2_components
      if (parsed.uc2_components) {
        // Convert from new format to internal format
        const placedModules: PlacedModule[] = parsed.uc2_components.map((component: UC2Component) => ({
          id: uuidv4(),
          moduleId: component.moduleId || component.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '-'),
          position: { x: component.grid_pos[0], y: component.grid_pos[1] },
          rotation: component.rotation[1] || 0, // Use Y-axis rotation
          layer: component.grid_pos[2] || 0,
          params: component.params || {},
          customText: component.customText
        }));
        
        set({
          placedModules,
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
      } else {
        // Legacy format support
        set({
          placedModules: parsed.placedModules || [],
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to import from URL:', error);
      return false;
    }
  },

  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const previousSnapshot = state.history[state.historyIndex - 1];
      set({
        ...previousSnapshot,
        historyIndex: state.historyIndex - 1,
        history: state.history, // Keep the history
        selectedItemId: null,
        selectedItemType: null
      });
    }
  },

  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const nextSnapshot = state.history[state.historyIndex + 1];
      set({
        ...nextSnapshot,
        historyIndex: state.historyIndex + 1,
        history: state.history, // Keep the history
        selectedItemId: null,
        selectedItemType: null
      });
    }
  },

  pushToHistory: (snapshot: StateSnapshot) => {
    const state = get();
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    
    // Keep only last 50 states to prevent memory issues
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      set({ historyIndex: state.historyIndex + 1 });
    }
    
    set({ history: newHistory });
  },

  centerView: () => {
    set(state => ({
      viewport: {
        ...state.viewport,
        pan: { x: 0, y: 0 },
        zoom: 1
      }
    }));
  },

  // State persistence functions
  saveStateToStorage: () => {
    const state = useAppStore.getState();
    const stateToSave = {
      layers: state.layers,
      placedModules: state.placedModules,
      annotations: state.annotations,
      activeLayerId: state.activeLayerId,
      selectedItemId: state.selectedItemId,
      selectedItemType: state.selectedItemType,
      grid: state.grid,
      viewport: state.viewport,
      annotationMode: state.annotationMode,
      setupMetadata: state.setupMetadata,
      // Don't save modules as they are loaded from CSV
      // Don't save command history
    };
    localStorage.setItem('openuc2-optikit-state', JSON.stringify(stateToSave));
  },

  loadStateFromStorage: () => {
    const saved = localStorage.getItem('openuc2-optikit-state');
    if (saved) {
      try {
        const parsedState = JSON.parse(saved);
        set(state => ({
          ...state,
          ...parsedState,
          modules: state.modules, // Keep loaded modules
          history: state.history, // Keep command history
        }));
      } catch (error) {
        console.error('Failed to load state from storage:', error);
      }
    }
    
    // Load tutorial state separately
    const tutorialCompleted = localStorage.getItem('optikit-tutorial-completed');
    if (tutorialCompleted) {
      set({ tutorialCompleted: tutorialCompleted === 'true' });
    }
  },

  downloadScreenshot: () => {
    // This will be handled by the GridCanvas component
    // We'll emit a custom event for the canvas to capture
    const event = new CustomEvent('download-screenshot');
    window.dispatchEvent(event);
  },

  saveToGitHub: async () => {
    const state = get();
    
    // Hardcoded repository configuration
    const owner = 'beniroquai';
    const repo = 'openUC2-OptiKit-Store';
    const branch = 'main';
    /*
    
    // Get the last 7 characters of the token from user
    const tokenSuffix = prompt(
      'Enter the last 7 characters of your GitHub token:\n' +
      '(Contact us via email to get the complete token)\n' +
      'Format: ghp_5Ir5WQHupDfY5nuKaAoAGE3EI[XXXXXXX]'
    );
    
    if (!tokenSuffix) {
      return; // User cancelled
    }
    
    if (false && tokenSuffix.length !== 7) {
      alert('Please enter exactly 7 characters for the token suffix.');
      return;
    }
    */
    // Construct the complete token
    const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
    const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH'; // Replace with the actual suffix
    const token = tokenPrefix + tokenSuffix;
    
    try {
      // Initialize Octokit with the provided token
      const octokit = new Octokit({
        auth: token.trim()
      });
      
      // Create export data
      const exportData = await state.exportData();
      const setup = JSON.parse(exportData);
      
      // Generate filename with timestamp
      const timestamp = Date.now();
      const filename = `setup-${timestamp}.json`;
      const path = `setups/${filename}`;
      
      // Encode content as base64 (handle Unicode characters properly)
      const jsonString = JSON.stringify(setup, null, 2);
      const content = btoa(unescape(encodeURIComponent(jsonString)));
      
      // Create commit message
      const message = `Add OpenUC2 OptiKit setup: ${setup.uc2_components?.length || 0} components`;
      
      // Save to GitHub repository
      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path,
        message,
        content,
        branch
      });
      
      const fileUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      
      alert(
        `✅ Setup saved to GitHub successfully!\n\n` +
        `File: ${filename}\n` +
        `View: ${fileUrl}\n` +
        `Raw URL: ${rawUrl}\n\n` +
        `You can import this setup using the raw URL.`
      );
      
    } catch (error: unknown) {
      console.error('GitHub save error:', error);
      
      let errorMessage = 'Failed to save to GitHub. ';
      
      if (error && typeof error === 'object' && 'status' in error) {
        const githubError = error as { status: number; message?: string };
        if (githubError.status === 401) {
          errorMessage += 'Invalid or expired token. Please check your personal access token.';
        } else if (githubError.status === 403) {
          errorMessage += 'Permission denied. Ensure your token has "Repository contents" write permission.';
        } else if (githubError.status === 404) {
          errorMessage += 'Repository not found. Check the owner and repository name.';
        } else {
          errorMessage += `Error: ${githubError.message || 'Unknown error'}`;
        }
      } else {
        errorMessage += `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
      
      alert(errorMessage);
    }
  },

  generateShareableLink: () => {
    const state = get();
    
    // Create compact export for URL sharing
    const compactExport = {
      m: state.placedModules.map(module => ({
        i: module.moduleId,
        p: [module.position.x, module.position.y, module.layer],
        r: module.rotation,
        ...(module.customText && { t: module.customText })
      })),
      a: state.annotations.map(annotation => ({
        t: annotation.type,
        p: annotation.points || [],
        ...(annotation.text && { x: annotation.text })
      })),
      // Include metadata in shareable links
      meta: state.setupMetadata
    };
    
    // Base64 encode the compact JSON to make it URL-safe
    const jsonString = JSON.stringify(compactExport);
    const base64Data = btoa(jsonString);
    
    // Create shareable URL
    const currentUrl = window.location.origin + window.location.pathname;
    const shareableUrl = `${currentUrl}?data=${base64Data}`;
    
    // Check URL length and fallback if needed
    if (shareableUrl.length > 2000) {
      // For very large layouts, create a simplified version without metadata
      const simplifiedExport = {
        m: state.placedModules.map(module => ({
          i: module.moduleId,
          p: [module.position.x, module.position.y, module.layer]
        }))
      };
      const simplifiedBase64 = btoa(JSON.stringify(simplifiedExport));
      return `${currentUrl}?data=${simplifiedBase64}`;
    }
    
    return shareableUrl;
  },

  downloadSTLBundle: async (password: string) => {
    if (password !== "youseetoo") {
      alert("Invalid password");
      return;
    }

    try {
      const state = get();
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      
      // Count occurrences of each module and collect CAD files
      const moduleCountMap = new Map<string, number>();
      const moduleToCADMap = new Map<string, string>();
      
      state.placedModules.forEach(module => {
        const moduleDefinition = state.modules.find(m => m.id === module.moduleId);
        if (moduleDefinition?.cadUrl) {
          const count = moduleCountMap.get(module.moduleId) || 0;
          moduleCountMap.set(module.moduleId, count + 1);
          moduleToCADMap.set(module.moduleId, moduleDefinition.cadUrl);
        }
      });

      // Fetch each STL file and add multiple copies to zip
      const promises = Array.from(moduleCountMap.entries()).map(async ([moduleId, count]) => {
        const cadUrl = moduleToCADMap.get(moduleId);
        if (!cadUrl) return;
        
        try {
          const response = await fetch(cadUrl);
          if (response.ok) {
            const blob = await response.blob();
            const baseFilename = cadUrl.split('/').pop() || 'unknown.stl';
            const nameWithoutExt = baseFilename.replace(/\.stl$/i, '');
            const ext = '.stl';
            
            // Add multiple copies with numbered suffixes
            for (let i = 1; i <= count; i++) {
              const filename = count > 1 ? `${nameWithoutExt}_copy${i}${ext}` : baseFilename;
              zip.file(filename, blob);
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch ${cadUrl}:`, error);
        }
      });

      await Promise.all(promises);

      // Generate zip and download
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'optikit-stl-bundle.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Failed to create STL bundle:', error);
      alert('Failed to create STL bundle');
    }
  },

  clearAll: () => {
    const state = get();
    // Create snapshot for undo functionality
    state.pushToHistory({
      placedModules: state.placedModules,
      annotations: state.annotations,
      layers: state.layers,
      activeLayerId: state.activeLayerId
    });
    
    set({
      placedModules: [],
      annotations: [],
      selectedItemId: null,
      selectedItemType: null
    });
    
    // Save state after clearing
    get().saveStateToStorage();
  },

  setActiveRightTab: (tab: 'layers' | 'properties' | 'bom') => {
    set({ activeRightTab: tab });
  },

  updateSetupMetadata: (metadata: Partial<SetupMetadata>) => {
    set((state) => ({
      setupMetadata: { ...state.setupMetadata, ...metadata }
    }));
    // Save state after updating metadata
    get().saveStateToStorage();
  },

  // Tutorial actions
  setTutorialCompleted: (completed: boolean) => {
    set({ tutorialCompleted: completed });
    // Save tutorial state to localStorage
    localStorage.setItem('optikit-tutorial-completed', completed.toString());
  },

  // Feedback actions
  submitFeedback: async (feedback: FeedbackData) => {
    try {
      // Submit feedback as a GitHub issue
      const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
      const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH'; // Replace with the actual suffix
      const token = tokenPrefix + tokenSuffix;
      const octokit = new Octokit({
        // Use a GitHub token if available, otherwise submit anonymously (limited)
        auth: token.trim()
      });

      const issueTitle = `[${feedback.type.toUpperCase()}] ${feedback.title}`;
      const issueBody = `
**Feedback Type:** ${feedback.type}
**Trigger:** ${feedback.trigger}
**Timestamp:** ${feedback.timestamp}

**Description:**
${feedback.description}

**Contact Information:**
${feedback.email ? `Email: ${feedback.email}` : 'No contact provided'}

**Technical Details:**
- User Agent: ${feedback.userAgent}
- URL: ${feedback.url}
      `.trim();
 
      await octokit.rest.issues.create({
        owner: 'beniroquai',
        repo: 'OpenUC2-OptiKit-Store',
        title: issueTitle,
        body: issueBody,
        labels: [`feedback-${feedback.type}`, 'user-feedback']
      });

      console.log('Feedback submitted successfully');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      // For now, just log to console if GitHub submission fails
      // In a production app, you might want to fall back to a different service
      throw error;
    }
  }
}));
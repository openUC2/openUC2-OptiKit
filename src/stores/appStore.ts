/**
 * The app shell store — catalog, layers, metadata, notifications, and the
 * LEGACY interchange plumbing (layout JSON, share links, GitHub setups).
 *
 * WP-96: this store no longer holds the design. Parts, selection and undo live
 * in `src/document/documentStore.ts`, spelled the way the `.dsn` spells them;
 * the import/export functions below convert through
 * `src/document/legacyLayout.ts` so the old files keep loading and saving
 * byte-compatibly. Do NOT add design state here.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Octokit } from '@octokit/rest';
import { isLibraryModule } from '../document/libraryPalette';
import { useDocumentStore } from '../document/documentStore';
import { partFromLayoutEntry, rotationTripleOf } from '../document/legacyLayout';
import { saveDocumentToStorage, loadDocumentFromStorage } from '../document/persistence';
import type { DsnPart } from '../document/types';
import type {
  AppState,
  Annotation,
  UC2Component,
  CompactExport,
  CompactModule,
  CompactAnnotation,
  SetupMetadata,
  FeedbackData,
  Notification
} from '../types';

interface AppStore extends AppState {
  // Actions
  loadModules: () => Promise<void>;
  setActiveLayer: (layerId: string) => void;
  exportData: () => Promise<string>;
  saveToGitHub: () => Promise<void>;
  downloadSTLBundle: (password: string) => Promise<void>;
  importData: (data: string) => void;
  importFromUrl: (url: string) => Promise<boolean>;
  saveStateToStorage: () => void;
  loadStateFromStorage: () => void;
  clearAll: () => void;
  updateSetupMetadata: (metadata: Partial<SetupMetadata>) => void;
  // Remote path tracking for overwrite-save
  setRemoteSourcePath: (path: string) => void;
  saveToGitHubOverwrite: () => Promise<void>;
  // Feedback actions
  submitFeedback: (feedback: FeedbackData) => Promise<void>;
  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state — the palette is registry-driven (WP-43/68): modules are
  // registered by PartLibrary from the library index, never loaded from CSV.
  modules: [],
  annotations: [],
  layers: [
    { id: 'layer-0', name: 'Layer 0', index: 0, visible: true }
  ],
  activeLayerId: 'layer-0',
  setupMetadata: {
    name: 'Untitled Setup',
    author: '',
    githubAccount: '',
    description: '',
    category: 'General',
    screenshot: '',
    uc2_verified: false,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    collection: ['General'], // Support multiple collections as array
    notification: ''
  },
  notifications: [],
  remoteSourcePath: '',

  // Actions
  loadModules: async () => {
    // WP-43/69: the parts palette reads ONE database — the record registry
    // (registered from the index by PartLibrary). The legacy CSV loader is
    // retired; this only prunes any stale non-registry rows.
    set(state => ({ modules: state.modules.filter(m => isLibraryModule(m.id)) }));
  },

  setActiveLayer: (layerId: string) => {
    set({ activeLayerId: layerId });
  },

  setRemoteSourcePath: (path: string) => {
    set({ remoteSourcePath: path });
  },

  saveToGitHubOverwrite: async () => {
    const state = get();
    if (!state.remoteSourcePath) {
      // No known remote path — fall back to create-new flow
      return state.saveToGitHub();
    }

    const owner = 'beniroquai';
    const repo = 'openUC2-OptiKit-Store';
    const branch = 'main';
    const tokenPrefix = 'github_pat_11ABBE5OA0xugcH1RMlAfO_8Gr1EuOvgqJcF12IShT1QeQB3qg5';
    const tokenSuffix = 'zYbA7QOwnfGrPVAI2U2C7TDn4Lp9jeH';
    const token = tokenPrefix + tokenSuffix;
    const path = state.remoteSourcePath; // Use existing path to overwrite

    try {
      const octokit = new Octokit({ auth: token.trim() });

      // Fetch the current file SHA (required for overwrite)
      const { data: fileData } = await octokit.request(
        'GET /repos/{owner}/{repo}/contents/{path}',
        { owner, repo, path, ref: branch }
      ) as { data: { sha: string } };

      const exportJson = await state.exportData();
      const setup = JSON.parse(exportJson);
      const jsonString = JSON.stringify(setup, null, 2);
      const content = btoa(unescape(encodeURIComponent(jsonString)));
      const message = `Update OpenUC2 OptiKit setup: ${setup.uc2_components?.length || 0} components`;

      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        message,
        content,
        sha: fileData.sha, // Required for overwrite
        branch
      });

      alert(`✅ Setup overwritten on GitHub!\nPath: ${path}`);
    } catch (error: unknown) {
      console.error('GitHub overwrite error:', error);
      alert(`Failed to overwrite setup: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  // The screenshot event dance retired with the Konva canvas (WP-69) — the
  // export carries whatever screenshot the setup metadata already holds.
  exportData: async () => {
    const state = get();
    const uc2_components: UC2Component[] = [];

    // WP-96: the layout JSON is a LEGACY interchange format — the document is
    // converted into it here (and only here), never stored in it.
    useDocumentStore.getState().parts.forEach((part, index) => {
      const moduleDefinition = state.modules.find(m => m.id === part.libraryRef);
      if (moduleDefinition) {
        // Generate a unique name with running number
        const baseName = moduleDefinition.name.replace(/\s+/g, '_');
        const runningNumber = index.toString().padStart(2, '0');
        const name = `${baseName}_${runningNumber}`;

        // Full 3-axis rotation tuple: [X pitch/tilt, Y yaw, Z roll/top]
        const [rotationX, rotationY, rotationZ] = rotationTripleOf(part.rot24);
        const params: Record<string, unknown> = { ...part.params };
        // The residuals ride in the same `__doc` bag the old format used.
        const doc: Record<string, unknown> = {};
        if (part.offsetMm.some(v => v !== 0)) doc.offsetMm = part.offsetMm;
        if (part.offsetDeg.x || part.offsetDeg.y || part.offsetDeg.z) {
          doc.offsetDeg = part.offsetDeg;
        }
        if (Object.keys(part.dofValues).length > 0) doc.dofValues = part.dofValues;
        if (Object.keys(doc).length > 0) params.__doc = doc;

        uc2_components.push({
          name: name,
          file: moduleDefinition.autodeskInventor || `C:\\UC2_Components\\${moduleDefinition.name.replace(/\s+/g, '_')}.iam`,
          // Layout files store the STORE cell (y grows south).
          grid_pos: [part.cell[0], -part.cell[1], part.cell[2]],
          rotation: [rotationX, rotationY, rotationZ],
          moduleId: part.libraryRef,
          originalName: moduleDefinition.name,
          description: moduleDefinition.description,
          params,
          customText: part.ref || undefined
        });
      }
    });

    return JSON.stringify({
      uc2_components,
      annotations: state.annotations,
      layers: state.layers,
      ...state.setupMetadata,
      screenshot: state.setupMetadata.screenshot || null,
      metadata: {
        version: "1.0",
        created: new Date().toISOString(),
        software: "OpenUC2 OptiKit"
      }
    }, null, 2);
  },

  importData: (data: string) => {
    try {
      const parsed = JSON.parse(data);
      
      // Check if it's the compact GitHub discussions format
      if (parsed.m) {
        const compactData = parsed as CompactExport;
        // Convert from compact format to internal format
        const parts: DsnPart[] = compactData.m.map((module: CompactModule) =>
          partFromLayoutEntry({
            moduleId: module.i,
            gridPos: [module.p[0], module.p[1], module.p[2] || 0],
            rotation: [module.xr || 0, module.r || 0, module.tr || 0],
            customText: module.t,
          }),
        );
        useDocumentStore.getState().replaceParts(parts);
        useDocumentStore.getState().clearHistory();
        
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
        
        // Extract metadata for collection and notification handling
        const importedMetadata = (compactData as CompactExport & { meta?: SetupMetadata }).meta;
        
        set({
          annotations,
          layers: [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }],
          // Import metadata if available
          setupMetadata: importedMetadata || {
            name: 'Imported Setup',
            author: '',
            githubAccount: '',
            description: '',
            category: 'General',
            screenshot: '',
            uc2_verified: false,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            collection: ['General'],
            notification: ''
          }
        });
        
        // Check for notification in imported setup metadata
        if (importedMetadata?.notification && importedMetadata.notification.trim()) {
          get().addNotification({
            type: 'warning',
            title: 'Setup Notice',
            message: importedMetadata.notification,
            duration: 8000 // Show for 8 seconds
          });
        }
        
        return;
      }
      
      // Check if it's the new unified format with uc2_components
      if (parsed.uc2_components) {
        // Convert from new format to internal format
        const parts: DsnPart[] = parsed.uc2_components.map((component: UC2Component) =>
          partFromLayoutEntry({
            moduleId: component.moduleId || component.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '-'),
            gridPos: [component.grid_pos[0], component.grid_pos[1], component.grid_pos[2] || 0],
            rotation: [component.rotation[0] || 0, component.rotation[1] || 0, component.rotation[2] || 0],
            params: component.params,
            customText: component.customText,
          }),
        );
        useDocumentStore.getState().replaceParts(parts);
        useDocumentStore.getState().clearHistory();
        
        set({
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }],
          setupMetadata: parsed.setupMetadata || parsed.meta || {
            name: parsed.name || 'Imported Setup',
            author: parsed.author || '',
            githubAccount: '',
            description: parsed.description || '',
            category: parsed.category || 'General',
            screenshot: parsed.screenshot || '',
            uc2_verified: parsed.uc2_verified || false,
            version: parsed.version || '1.0.0',
            createdAt: parsed.createdAt || new Date().toISOString(),
            collection: parsed.collection || ['General'],
            notification: parsed.notification || ''
          },
        });
        
        // Check for notification in imported setup metadata
        const importedMetadata = parsed.setupMetadata || parsed.meta;
        const notificationMessage = importedMetadata?.notification || parsed.notification;
        if (notificationMessage && notificationMessage.trim()) {
          get().addNotification({
            type: 'warning',
            title: 'Setup Notice',
            message: notificationMessage,
            duration: 8000
          });
        }
      } else {
        // Legacy format support
        set({
          annotations: parsed.annotations || [],
          setupMetadata: parsed.setupMetadata || {
            name: parsed.name || 'Imported Setup',
            author: parsed.author || '',
            githubAccount: '',
            description: parsed.description || '',
            category: parsed.category || 'General',
            screenshot: parsed.screenshot || '',
            uc2_verified: parsed.uc2_verified || false,
            version: parsed.version || '1.0.0',
            createdAt: parsed.createdAt || new Date().toISOString(),
            collection: parsed.collection || ['General'],
            notification: parsed.notification || ''
          },
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }],
        });
        
        // Check for notification in legacy format
        const notificationMessage = parsed.setupMetadata?.notification || parsed.notification;
        if (notificationMessage && notificationMessage.trim()) {
          get().addNotification({
            type: 'warning',
            title: 'Setup Notice',
            message: notificationMessage,
            duration: 8000
          });
        }
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
        const parts: DsnPart[] = compactData.m.map((module: CompactModule) =>
          partFromLayoutEntry({
            moduleId: module.i,
            gridPos: [module.p[0], module.p[1], module.p[2] || 0],
            rotation: [module.xr || 0, module.r || 0, module.tr || 0],
            customText: module.t,
          }),
        );
        useDocumentStore.getState().replaceParts(parts);
        useDocumentStore.getState().clearHistory();
        
        set({
          annotations: [],
          layers: [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
        return true;
      }
      
      // Check if it's the new unified format with uc2_components
      if (parsed.uc2_components) {
        // Convert from new format to internal format
        const parts: DsnPart[] = parsed.uc2_components.map((component: UC2Component) =>
          partFromLayoutEntry({
            moduleId: component.moduleId || component.name.toLowerCase().replace(/_\d+$/, '').replace(/_/g, '-'),
            gridPos: [component.grid_pos[0], component.grid_pos[1], component.grid_pos[2] || 0],
            rotation: [component.rotation[0] || 0, component.rotation[1] || 0, component.rotation[2] || 0],
            params: component.params,
            customText: component.customText,
          }),
        );
        useDocumentStore.getState().replaceParts(parts);
        useDocumentStore.getState().clearHistory();
        
        set({
          annotations: parsed.annotations || [],
          layers: parsed.layers || [{ id: 'layer-0', name: 'Layer 0', index: 0, visible: true }]
        });
      } else {
        // Legacy format support
        set({
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


  // State persistence. WP-96: the DESIGN is persisted by the document store
  // (`src/document/persistence.ts`); this key keeps only the shell state.
  saveStateToStorage: () => {
    const state = useAppStore.getState();
    const stateToSave = {
      layers: state.layers,
      annotations: state.annotations,
      activeLayerId: state.activeLayerId,
      setupMetadata: state.setupMetadata,
      // Don't save modules (registry-registered) or the design.
    };
    localStorage.setItem('openuc2-optikit-state', JSON.stringify(stateToSave));
    saveDocumentToStorage();
  },

  loadStateFromStorage: () => {
    // The document first — this also migrates a pre-WP-96 blob once.
    loadDocumentFromStorage();
    const saved = localStorage.getItem('openuc2-optikit-state');
    if (!saved) return;
    try {
      // Pick only the fields this store still owns — older saves also carry
      // retired grid-builder keys (grid, viewport, annotationMode) and the
      // pre-WP-96 `placedModules`, which are ignored here and dropped on the
      // next save.
      const parsedState = JSON.parse(saved) as Partial<AppState>;
      set(state => ({
        layers: parsedState.layers ?? state.layers,
        annotations: parsedState.annotations ?? state.annotations,
        activeLayerId: parsedState.activeLayerId ?? state.activeLayerId,
        setupMetadata: parsedState.setupMetadata ?? state.setupMetadata,
      }));
    } catch (error) {
      console.error('Failed to load state from storage:', error);
    }
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
      
      useDocumentStore.getState().parts.forEach(part => {
        const moduleDefinition = state.modules.find(m => m.id === part.libraryRef);
        if (moduleDefinition?.cadUrl) {
          const count = moduleCountMap.get(part.libraryRef) || 0;
          moduleCountMap.set(part.libraryRef, count + 1);
          moduleToCADMap.set(part.libraryRef, moduleDefinition.cadUrl);
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
    // The design clears through the document store (one undo step).
    const doc = useDocumentStore.getState();
    doc.pushHistory(doc.snapshot());
    doc.replaceParts([]);
    set({ annotations: [] });
    get().saveStateToStorage();
  },

  updateSetupMetadata: (metadata: Partial<SetupMetadata>) => {
    set((state) => ({
      setupMetadata: { ...state.setupMetadata, ...metadata }
    }));
    // Save state after updating metadata
    get().saveStateToStorage();
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
  },

  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => {
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        id: uuidv4(),
        timestamp: Date.now()
      };
      
      return {
        notifications: [...state.notifications, newNotification]
      };
    });
    
    // Auto-remove notification after duration if specified
    if (notification.duration && notification.duration > 0) {
      const notificationId = get().notifications[get().notifications.length - 1].id;
      setTimeout(() => {
        get().removeNotification(notificationId);
      }, notification.duration);
    }
  },

  removeNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
}));

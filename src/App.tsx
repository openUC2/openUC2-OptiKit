import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { AppShell } from './components/AppShell'
import { EditorPage } from './components/EditorPage'
import { SetupBrowser } from './components/SetupBrowser'
import { CollectionView } from './components/CollectionView'
import { FrameWizardPage } from './components/FrameWizardPage'
import { StartupDialog } from './components/StartupDialog'
import { NotificationDisplay } from './components/NotificationDisplay'
import { useAppStore } from './stores/appStore'
import { materialTheme } from './theme/materialTheme'
import { trackUserVisit } from './utils/statisticsHandler'
import './styles/fonts.css'
import './styles/brand.css'
import './App.css'

// WP-37: the legacy Editor3DPage (View 3D) is retired — /configurator/3d now
// redirects to the assembly, which renders the cubes in 3D.
const SchematicPage = lazy(() =>
  import('./components/schematic/SchematicPage').then(m => ({ default: m.SchematicPage }))
);
const ComponentEditorPage = lazy(() =>
  import('./components/component-editor/ComponentEditorPage').then(m => ({ default: m.ComponentEditorPage }))
);
const AssemblyPage = lazy(() =>
  import('./components/assembly/AssemblyPage').then(m => ({ default: m.AssemblyPage }))
);
const BindPage = lazy(() =>
  import('./components/bind/BindPage').then(m => ({ default: m.BindPage }))
);

function App() {
  const { loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl, importData, undo, redo, setStartupDialogClosed } = useAppStore();
  const [showStartupDialog, setShowStartupDialog] = useState(false);

  const handleCloseStartupDialog = () => {
    setShowStartupDialog(false);
    setStartupDialogClosed(true);
  };

  useEffect(() => {
    // Browser history integration for undo/redo
    let historyPosition = 0;
    
    const handleHistoryChange = () => {
      const currentPosition = history.state?.position || 0;
      
      if (currentPosition < historyPosition) {
        // User went back in browser history - trigger undo
        undo();
      } else if (currentPosition > historyPosition) {
        // User went forward in browser history - trigger redo
        redo();
      }
      
      historyPosition = currentPosition;
    };

    window.addEventListener('popstate', handleHistoryChange);
    
    // Push initial state to browser history
    if (!history.state) {
      history.replaceState({ position: 0 }, '', window.location.href);
    }

    return () => {
      window.removeEventListener('popstate', handleHistoryChange);
    };
  }, [undo, redo]);

  useEffect(() => {
    // Subscribe to app state changes to sync with browser history
    const unsubscribe = useAppStore.subscribe((state) => {
      // Only push to browser history when internal history changes
      if (state.historyIndex > 0) {
        const newPosition = state.historyIndex;
        if (history.state?.position !== newPosition) {
          history.pushState({ position: newPosition }, '', window.location.href);
        }
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    // Load modules and state on app start
    loadModules().then(() => {
      loadStateFromStorage();
      
      // Track user visit for statistics
      trackUserVisit().catch(error => {
        console.error('Failed to track user visit:', error);
      });
      
      // Check if this is the first visit and user is on the main configurator page
      const hasVisitedBefore = localStorage.getItem('optikit-visited');
      const isMainPage = window.location.pathname === '/configurator' || window.location.pathname === '/configurator/';
      
      if (!hasVisitedBefore && isMainPage) {
        setShowStartupDialog(true);
        localStorage.setItem('optikit-visited', 'true');
      } else {
        // If no startup dialog is shown, mark it as closed immediately for tutorial timing
        setStartupDialogClosed(true);
      }
      
      // Check for URL parameters to load a layout
      const urlParams = new URLSearchParams(window.location.search);
      const layoutUrl = urlParams.get('layout');
      const encodedData = urlParams.get('data');
      
      if (layoutUrl) {
        importFromUrl(layoutUrl).then(success => {
          if (success) {
            console.log('Layout loaded from URL:', layoutUrl);
          } else {
            console.error('Failed to load layout from URL:', layoutUrl);
          }
        });
      } else if (encodedData) {
        try {
          // Decode base64 data and import
          const jsonString = atob(encodedData);
          const data = JSON.parse(jsonString);
          importData(JSON.stringify(data));
          console.log('Layout loaded from shared link');
          
          // Clean URL by removing the data parameter
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        } catch (error) {
          console.error('Failed to load layout from shared link:', error);
        }
      }
    });

    // Auto-save state every 5 seconds
    const saveInterval = setInterval(() => {
      saveStateToStorage();
    }, 5000);

    // Save state on page unload
    const handleBeforeUnload = () => {
      saveStateToStorage();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(saveInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl, importData, setStartupDialogClosed]);

  // Every route renders inside the shared AppShell (WP-24). Feedback round 3:
  // the LIGHT brand theme (guide body colours #FAF9F9/white) is the default
  // everywhere — the 3D/2D canvases stay dark drawing surfaces inside light
  // chrome, the KiCad pattern.
  const light = (node: ReactNode) => (
    <AppShell mode="light"><Suspense fallback={null}>{node}</Suspense></AppShell>
  );

  return (
    <ThemeProvider theme={materialTheme}>
      <CssBaseline />
      <Router basename="">
        <Routes>
          {/* The schematic is the primary editor; the legacy 2D grid builder
              stays reachable at /configurator/grid (feedback round 1). */}
          <Route path="/configurator" element={light(<SchematicPage />)} />
          <Route path="/configurator/" element={light(<SchematicPage />)} />
          <Route path="/configurator/grid" element={light(<EditorPage />)} />
          <Route path="/configurator/frame" element={light(<FrameWizardPage />)} />
          <Route path="/configurator/setups" element={light(<SetupBrowser />)} />
          {/* WP-37: View 3D retired — the assembly renders the cubes in 3D and
              is where optical parts associate with cubes. Redirect + notice. */}
          <Route path="/configurator/3d" element={<Navigate to="/configurator/assembly?from=3d" replace />} />
          <Route path="/configurator/schematic" element={light(<SchematicPage />)} />
          <Route path="/configurator/components" element={light(<ComponentEditorPage />)} />
          <Route path="/configurator/assembly" element={light(<AssemblyPage />)} />
          <Route path="/configurator/bind" element={light(<BindPage />)} />
          <Route path="/configurator/:collectionName" element={light(<CollectionView />)} />
          {/* Legacy routes for backward compatibility */}
          <Route path="/" element={light(<EditorPage />)} />
          <Route path="/setups" element={light(<SetupBrowser />)} />
          <Route path="/:collectionName" element={light(<CollectionView />)} />
        </Routes>
        
        {/* Startup Dialog */}
        <StartupDialog 
          open={showStartupDialog}
          onClose={handleCloseStartupDialog}
        />
        
        {/* Notification Display */}
        <NotificationDisplay />
      </Router>
    </ThemeProvider>
  )
}

export default App

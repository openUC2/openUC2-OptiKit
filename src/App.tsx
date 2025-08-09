import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { EditorPage } from './components/EditorPage'
import { SetupBrowser } from './components/SetupBrowser'
import { CollectionView } from './components/CollectionView'
import { StartupDialog } from './components/StartupDialog'
import { useAppStore } from './stores/appStore'
import { materialTheme } from './theme/materialTheme'
import './styles/brand.css'
import './App.css'

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
  }, [loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl, importData]);

  return (
    <ThemeProvider theme={materialTheme}>
      <CssBaseline />
      <Router basename="/configurator">
        <Routes>
          <Route path="/" element={<EditorPage />} />
          <Route path="/setups" element={<SetupBrowser />} />
          <Route path="/:collectionName" element={<CollectionView />} />
        </Routes>
        
        {/* Startup Dialog */}
        <StartupDialog 
          open={showStartupDialog}
          onClose={handleCloseStartupDialog}
        />
      </Router>
    </ThemeProvider>
  )
}

export default App

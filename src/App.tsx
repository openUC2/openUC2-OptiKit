import { useEffect } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { Layout } from './components/Layout'
import { useAppStore } from './stores/appStore'
import { materialTheme } from './theme/materialTheme'
import './styles/brand.css'
import './App.css'

function App() {
  const { loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl } = useAppStore();

  useEffect(() => {
    // Load modules and state on app start
    loadModules().then(() => {
      loadStateFromStorage();
      
      // Check for URL parameters to load a layout
      const urlParams = new URLSearchParams(window.location.search);
      const layoutUrl = urlParams.get('layout');
      
      if (layoutUrl) {
        importFromUrl(layoutUrl).then(success => {
          if (success) {
            console.log('Layout loaded from URL:', layoutUrl);
          } else {
            console.error('Failed to load layout from URL:', layoutUrl);
          }
        });
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
  }, [loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl]);

  return (
    <ThemeProvider theme={materialTheme}>
      <CssBaseline />
      <Layout />
    </ThemeProvider>
  )
}

export default App

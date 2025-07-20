import { useEffect } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { Layout } from './components/Layout'
import { useAppStore } from './stores/appStore'
import { materialTheme } from './theme/materialTheme'
import './styles/brand.css'
import './App.css'

function App() {
  const { loadModules, loadStateFromStorage, saveStateToStorage, importFromUrl, importData } = useAppStore();

  useEffect(() => {
    // Load modules and state on app start
    loadModules().then(() => {
      loadStateFromStorage();
      
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
      <Layout />
    </ThemeProvider>
  )
}

export default App

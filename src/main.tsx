import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Import direct SVG test for debugging
import { testDirectSVGUpload } from './utils/directSVGTest'

// Add debugging functions to window
if (typeof window !== 'undefined') {
  (window as any).testDirectSVGUpload = testDirectSVGUpload;
  
  // Debug function to check what's in localStorage or session
  (window as any).debugModuleCreation = () => {
    console.log('🔍 DEBUGGING MODULE CREATION');
    console.log('Local storage:', localStorage);
    console.log('Session storage:', sessionStorage);
    
    // Try to access React DevTools or app state if available
    console.log('Window objects:', Object.keys(window));
  };
  
  console.log('🚀 Debug functions available:');
  console.log('- testDirectSVGUpload() - Tests direct SVG upload to GitHub');
  console.log('- debugModuleCreation() - Shows debugging info');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

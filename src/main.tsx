import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Import direct SVG test for debugging
import { testDirectSVGUpload } from './utils/directSVGTest'
import { testStatisticsCollection } from './utils/testStatistics'
import { startKernelSimulation } from './kernel/kernelSim'
import { useAppStore } from './stores/appStore'
import { useSimulationStore } from './stores/simulationStore'

// Add debugging functions to window
if (typeof window !== 'undefined') {
  (window as any).testDirectSVGUpload = testDirectSVGUpload;
  (window as any).testStatistics = testStatisticsCollection;
  
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
  console.log('- testStatistics() - Tests user statistics collection');
  console.log('- debugModuleCreation() - Shows debugging info');
}

// EMB-D: the kernel live loop — edits re-materialize via /v1/scene3 and
// re-trace in the oc-wasm worker. Idle until simulation is enabled and
// something is placed.
startKernelSimulation()

if (typeof window !== 'undefined') {
  // Store handles for the Playwright acceptance tests (drive placements and
  // read results without fragile canvas automation).
  (window as any).__stores = { app: useAppStore, sim: useSimulationStore };
}

// EMB-B: boot the oc-wasm kernel worker on demand (?kernel=1). Nothing renders
// from it yet; this proves the vendored wasm loads under the /configurator/
// base and is the hook the Playwright smoke test drives. EMB-D wires it to the
// edit loop.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('kernel')) {
  import('./kernel/KernelClient').then(async ({ getKernelClient }) => {
    const kernel = getKernelClient();
    await kernel.ready;
    const { segments } = await kernel.traceWorld(); // no scene loaded: empty buffer
    (window as any).__ocKernelReady = segments.length === 0;
    console.log('oc-wasm kernel ready');
  }).catch((e) => {
    (window as any).__ocKernelError = String(e);
    console.error('oc-wasm kernel failed to boot:', e);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startKernelSimulation } from './kernel/kernelSim'

// EMB-G1: the kernel live loop — design edits re-materialize via /v1/scene3
// and re-trace in the oc-wasm worker. Idle (no wasm, no requests) until a
// part is placed.
startKernelSimulation()

// No <StrictMode>: its dev-only double mount runs the react-three-fiber
// teardown between the two mounts, and that teardown calls
// forceContextLoss() on the canvas. A canvas whose context was force-lost
// can never obtain another one, so the second mount draws into a dead
// context and the 3D views render blank. Which browsers lose the race
// depends on timing (Brave loses it, the VS Code browser usually wins),
// and production builds never double-mount, which is why the deployed
// configurator is unaffected.
createRoot(document.getElementById('root')!).render(<App />)

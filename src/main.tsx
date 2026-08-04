import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startKernelSimulation } from './kernel/kernelSim'

// EMB-G1: the kernel live loop — design edits re-materialize via /v1/scene3
// and re-trace in the oc-wasm worker. Idle (no wasm, no requests) until a
// part is placed.
startKernelSimulation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

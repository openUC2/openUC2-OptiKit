import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/configurator/',
  plugins: [react()],
  optimizeDeps: {
    // The vendored wasm kernel initializes itself from an explicit URL; esbuild
    // pre-bundling would inline/relocate it and break that (integration spec 18.7).
    exclude: ['oc-wasm'],
  },
})

# Ray Optics Simulation Architecture Decision

## Decision: Hybrid Approach with ray-optics Library

**Date**: December 2024  
**Status**: Implemented  
**Author**: OpenUC2 Development Team

---

## Context

The OptiKit Configurator needed a 2D ray tracing capability to allow users to visualize light propagation through their optical setups. The project includes the **ray-optics** library source code at `/ray-optics-src/`, which is a sophisticated open-source ray tracing simulator.

## Decision

We chose a **Hybrid Approach**:
1. **Primary**: Use the **ray-optics library** (`/ray-optics-src/`) via the `RayOpticsAdapter`
2. **Fallback**: Custom lightweight `SimulationEngine` for simple scenarios

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Thread (UI)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Toolbar    │  │ PropertyPanel│  │   SimulationPanel    │  │
│  │ (toggle sim) │  │ (opt params) │  │ (controls/readings)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                            │                    │               │
│                            ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   simulationStore.ts                     │   │
│  │  - config (enabled, autoRun, maxRays, etc.)              │   │
│  │  - rays[], detectorReadings[], elements[]                │   │
│  │  - runSimulation(), stopSimulation(), setConfig()        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  SimulationManager.ts                    │   │
│  │  - Manages WebWorker lifecycle                           │   │
│  │  - Handles fallback to main thread                       │   │
│  │  - Provides async run() API with callbacks               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                     │                   │                       │
│           ┌─────────┴───────┐   ┌───────┴─────────┐            │
│           ▼                 ▼   ▼                 ▼            │
│  ┌────────────────┐  ┌─────────────────────────────────┐       │
│  │ SimulationEngine│  │     RayOpticsAdapter.ts        │       │
│  │ (Custom/Simple) │  │   (Full ray-optics library)    │       │
│  └────────────────┘  └─────────────────────────────────┘       │
│                                    │                            │
└────────────────────────────────────┼────────────────────────────┘
                                     │ imports
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    /ray-optics-src/core/                        │
├─────────────────────────────────────────────────────────────────┤
│  ├── Scene.js          - Optical scene management               │
│  ├── Simulator.js      - Ray tracing simulation engine          │
│  ├── Editor.js         - Scene editing capabilities             │
│  ├── geometry.js       - 2D geometry operations                 │
│  └── sceneObjs/        - Optical element implementations        │
│      ├── lightSource/  - SingleRay, PointSource, Beam           │
│      ├── mirror/       - Mirror, BeamSplitter, ArcMirror        │
│      ├── glass/        - IdealLens, SphericalLens, Glass        │
│      ├── blocker/      - Blocker, Aperture                      │
│      └── other/        - Detector, Ruler, etc.                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. RayOpticsAdapter (`src/simulation/RayOpticsAdapter.ts`)
- **Primary simulation backend** using the ray-optics library
- Converts OptiKit modules to ray-optics scene objects (`Scene`, `sceneObjs`)
- Creates: `IdealLens`, `Mirror`, `BeamSplitter`, `SingleRay`, `PointSource`, `Detector`
- Uses `Simulator` class for ray tracing
- Extracts ray paths and detector readings from simulation

### 2. SimulationEngine (`src/simulation/SimulationEngine.ts`)
- **Fallback/lightweight** custom ray tracing engine
- Pure TypeScript geometric ray tracing
- Simpler implementation for basic scenarios
- Faster for simple setups

### 3. SceneBuilder (`src/utils/sceneBuilder.ts`)
- Converts OptiKit modules to simulation optical elements
- Handles coordinate transformation (grid units → mm)
- Maintains module-to-simulation parameter mappings
- Provides wavelength-to-color conversion for visualization

### 4. SimulationStore (`src/stores/simulationStore.ts`)
- Zustand store for simulation state
- Auto-run with debouncing when modules change
- Persists configuration across sessions

### 5. RayOverlay (`src/components/RayOverlay.tsx`)
- Konva layer for rendering ray paths
- Color modes: wavelength, intensity, source
- Detector hit point visualization

### 6. SimulationPanel (`src/components/SimulationPanel.tsx`)
- Run/stop controls
- Configuration sliders (ray count, bounces, brightness)
- Detector reading table

---

## Ray-Optics Library Integration

The ray-optics library (`/ray-optics-src/`) provides:

### Scene Objects (from `sceneObjs/`)
| OptiKit Type | Ray-Optics Class | Location |
|--------------|------------------|----------|
| Laser | `SingleRay` | `lightSource/SingleRay.js` |
| LED | `PointSource` | `lightSource/PointSource.js` |
| Lens | `IdealLens` | `glass/IdealLens.js` |
| Mirror | `Mirror` | `mirror/Mirror.js` |
| Beam Splitter | `BeamSplitter` | `mirror/BeamSplitter.js` |
| Aperture | `Blocker` | `blocker/Blocker.js` |
| Detector | `Detector` | `other/Detector.js` |

### Key Classes
- **`Scene`**: Manages optical elements, simulation settings
- **`Simulator`**: Performs ray tracing, handles rendering
- **`geometry`**: 2D vector operations, intersections

### Creating Elements (example)
```javascript
// Create an IdealLens from ray-optics
const lens = new sceneObjs.IdealLens(scene);
lens.p1 = geometry.point(x1, y1);  // First endpoint
lens.p2 = geometry.point(x2, y2);  // Second endpoint
lens.focalLength = 100;            // mm
scene.objs.push(lens);
```

---

## Type Definitions

All simulation types are defined in `src/types/index.ts`:

- `OpticalElement` - Simulation representation of optical components
- `OpticalElementParams` - Parameters for each element type
- `RayPath` / `RaySegment` - Ray trajectory data
- `DetectorReading` - Power/position measurements
- `SimulationConfig` - Global simulation settings
- `SimulationResult` - Complete simulation output
- `ModuleSimulationModel` - Mapping from OptiKit module to sim element

---

## Module Mapping

The `MODULE_SIMULATION_MODELS` constant maps OptiKit module IDs to their simulation representations:

| Module ID | Simulation Type | Key Parameters |
|-----------|-----------------|----------------|
| `lens-pos-1x1` | `lens` | focalLength (positive) |
| `lens-neg-1x1` | `lens` | focalLength (negative) |
| `mirror-1x1` | `mirror` | curvature, reflectivity |
| `beamsplitter-1x1` | `beamsplitter` | splitRatio |
| `filter-dichroic` | `dichroic` | cutoffWavelength |
| `laser-*` | `laser` | wavelength, power, divergence=0 |
| `led-*` | `led` | wavelength, divergence |
| `camera-*` | `detector` | width, height |
| `pinhole-1x1` | `aperture` | diameter |

---

## Performance Considerations

1. **Ray Count Limits**
   - Default: 100 rays max per source
   - User-adjustable via SimulationPanel
   - Higher counts increase accuracy but slow rendering

2. **Bounce Limits**
   - Default: 20 max bounces per ray
   - Prevents infinite loops in resonant cavities

3. **Debouncing**
   - Auto-run waits 300ms after last change
   - Prevents excessive recalculation during editing

4. **Worker Fallback**
   - If WebWorker fails, simulation runs on main thread
   - May cause brief UI freezes for complex scenes

---

## Future Enhancements

1. **Wave Optics Mode** (if needed)
   - Gaussian beam propagation
   - Diffraction at apertures
   - Interference effects

2. **Optimization Tools**
   - Auto-focus (find detector position)
   - Beam expander design wizard

3. **Export/Import**
   - Save simulation state with projects
   - Export ray data as CSV

4. **Advanced Visualization**
   - Irradiance heatmap overlay
   - 3D perspective view option

---

## Attribution

This implementation uses the [ray-optics](https://github.com/ricktu288/ray-optics) library (Apache-2.0 license) for advanced ray tracing capabilities. The library source is included at `/ray-optics-src/`.

The custom `SimulationEngine` serves as a lightweight alternative for simple scenarios.

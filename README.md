> [!IMPORTANT]
> **This branch has moved.** Development of the DSN editor continues in
> [openUC2/optikit-frontend-v2](https://github.com/openUC2/optikit-frontend-v2)
> (protected `main`, PR workflow). This repository remains the live demo /
> configurator; nothing deploys from `dsn-model`.

# OpenUC2 OptiKit — KiCad for optical setups

Design an optical instrument the way you design a circuit board: place parts,
wire the beam paths, check the design, simulate the rays, then produce the
thing. The editor is a **schematic** (optical parts and beam paths) plus an
**assembly** (openUC2 cube modules on the 50/50/55 mm grid), over a shared
`.dsn` document. Ray tracing, CAD generation and the part library live in the
sibling engine repo, `../optikit-core`.

> **New here? Read [`DOCS/GETTING-STARTED.md`](DOCS/GETTING-STARTED.md) first.**
> It covers what this is, how to run both repos, the one idea you actually need
> (a part is three linked records), and the traps that have each cost somebody a
> day. The sections below are reference material, and some of them predate the
> schematic/assembly split — treat the getting-started guide as the current map.

![OpenUC2 OptiKit Screenshot](https://github.com/user-attachments/assets/42914b8f-b1c5-4571-8e1a-9331490340ff)

## Features

### Core Functionality
- **2D Grid Canvas**: Precise 50mm grid with snap-to-grid placement
- **Part Library**: Draggable optical components with search/filter functionality
- **Layer Management**: Multiple Z-layers for creating 3D-like stacks
- **Module Placement**: Drag & drop with collision detection and multi-cell support
- **Rotation**: 90° rotation steps with footprint integrity
- **Export/Import**: JSON-based scene serialization

### User Interface
- **Split-pane Layout**: Part library (left), canvas (center), controls (right)
- **Property Panel**: Context-aware parameter editing
- **Toolbar**: Grid controls, undo/redo, export/import
- **Layer Panel**: Add, remove, and switch between layers
- **Search**: Real-time filtering of available parts

### Technical Features
- **Grid Snapping**: ≤5px accuracy at 100% zoom
- **Collision Detection**: Prevents overlapping multi-cell modules
- **Zoom & Pan**: Mouse wheel zoom and drag-to-pan viewport
- **Responsive Design**: Adapts to different screen sizes

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Canvas**: React-Konva for 2D rendering
- **State Management**: Zustand
- **Build Tool**: Vite
- **Styling**: CSS3 with responsive design
- **Package Manager**: npm

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/openUC2/openUC2-OptiKit.git

# Navigate to the project directory
cd openUC2-OptiKit

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

## Usage

### Adding Components
1. Browse the **Part Library** on the left
2. Use the search box to filter components
3. Drag components from the library onto the canvas
4. Components will snap to the 50mm grid automatically

### Layer Management
1. Use the **Layer Panel** to add new layers
2. Switch between layers by clicking on them
3. Each layer represents a different Z-level in your optical system
4. Delete layers using the × button (minimum 1 layer required)

### Component Properties
1. Click on any placed component to select it
2. View and edit properties in the **Property Panel**
3. Use the rotate button to rotate components in 90° steps
4. Delete components using the delete button

### Grid Controls
- **Grid Toggle (#)**: Show/hide the grid lines
- **Snap Toggle (⊞)**: Enable/disable snap-to-grid
- **Zoom**: Use mouse wheel to zoom in/out
- **Pan**: Drag the canvas to pan around

### Export/Import
- **Export (↓)**: Save your layout as a JSON file
- **Import (↑)**: Load a previously saved layout

## Available Components

The application includes several pre-defined optical components:

- **Basic Cube** (1×1): Standard optical cube
- **Double Cube** (2×1): Extended optical cube
- **Quad Cube** (2×2): Large optical cube
- **Lens** (1×1): Optical lens component
- **Mirror** (1×1): Reflective mirror component

Each component has:
- Unique color coding
- Footprint dimensions
- Configurable parameters
- Rotation capabilities

## Architecture

### Component Structure
```
src/
├── components/           # React components
│   ├── Layout.tsx       # Main application layout
│   ├── GridCanvas.tsx   # Konva-based grid canvas
│   ├── PartLibrary.tsx  # Draggable parts library
│   ├── LayerPanel.tsx   # Layer management
│   ├── PropertyPanel.tsx # Property editing
│   └── Toolbar.tsx      # Top toolbar
├── stores/              # State management
│   └── appStore.ts      # Zustand store
├── types/               # TypeScript types
│   └── index.ts         # Application types
└── utils/               # Utility functions
```

### State Management
The application uses Zustand for centralized state management, handling:
- Component definitions and placement
- Layer management
- Selection state
- Grid configuration
- Viewport settings

## Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Code Style
- ESLint configuration for TypeScript and React
- Consistent naming conventions
- Component-based architecture
- Type-safe development with TypeScript

## Future Enhancements

- **Annotation Tools**: Line, arrow, and text annotations
- **Undo/Redo**: Command history implementation
- **Advanced Export**: SVG and PNG export options
- **Collaboration**: Multi-user editing capabilities
- **Performance**: Virtual scrolling for large component libraries
- **Accessibility**: Full keyboard navigation support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenUC2 community for the optical cube system concept
- React-Konva for excellent 2D canvas capabilities
- Zustand for lightweight state management

## The parts database (one source)

Placeable parts come from ONE database: the record library in the sibling
`../optikit-core` repo (`library/`), served by the optikit-core service as the
registry (`/v1/library/index`). The schematic palette, the component browser,
and the bind workbench all read it — there is no separate spreadsheet of parts
anymore (the legacy `modules_updated.csv` was migrated into records in WP-43;
set `localStorage['optikit-legacy-csv'] = '1'` to re-enable the old loader for
a release).

Each part is three linked records — component (the optical symbol), template
(the mechanical footprint + STP/GLB), module (the binding). Extend the database
by authoring in the **Components** editor (`/configurator/components`): browse
the library tab, open any record to edit a copy, then "Save to workspace"
(browser-local draft), "Write into ../optikit-core/library" (dev fast path), or
"Download record pair" (a git PR). `.dsn` setups are *designs* (arrangements of
parts), stored separately — not in the parts database. See
`../optikit-core/DOCS/LIBRARY.md` for the full contract.

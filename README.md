# openUC2-OptiKit

A browser-based 3D application for arranging openUC2 cube modules on a discrete grid. This prototype provides an intuitive interface for building optical setups from standard cube components.

## Features

- **3D Workspace**: Interactive 3D environment with orbit controls, zoom, and pan
- **Component Library**: Drag-and-drop interface with categorized cube modules
- **Grid Snapping**: Automatic alignment to 50mm × 50mm × 55mm grid
- **Property Panel**: Edit cube parameters and rotation (90° steps around X and Z axes)
- **Export/Import**: Save and load scenes as JSON files
- **Real-time Preview**: Live updates and visual feedback

## Tech Stack

- React 18 + TypeScript
- React-Three-Fiber (Three.js) for 3D rendering
- Zustand for state management
- React DnD for drag-and-drop functionality
- Vite for build system
- ESLint + Prettier for code quality

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/openUC2/openUC2-OptiKit.git
cd openUC2-OptiKit

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
npm run build
```

## Usage

1. **Adding Cubes**: Drag modules from the left sidebar into the 3D workspace
2. **Selecting Cubes**: Click on cubes in the 3D scene to select them
3. **Editing Properties**: Use the right panel to rotate cubes and edit parameters
4. **Exporting**: Use the toolbar to export your scene as JSON
5. **Importing**: Load previously saved scenes using the import button

## Grid System

- **X/Y Spacing**: 50mm
- **Z Spacing**: 55mm (accounting for connecting layers)
- **Automatic Snapping**: Cubes automatically align to grid points
- **Visual Grid**: Toggle grid visibility for reference

## Available Modules

The application includes several openUC2 cube modules:

- **Kinematic**: Inskin Low/Upper components
- **Holder**: Holder Low/Upper components

New modules can be added by updating the `initialModules` array in `src/store.ts`.

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── ComponentLibrary.tsx   # Left sidebar with draggable modules
│   ├── Scene3D.tsx            # Main 3D workspace
│   ├── PropertyPanel.tsx      # Right panel for editing
│   └── Toolbar.tsx            # Scene controls and export
├── utils/
│   └── grid.ts         # Grid utilities and snapping logic
├── store.ts            # Zustand state management
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## License

MIT License - see [LICENSE](LICENSE) file for details.

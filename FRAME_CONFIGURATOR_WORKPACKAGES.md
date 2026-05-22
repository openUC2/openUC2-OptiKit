# FRAME Configurator - Work Packages

Based on the discussion from 18.05., these work packages update the FRAME wizard configurator
to match real available hardware and improve the user experience.
Each WP is self-contained and can be implemented iteratively.

---

## WP1: Restructure Tabs & Remove Redundant Steps

**Goal:** Reorder wizard steps to match the agreed tab order, remove unnecessary steps.

**New tab order:**
1. Objective Changer (was "Obj. Revolver")
2. Objectives
3. Illumination (was "Light Source")
4. Fluorescence
5. Camera
6. Sample Holders
7. Summary & Quote Request (replaces "Custom" - see WP8)
8. Autofocus step (file: `AutofocusStep.tsx`)
9. Overview Camera step (file: `OverviewCameraStep.tsx`)


**Remove entirely:**
- Controls / HIK Controller Panel step (file: `ControlInputsStep.tsx`)
- Tube Lens step (file: `TubeLensStep.tsx`) - tube lens becomes fixed 180mm default, no user choice needed

**Files to modify:**
- `src/components/FrameWizardPage.tsx` - update `STEP_LABELS`, `renderStep()`, imports
- `src/stores/frameWizardStore.ts` - update `TOTAL_STEPS`, remove unused state fields, update price calculations
- `src/types/frameWizard.ts` - remove unused types (`AutofocusChoice`, etc.), update `FrameWizardState`

**Instructions for Claude Code:**
```
Update the FRAME wizard tab order to: Objective Changer, Objectives, Illumination, Fluorescence, Camera, Sample Holders, Summary & Quote.

In FrameWizardPage.tsx:
- Change STEP_LABELS to the new 7-step order
- Update renderStep() switch cases to match
- Remove imports for AutofocusStep, OverviewCameraStep, ControlInputsStep, TubeLensStep

In frameWizardStore.ts:
- Set TOTAL_STEPS = 7
- Remove autofocus, hasOverviewCamera, controlInputs, selectedTubeLens from defaultWizardState
- Remove their price calculations from getTotalPrice and getStepPrice
- In getSelectedComponents, remove autofocus/overview-camera/control-inputs sections
- Hardcode tube lens as 180mm F=180 in getSelectedComponents

In frameWizard.ts types:
- Remove AutofocusChoice type
- Remove  selectedTubeLens from FrameWizardState
- Keep the tube lens logic internal (fixed 180mm, not user-selectable)

Don't delete the removed step component files yet - just disconnect them.
```

---

## WP2: Update Objective Changer Step (was Revolver)

**Goal:** Replace the simple revolver toggle with a proper Objective Changer selection.

**Options:**
- **Single Objective Mount** - user can select 1 objective in the Objectives tab
- **2-Position Changer** - user can select up to 2 objectives in the Objectives tab

**Constraint logic:** The choice here determines how many objectives can be selected in the Objectives step.

**Files to modify:**
- `src/components/frameWizard/RevolverStep.tsx` - rename/rewrite as objective changer selector
- `src/types/frameWizard.ts` - add `ObjectiveChangerChoice = 'single' | '2-position'`
- `src/stores/frameWizardStore.ts` - replace `hasRevolver` with `objectiveChanger` field

**Instructions for Claude Code:**
```
Rewrite RevolverStep.tsx as the Objective Changer step.

Present two card options (like LightSourceStep pattern):
1. "Single Objective Mount" - description: fixed mount for one objective, lower cost
2. "2-Position Changer" - description: motorized changer, switch between 2 objectives during experiments

Add type ObjectiveChangerChoice = 'single' | '2-position' to frameWizard.ts.
Replace hasRevolver: boolean with objectiveChanger: ObjectiveChangerChoice in FrameWizardState (default: 'single').
Update the store accordingly.

This choice must constrain the Objectives step:
- If 'single': only primaryObjective can be selected
- If '2-position': both primaryObjective and secondaryObjective can be selected
```

---

## WP3: Update Objectives Step with Real Hardware

**Goal:** Replace placeholder objective data with the real available lenses from the hardware table.

**Real objectives to include:**

| Category | Model | Magnification/NA |
|----------|-------|-----------------|
| Objective Special | 20x/0.75 | 20x, NA 0.75 |
| High Rank (Soptop) | 4x/0.1 | 4x, NA 0.1 |
| High Rank (Soptop) | 10x/0.3 | 10x, NA 0.3 |
| High Rank (Soptop) | 20x/0.4 | 20x, NA 0.4 |
| High Rank (Soptop) | 40x/0.65 | 40x, NA 0.65 |
| Low Rank | 4x/0.1 | 4x, NA 0.1 |
| Low Rank | 10x/0.25 | 10x, NA 0.25 |
| Low Rank | 20x/0.35 | 20x, NA 0.35 |
| Phase Contrast | 4x/0.13 | 4x, NA 0.13 |
| Phase Contrast | 10x/0.25 | 10x, NA 0.25 |
| Phase Contrast | 20x/0.4 | 20x, NA 0.4 |

**Additional requirements:**
- Add a note/info box: "All objectives are optically based on Olympus infinity correction (180mm tube lens)"
- Group objectives by category in the table
- Respect the constraint from WP2: if single mount, disable secondary objective selection

**Files to modify:**
- `public/configurator/objectives_library.csv` - replace content with real objectives
- `src/components/frameWizard/ObjectiveStep.tsx` - add category grouping, Olympus note, respect changer constraint

**Instructions for Claude Code:**
```
Replace the objectives_library.csv with the real hardware data. Use semicolon-delimited format matching the existing CSV structure. Categories: "Special", "High Rank Soptop", "Low Rank", "Phase Contrast".

Update ObjectiveStep.tsx:
- Add an info Alert at the top: "All objectives are optically based on Olympus infinity correction and use a 180mm tube lens."
- Group the table rows by category (show category headers)
- Read objectiveChanger from the store
- If objectiveChanger === 'single': hide the secondary objective column/radio
- If objectiveChanger === '2-position': show both primary and secondary selection columns
- When user picks a phase contrast objective, note this requires the Complex illumination setup
```

---

## WP4: Rewrite Illumination Step

**Goal:** Simplify illumination to two clear options with condenser sub-selection.

**Options:**
1. **Single High-Power White LED + Condenser Lens** - basic brightfield
2. **Complex Setup** - same LED module PLUS additional RGB LED Ring array for:
   - Phase Contrast
   - Differential Phase Contrast (DPC)
   - Fourier Ptychographic Microscopy (FPM)
   - Darkfield

**Condenser lens sub-options (shown for both):**
- Abbe condenser
- Aspherical lens D=25mm
- Aspherical lens D=8mm (for Phase Contrast)

**Brightfield mode selection (if Complex Setup):**
- Brightfield Only
- Phase Contrast
- Darkfield
- Polarization (note: may need camera verification)

**Files to modify:**
- `src/components/frameWizard/LightSourceStep.tsx` - complete rewrite
- `src/types/frameWizard.ts` - update `LightSourceChoice`, add condenser/mode types
- `src/stores/frameWizardStore.ts` - update illumination state

**Instructions for Claude Code:**
```
Rewrite LightSourceStep.tsx for the new illumination design.

Update types in frameWizard.ts:
- LightSourceChoice = 'single-led' | 'complex-setup' (remove 'led-matrix', 'led-ring', 'none')
- Add CondenserChoice = 'abbe' | 'aspherical-25' | 'aspherical-8-ph'
- Add BrightfieldMode = 'bf-only' | 'phase-contrast' | 'darkfield' | 'polarization'
- Add to FrameWizardState: condenser, brightfieldModes (array)

UI layout:
1. Two main cards: "Single LED + Condenser" vs "Complex Setup (LED + RGB Ring Array)"
2. Below: condenser lens dropdown/cards (always shown)
3. If Complex Setup selected: show brightfield mode checkboxes (multi-select)
4. Add description text explaining what the Complex Setup enables (DPC, FPM, etc.)

Update store price calculations for the new options.
```

---

## WP5: Update Camera Step with Real Hardware

**Goal:** Reduce cameras to 3 real models with proper recommendations and Nyquist info.

**Real cameras:**

| Model | Sensor | Pixel Size | Notes |
|-------|--------|-----------|-------|
| HIK-MVCS060 | IMX174 | 3.45 um | Good general purpose |
| Tucson Libra16 | - | 3.76 um | Superior quantum efficiency |
| HIK-MVCA023 | IMX249 | 5.86 um | Larger pixels, good for low light |

**Requirements:**
- Provide application-specific recommendations (e.g., "Best for fluorescence: Tucson Libra16")
- Show Nyquist sampling calculation: `d = lambda/(2*NA) * 2 * Magnification < pixelSize`
- Link to datasheets
- Highlight Tucson for superior quantum efficiency

**Files to modify:**
- `public/configurator/cameras_library.csv` - replace with 3 real cameras
- `src/components/frameWizard/CameraStep.tsx` - add recommendations, Nyquist display

**Instructions for Claude Code:**
```
Replace cameras_library.csv with exactly 3 cameras:
1. HIK-MVCS060 (IMX174, 3.45um pixel)
2. Tucson Libra16 (3.76um pixel, high QE)
3. HIK-MVCA023 (IMX249, 5.86um pixel)

Update CameraStep.tsx:
- Remove manufacturer filter (only 2 manufacturers now)
- Add a recommendation section: cards/chips showing which camera is best for which application
- Show live Nyquist calculation based on selected objective: d = lambda/(2*NA) * 2 * Mag_objective vs pixel_size
- Green/red indicator: "Nyquist criterion met/not met" for the selected combo
- Highlight the Tucson Libra16 with a chip "Best Quantum Efficiency"
- Add placeholder docsUrl links for each camera
```

---

## WP6: Update Fluorescence Step

**Goal:** Restructure fluorescence to show practical Ex/Em info with light source options.

**Light source options for fluorescence:**
- **Laser (openUC2@Boison):** Single Color (405/488/532/638), Dual Color (488/638), Quad Color (405/488/532/638)
- **LED (openUC2):** Single Color (390/480/530/640), Quad Color liquid light guide (Kayja Optics, 390/480/530/640)

**Dichroic mirror options:**
- Single channel (CN)
- Dual channel (CN)
- Multi channel (AHF)

**Fluorophore presentation:**
- Instead of listing ideal wavelengths, show Ex and Em wavelengths with corresponding fluorophore names
- Consider adding Cy7 in the future (note in code comment)

**Files to modify:**
- `public/configurator/fluorescence_library.csv` - update with real data
- `src/components/frameWizard/FluorescenceStep.tsx` - restructure UI
- `src/types/frameWizard.ts` - add light source and dichroic types for fluorescence

**Instructions for Claude Code:**
```
Restructure the Fluorescence step into 3 sub-sections:

1. Fluorescence Light Source selection:
   - Laser options: Single/Dual/Quad from openUC2@Boison
   - LED options: Single/Quad from openUC2
   Show available wavelengths for each option.

2. Dichroic Mirror selection:
   - Single channel (CN), Dual channel (CN), Multi channel (AHF)

3. Fluorophore/Channel configuration:
   - Show table with columns: Fluorophore Name, Ex wavelength, Em wavelength, Color indicator
   - Users check which channels they need
   - Available channels should be filtered based on the light source selected above
   - Present as Ex/Em pairs with fluorophore names, not abstract wavelength ranges

Add new types to frameWizard.ts:
- FluoLightSource = 'laser-single' | 'laser-dual' | 'laser-quad' | 'led-single' | 'led-quad'
- DichroicChoice = 'single-cn' | 'dual-cn' | 'multi-ahf'
- Add these fields to FrameWizardState

Update fluorescence_library.csv with real fluorophore data including Ex/Em peaks.
```

---

## WP7: Update Sample Holders Step

**Goal:** Expand sample holder options to match real offerings.

**Options:**
1. **Microscope Slide** - standard glass slide holder
2. **Microtiter Plate (MTP)** - wellplate holder
3. **Petri Dish Holder** - for cell culture dishes
4. **Custom (3D Printed)** - with a text field for user to describe their requirements

**Files to modify:**
- `src/components/frameWizard/SampleHolderStep.tsx` - add new options
- `src/types/frameWizard.ts` - update `SampleHolderChoice`

**Instructions for Claude Code:**
```
Update SampleHolderStep.tsx with 4 options:

1. "Microscope Slide" - standard glass slide holder for histology, pathology
2. "Microtiter Plate (MTP)" - for wellplate-based assays, screening
3. "Petri Dish Holder" - for live cell culture in Petri dishes
4. "Custom (3D Printed)" - user specifies needs in a text field

Update SampleHolderChoice type to: 'none' | 'microscope-slide' | 'mtp' | 'petri-dish' | 'custom-3d'

When 'custom-3d' is selected, show a TextField below asking:
"Describe your sample holder requirements (dimensions, material, special features)"
Store the value in wizardState.customSampleHolderNotes (add to FrameWizardState).

Use the same card-based layout as the current step.
```

---

## WP8: Summary Step with Quote Request & JSON Export

**Goal:** Replace the "Custom" step with a proper summary that includes quote request via email and JSON export.

**Requirements:**
- Show full configuration summary
- Add fields: "Field of Application", "Special requirements / needs / wishes"
- "Request Quote" button: opens mailto with exported configuration details
- "Export JSON" button: downloads configuration as JSON including all selections and comments
- Keep "Open in Editor" button

**Files to modify:**
- `src/components/frameWizard/CustomizationStep.tsx` - rewrite as SummaryStep
- `src/stores/frameWizardStore.ts` - add export/mailto logic

**Instructions for Claude Code:**
```
Rewrite CustomizationStep.tsx as SummaryQuoteStep.tsx.

Layout:
1. Configuration summary table (all selected modules, prices)
2. Nyquist check result if objective + camera selected
3. Two new TextFields:
   - "Field of Application" (e.g., "Cell biology", "Materials science")
   - "Special Requirements / Needs / Wishes" (multiline)
4. Three action buttons:
   - "Request Quote" - opens mailto:info@openuc2.com with subject "FRAME Configuration Quote Request"
     and body containing the full config summary, application field, and special requirements as text
   - "Export Configuration (JSON)" - downloads a .json file with all wizard state, selected components,
     prices, application field, special requirements, and timestamp
   - "Open in Editor" (existing functionality)

Add fieldOfApplication and specialRequirements to FrameWizardState.
Store customNotes, fieldOfApplication, specialRequirements in the JSON export.
```

---

## WP9: Preconfigured System Presets

**Goal:** Allow users to load preconfigured microscope setups that pre-fill the wizard.

**Example presets:**
- "GFP + SiR High Resolution" - specific objective, fluorescence channels, camera preset
- "Basic Brightfield" - simple LED + low-rank objective + basic camera
- "Phase Contrast Setup" - complex illumination + phase contrast objectives

**Implementation:**
- JSON preset files in `public/configurator/presets/`
- Each preset defines: name, description, image, and the complete `FrameWizardState` values
- A "Load Preset" button/dialog at the top of the wizard or as an initial step

**Files to create/modify:**
- `public/configurator/presets/` - directory with preset JSON files
- `public/configurator/presets/index.json` - manifest listing all presets
- `src/components/frameWizard/PresetSelector.tsx` - new component
- `src/components/FrameWizardPage.tsx` - add preset selector UI

**Instructions for Claude Code:**
```
Create a preset system for the FRAME wizard.

1. Create public/configurator/presets/index.json with an array of preset entries:
   [{ "id": "gfp-sir-highres", "name": "GFP + SiR High Resolution", "description": "...",
      "image": "/configurator/presets/gfp-sir-highres.png", "file": "gfp-sir-highres.json" }, ...]

2. Create 2-3 example preset JSON files that contain partial FrameWizardState objects
   (the values to pre-fill). Example: gfp-sir-highres.json, basic-brightfield.json

3. Create PresetSelector.tsx component:
   - Fetches presets/index.json on mount
   - Shows a grid of cards with preset name, description, thumbnail
   - On click: loads the preset JSON, calls updateWizardState with the preset values
   - Close dialog after loading

4. Add a "Load Preset" button in the FrameWizardPage header (next to Reset)
   that opens the PresetSelector as a dialog/modal.

5. Add loadPreset action to frameWizardStore that applies a partial state.
```

---

## WP10: Module Description Files & Representative Images

**Goal:** Create per-module description files with representative images.

**Implementation:**
- One markdown or JSON file per module in `public/configurator/modules/`
- Each file contains: module name, description text, representative image path, specs
- The image is a placeholder PNG that shows what this module produces (e.g., DPC LED shows a DPC image)
- When a module is selected in the wizard, show its description and image in the bottom/detail area

**Files to create/modify:**
- `public/configurator/modules/` - directory with per-module files
- `public/configurator/module-images/` - placeholder PNGs for representative images
- `src/components/frameWizard/ModuleDetail.tsx` - new component to render module info
- Various step components - add ModuleDetail display when a module is selected

**Instructions for Claude Code:**
```
1. Create public/configurator/modules/ directory with JSON description files:
   Each file: { "id": "...", "name": "...", "description": "...",
                "representativeImage": "/configurator/module-images/xxx.png",
                "specs": { ... }, "docsUrl": "..." }

   Create files for key modules:
   - led-ring-array.json (LED Ring Array for DPC/phase contrast)
   - abbe-condenser.json, aspherical-condenser-25.json, aspherical-condenser-8-ph.json
   - Each objective category (one file per category)
   - Each camera model
   - Each laser/LED option
   - Each sample holder

2. Create placeholder PNGs (simple colored rectangles with text overlay, 400x300px)
   in public/configurator/module-images/ for each module.
   Use a simple canvas-based script or just create minimal placeholder images.

3. Create ModuleDetail.tsx component:
   - Props: moduleId
   - Fetches the module JSON
   - Renders: image, description, specs table
   - Shows below the selection UI in each step

4. Integrate ModuleDetail into step components:
   When a user selects/hovers a module, show its detail panel below the options.
```

---

## WP11: Update CSV Data Files

**Goal:** Ensure all CSV library files match the real hardware exactly.

**Files to update:**
- `public/configurator/objectives_library.csv` - from WP3
- `public/configurator/cameras_library.csv` - from WP5
- `public/configurator/fluorescence_library.csv` - from WP6
- `public/configurator/lenses_library.csv` - reduce to the 3 tube lens variants (or remove if tube lens is fixed)

**Tube lens variants (if kept as reference data):**
- F=180mm D=22mm (budget)
- F=180mm D=38mm (high quality)
- F=200mm D=38mm (high quality, for Nikon correction)

**Instructions for Claude Code:**
```
Update all CSV library files in public/configurator/ to match the real hardware.

objectives_library.csv columns:
id;name;manufacturer;magnification;na;workingDistance_mm;focalLength_mm;immersion;threadType;parfocalDistance_mm;fieldNumber_mm;correctionType;category;price;thumbnail;docsUrl

Add the 11 real objectives from the hardware table with category field:
- Special: 20x/0.75
- High Rank Soptop: 4x/0.1, 10x/0.3, 20x/0.4, 40x/0.65
- Low Rank: 4x/0.1, 10x/0.25, 20x/0.35
- Phase Contrast: 4x/0.13, 10x/0.25, 20x/0.4

cameras_library.csv: 3 cameras (HIK-MVCS060, Tucson Libra16, HIK-MVCA023)
fluorescence_library.csv: real fluorophore data with proper Ex/Em values
lenses_library.csv: 3 tube lens variants (for reference, even if not user-selectable)
```

---

## Suggested Implementation Order

| Phase | Work Packages | Rationale |
|-------|--------------|-----------|
| **Phase 1 - Structure** | WP1, WP2 | Get the tab order and navigation right first |
| **Phase 2 - Core Steps** | WP3, WP4, WP5 | Update the main selection steps with real data |
| **Phase 3 - Specialized Steps** | WP6, WP7 | Fluorescence and sample holders |
| **Phase 4 - Output** | WP8 | Summary, quote request, JSON export |
| **Phase 5 - Enhancements** | WP9, WP10, WP11 | Presets, module descriptions, CSV cleanup |

Each WP can be implemented in a single Claude Code session by pasting the
"Instructions for Claude Code" block. Review and test after each WP before proceeding.

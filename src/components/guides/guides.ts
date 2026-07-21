/**
 * Guided walkthroughs of the KiCad-for-optics flows (WP-27). Each guide is a
 * short, ordered step list with an optional deep link to the page it happens
 * on — robust across routes (unlike an element-anchored overlay tour, which
 * only works when its targets are mounted). The "author a part record" guide
 * is the step-by-step model-authoring walkthrough the plan calls for.
 */

export interface GuideStep {
  title: string;
  body: string;
  /** Route this step happens on — the dialog offers a "go there" button. */
  goto?: string;
}

export interface Guide {
  id: string;
  title: string;
  blurb: string;
  /** The page the guide starts on (deep-linked from the first step). */
  startRoute: string;
  steps: GuideStep[];
}

export const GUIDES: Guide[] = [
  {
    id: 'beam-path',
    title: 'Design a beam path',
    blurb: 'Place parts on the schematic, chain them into an optical path, then check and simulate.',
    startRoute: '/configurator/schematic',
    steps: [
      {
        title: 'Open the schematic',
        body: 'The schematic is the primary editor — optical parts drawn as symbols on a working plane. The left sidebar is the parts palette (one database, from the registry).',
        goto: '/configurator/schematic',
      },
      {
        title: 'Place a source and a mirror',
        body: 'Drag a source (e.g. a laser cube) and a mirror onto the canvas, or double-tap a palette tile. Each part carries its record’s ports and glyph — a 45° mirror already folds the beam.',
      },
      {
        title: 'Chain the ports',
        body: 'Click the source’s exit pin, then the next part’s entry pin, to build a beam path. Press Enter to finish, Esc to cancel. Auto-chaining also runs when you Check with no path declared.',
      },
      {
        title: 'Check & simulate',
        body: 'In the right panel’s optikit-core service section, Check validates the design (ports, DRC) and Simulate traces the rays through the real optics — the authoritative result, not just the 2D preview.',
      },
      {
        title: 'Optimize (optional)',
        body: 'Optimize adjusts ranged DOFs (e.g. a lens focus dz) to minimize the spot; accepted deltas write back into the document, and a T2 part’s changes download as optikit-fx.json for the Inventor machine.',
      },
    ],
  },
  {
    id: 'author-record',
    title: 'Author a part record (model authoring)',
    blurb: 'Create a new library part end to end: the optical symbol, then save it into the shared database.',
    startRoute: '/configurator/components',
    steps: [
      {
        title: 'Open the component editor',
        body: 'Components is where a part’s two halves are authored: the optics (the symbol) and the mechanics (the STP footprint + datums). The left sidebar browses the library (published records) and your drafts.',
        goto: '/configurator/components',
      },
      {
        title: 'Start a new record',
        body: 'Click “new”, pick a category (lens / mirror / source / detector / …), and set the namespace + name — the id becomes user.<category>.<name>. Clicking a published record instead opens an editable copy.',
      },
      {
        title: 'Describe the optics',
        body: 'On the “optics” tab add the fragment surfaces (radius / thickness / material / semi-aperture / reflective), the datum frames (z along the optical axis), and the ports (beam entry/exit). The schematic glyph and ray sketch preview update live.',
      },
      {
        title: 'Bind the mechanics (optional)',
        body: 'On the “mechanics” tab load the STP/GLB. For a whole cube module toggle “whole module”, hit “fit to cube”, then place the optical primitive on its face — move it, or rotate it (15° snap) and type exact pitch/roll/yaw. verify-t1 checks the disc sits on the physical face.',
      },
      {
        title: 'Save into the database',
        body: '“Save to workspace library” keeps a browser-local draft; “Write into ../optikit-core/library” is the dev fast path (it appears in the palette immediately); “Download record pair” makes a git-PR zip. The part now lives alongside every other — one database.',
      },
    ],
  },
  {
    id: 'assemble-sync',
    title: 'Assemble & keep in sync',
    blurb: 'Turn the schematic into a 3D cube assembly and keep the two sides in agreement.',
    startRoute: '/configurator/assembly',
    steps: [
      {
        title: 'Open the assembly',
        body: 'The assembly renders the cubes in 3D (this is where “View 3D” lives now). Selecting an insert names the optical component it realizes and links to the component editor.',
        goto: '/configurator/assembly',
      },
      {
        title: 'Update from the schematic',
        body: 'The sync chip in the toolbar shows whether the schematic and assembly agree. “Update assembly from schematic” re-cubifies; the review lists only the parts that changed.',
      },
      {
        title: 'Back-annotate',
        body: 'If you change DOF values on the assembly side, “Back-annotate to schematic” writes them into the source design’s dof_values — never automatic, always reviewed.',
      },
    ],
  },
];

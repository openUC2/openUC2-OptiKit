
WP-88 — Sequential beam-path scripting (Phase 4, with WP-78). A small Optiland/PyOpticL-style DSL that builds the circuit line by line and stays two-way in sync with the canvas — the inverse authoring direction to chain inference.

### WP-88 — Script the beam path: a sequential authoring mode

```
PROMPT (repo: openUC2-OptiKit, thin core support)

Optiland let you BUILD a system in code, sequentially — add a
source, then a lens 40 mm downstream, then a mirror. Offer the same for the
schematic: a text/script pane that authors the design programmatically, as
an alternative to dragging.

1. A small, safe DSL (NOT arbitrary JS): line-oriented commands mirroring the
   Optiland vocabulary — `source 488nm`, `lens f=50 @ +40mm`,
   `mirror 45deg @ +30mm turn=up`, `detector @ +50mm`. Each line places a
   part relative to the previous element along the beam (the WP-88 constraint
   is the {distance | x | y | z} + turn vocabulary PyOpticL uses), resolved to
   grid cells + intra-cube residual by the same placement path drag uses.
2. The script is a VIEW of the document, two-way: editing the script re-lays
   the parts; dragging a part updates the script (round-trips through the
   .dsn like everything else). A parse error is a marker, not a crash.
3. It composes with the library: `place openuc2.cube.mirror_1x1 @ +30mm`
   drops a real catalog cube; `lens f=50` synthesizes an unbound primitive
   (WP-60) the way the palette lens does.
4. Reference the OpticsChainer relationship in the docs: this is the INVERSE
   authoring direction to chain inference — the user writes the sequence and
   the geometry follows, where inference reads the geometry and proposes the
   sequence. Same netlist model underneath.

Acceptance: a five-line script (source, filter, dichroic, objective, camera)
lays out the fluo-scope excitation arm; dragging the objective updates its
`@ +Nmm` in the script; a syntax error shows a marker and the rest still
lays out.
```

**For humans:** for people who think in code (and to paste a setup from a paper
or an Optiland notebook), a little scripting language that builds the optical
circuit line by line — and stays in sync when you drag things around.

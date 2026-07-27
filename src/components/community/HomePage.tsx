/**
 * Landing (design Screen 01 — "Show the artefact, not a promise"): the dark
 * hero with the two doors, REAL platform numbers (registry modules, gallery
 * designs — never invented stats), the three-step flow, and the import
 * bridge. Adapted from the OptiKit Platform design onto the live routes.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { C, FONT, kickerSx } from './communityTheme';
import { useCommunityRepos } from '../../model/communityRepos';
import { fetchGallery, type GalleryDesign } from './designData';
import { useLibraryIndex } from '../../model/libraryIndex';

const FLOW = [
  {
    n: '01 · SCHEMATIC',
    title: 'Think in optics',
    body: 'Sources, lenses, filters, detectors on a grid. Beam paths are nets; optical checks play the role of DRC.',
    route: '/configurator/schematic',
  },
  {
    n: '02 · LAYOUT',
    title: 'Snap into cubes',
    body: 'Every symbol resolves to a real 50 mm module with a part number. Drag on the baseplate; the schematic back-annotates.',
    route: '/configurator/assembly',
  },
  {
    n: '03 · KIT',
    title: 'Build or order',
    body: 'Export the release bundle — BOM, printable housings, optics list — or print everything yourself for free.',
    route: '/configurator/schematic',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const index = useLibraryIndex();
  const [designs, setDesigns] = useState<GalleryDesign[]>([]);
  // WP-58: mounted community repos contribute their designs to the gallery.
  const repos = useCommunityRepos(s => s.repos);
  useEffect(() => {
    fetchGallery(repos).then(setDesigns).catch(() => setDesigns([]));
  }, [repos]);

  const moduleCount = index.modules.length;
  const groupCount = index.groups.length;

  return (
    <Box sx={{ minHeight: '100%', bgcolor: C.paper, overflow: 'auto' }}>
      {/* ── hero ── */}
      <Box sx={{ bgcolor: C.ink, color: C.textOnInk, pb: 10 }}>
        <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 } }}>
          <Typography sx={kickerSx}>Open hardware · CC-BY-SA · 50 mm cubes</Typography>
          <Typography
            sx={{
              fontFamily: FONT.display, fontWeight: 700, lineHeight: 1.05,
              fontSize: { xs: 40, md: 64 }, mt: 2, color: '#FFFFFF',
            }}
          >
            Draw the light path.
            <Box component="span" sx={{ display: 'block', color: C.teal }}>
              Get the microscope.
            </Box>
          </Typography>
          <Typography sx={{ fontFamily: FONT.body, color: C.mutedOnInk, maxWidth: 560, mt: 3, fontSize: 18 }}>
            A schematic-first configurator and a community library for modular
            optics — KiCad's rigour for 50 mm cubes. Everything downstream —
            cubes, BOM, 3D — is derived from the schematic.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 5 }}>
            <Button
              size="large"
              onClick={() => navigate('/configurator/schematic')}
              sx={{
                bgcolor: C.teal, color: C.ink, fontFamily: FONT.display, fontWeight: 700,
                px: 4, '&:hover': { bgcolor: C.tealBright },
              }}
            >
              Start a schematic
            </Button>
            <Button
              size="large"
              onClick={() => navigate('/configurator/explore')}
              sx={{
                color: C.textOnInk, border: `1px solid ${C.inkBorder}`, px: 4,
                fontFamily: FONT.display, fontWeight: 600,
                '&:hover': { borderColor: C.teal, color: C.teal },
              }}
            >
              Explore community builds
            </Button>
          </Stack>

          {/* real numbers only — the registry and the gallery are the proof */}
          <Stack direction="row" spacing={6} sx={{ mt: 8, flexWrap: 'wrap', rowGap: 3 }}>
            {[
              [designs.length, 'community designs in the gallery'],
              [moduleCount, 'cube modules in the registry'],
              // groups appear once the registry serves them (index ≥ WP-44)
              ...(groupCount > 0 ? [[groupCount, 'optical-module groups (OPM)']] : []),
            ].map(([v, label]) => (
              <Box key={String(label)}>
                <Typography sx={{ fontFamily: FONT.display, fontSize: 40, fontWeight: 700, color: C.teal }}>
                  {String(v)}
                </Typography>
                <Typography sx={{ fontFamily: FONT.mono, fontSize: 12, color: C.mutedOnInk }}>
                  {String(label)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── the flow ── */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography sx={kickerSx}>The flow</Typography>
        <Typography sx={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: C.text, mt: 1 }}>
          Two tabs, one source of truth
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ mt: 4 }}>
          {FLOW.map(step => (
            <Box
              key={step.n}
              onClick={() => navigate(step.route)}
              sx={{
                flex: 1, p: 3, bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}`,
                borderRadius: 2, cursor: 'pointer', transition: 'border-color .15s',
                '&:hover': { borderColor: C.teal },
              }}
            >
              <Typography sx={{ ...kickerSx, color: C.tealDark }}>{step.n}</Typography>
              <Typography sx={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 20, color: C.text, mt: 1 }}>
                {step.title}
              </Typography>
              <Typography sx={{ fontFamily: FONT.body, color: C.muted, mt: 1, fontSize: 14 }}>
                {step.body}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Container>

      {/* ── buildable this week ── */}
      <Box sx={{ bgcolor: C.tealWash, py: 8 }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="baseline" justifyContent="space-between">
            <Box>
              <Typography sx={kickerSx}>Community</Typography>
              <Typography sx={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: C.text, mt: 1 }}>
                Buildable this week
              </Typography>
            </Box>
            <Button onClick={() => navigate('/configurator/explore')} sx={{ color: C.tealDark, fontFamily: FONT.display, fontWeight: 700 }}>
              All designs →
            </Button>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} sx={{ mt: 4 }}>
            {designs.slice(0, 3).map(d => (
              <Box
                key={d.id}
                onClick={() => navigate(`/configurator/design/${d.id}`)}
                sx={{
                  flex: 1, bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}`, borderRadius: 2,
                  p: 3, cursor: 'pointer', '&:hover': { borderColor: C.teal },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label="BUILDABLE" size="small"
                    sx={{ bgcolor: C.tealWash, color: C.tealDark, fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, height: 20 }} />
                  <Typography sx={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>
                    {d.parts} parts · {d.category}
                  </Typography>
                </Stack>
                <Typography sx={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, color: C.text, mt: 1.5 }}>
                  {d.name}
                </Typography>
                <Typography sx={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, mt: 0.5 }} noWrap>
                  {d.description}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* ── import bridge ── */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography sx={kickerSx}>Coming from electronics?</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <Chip label=".dsn / share link — open an existing build" onClick={() => navigate('/configurator/explore')}
            sx={{ fontFamily: FONT.mono, bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}` }} />
          <Chip label=".kicad_sch import — planned" disabled sx={{ fontFamily: FONT.mono }} />
          <Chip label="OSHWLab board attach — planned" disabled sx={{ fontFamily: FONT.mono }} />
        </Stack>
        <Typography sx={{ fontFamily: FONT.body, fontSize: 12, color: C.faint, mt: 2 }}>
          Community designs are CC-BY-SA; publishing runs through the openUC2
          Store repository. A share of every kit supports the creators.
        </Typography>
      </Container>
    </Box>
  );
}

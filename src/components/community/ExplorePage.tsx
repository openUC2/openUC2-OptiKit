/**
 * Explore (design Screen 02 — "Browse by what you want to see"): optical
 * filters over the gallery, cost/effort up front, badges that matter.
 * `.dsn` designs are first-class (BUILDABLE — they open in the editor);
 * the legacy JSON corpus stays reachable through the old Setup Browser
 * until WP-54's converter has walked the whole Store repo.
 */

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Container, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { C, FONT, kickerSx } from './communityTheme';
import { useCommunityRepos } from '../../model/communityRepos';
import { fetchGallery, type GalleryDesign } from './designData';

type SortKey = 'name' | 'parts';

export function ExplorePage() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<GalleryDesign[]>([]);
  // WP-58: mounted community repos contribute their designs to the gallery.
  const repos = useCommunityRepos(s => s.repos);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('name');

  useEffect(() => {
    fetchGallery(repos).then(setDesigns).catch(() => setDesigns([]));
  }, [repos]);

  const categories = useMemo(
    () => [...new Set(designs.map(d => d.category))].sort(),
    [designs],
  );
  const visible = useMemo(() => {
    const filtered = category ? designs.filter(d => d.category === category) : designs;
    return [...filtered].sort((a, b) =>
      sort === 'parts' ? b.parts - a.parts : a.name.localeCompare(b.name),
    );
  }, [designs, category, sort]);

  return (
    <Box sx={{ minHeight: '100%', bgcolor: C.paper, overflow: 'auto' }}>
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Typography sx={kickerSx}>Explore</Typography>
        <Typography sx={{ fontFamily: FONT.display, fontSize: 36, fontWeight: 700, color: C.text, mt: 1 }}>
          Community builds
        </Typography>
        <Typography sx={{ fontFamily: FONT.mono, fontSize: 13, color: C.faint, mt: 1 }}>
          {designs.length} design{designs.length === 1 ? '' : 's'} · {designs.length} buildable now
        </Typography>

        {/* filters + sort */}
        <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            label="All" onClick={() => setCategory(null)}
            sx={{
              fontFamily: FONT.mono,
              bgcolor: category === null ? C.teal : '#FFFFFF',
              color: category === null ? C.ink : C.muted,
              border: `1px solid ${category === null ? C.teal : C.paperEdge}`,
            }}
          />
          {categories.map(c => (
            <Chip
              key={c} label={c} onClick={() => setCategory(category === c ? null : c)}
              sx={{
                fontFamily: FONT.mono,
                bgcolor: category === c ? C.teal : '#FFFFFF',
                color: category === c ? C.ink : C.muted,
                border: `1px solid ${category === c ? C.teal : C.paperEdge}`,
              }}
            />
          ))}
          <Box sx={{ flex: 1 }} />
          {(['name', 'parts'] as SortKey[]).map(k => (
            <Chip
              key={k} label={k === 'name' ? 'A–Z' : 'Most cubes'} onClick={() => setSort(k)}
              variant={sort === k ? 'filled' : 'outlined'}
              sx={{ fontFamily: FONT.mono, ...(sort === k && { bgcolor: C.inkRaised, color: C.textOnInk }) }}
            />
          ))}
        </Stack>

        {/* cards */}
        <Box
          sx={{
            display: 'grid', gap: 2.5, mt: 4,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          }}
        >
          {visible.map(d => (
            <Box
              key={d.id}
              onClick={() => navigate(`/configurator/design/${d.id}`)}
              sx={{
                bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}`, borderRadius: 2,
                overflow: 'hidden', cursor: 'pointer', transition: 'border-color .15s',
                '&:hover': { borderColor: C.teal },
              }}
            >
              {/* schematic-strip placeholder: a beam line across the card head */}
              <Box sx={{ bgcolor: C.ink, height: 84, position: 'relative' }}>
                <Box sx={{
                  position: 'absolute', left: 16, right: 16, top: '50%',
                  borderTop: `2px solid ${C.teal}`, boxShadow: `0 0 12px ${C.teal}`,
                }} />
                <Typography sx={{
                  position: 'absolute', bottom: 6, left: 12,
                  fontFamily: FONT.mono, fontSize: 10, color: C.mutedOnInk,
                }}>
                  {d.id}.dsn
                </Typography>
              </Box>
              <Box sx={{ p: 2.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label="BUILDABLE" size="small"
                    sx={{ bgcolor: C.tealWash, color: C.tealDark, fontFamily: FONT.mono, fontSize: 10, fontWeight: 700, height: 20 }} />
                  <Typography sx={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>
                    {d.parts} parts · {d.category}
                  </Typography>
                </Stack>
                <Typography sx={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, color: C.text, mt: 1 }}>
                  {d.name}
                </Typography>
                <Typography sx={{
                  fontFamily: FONT.body, fontSize: 13, color: C.muted, mt: 0.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {d.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* legacy corpus door */}
        <Box sx={{ mt: 6, p: 3, bgcolor: '#FFFFFF', border: `1px dashed ${C.paperEdge}`, borderRadius: 2 }}>
          <Typography sx={{ fontFamily: FONT.display, fontWeight: 700, color: C.text }}>
            Looking for the older setups?
          </Typography>
          <Typography sx={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, mt: 0.5 }}>
            The legacy JSON corpus lives in the classic Setup Browser while the
            `.dsn` conversion walks the whole Store repository.
          </Typography>
          <Button onClick={() => navigate('/configurator/setups')}
            sx={{ mt: 1.5, color: C.tealDark, fontFamily: FONT.display, fontWeight: 700 }}>
            Open the classic Setup Browser →
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

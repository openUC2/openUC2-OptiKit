/**
 * Design page (design Screen 03 — "a repo and a product page in one"):
 * three verbs always in the same place (Star · Fork & edit · Order), the
 * artefact's facts from the REAL `.dsn` (version, tags, parts), and the BOM
 * as the moment of truth — every line joined to a registry record price;
 * unpriced lines say so instead of inventing numbers. The community-model
 * money copy stays quiet (science-first) until the A/B/C decision lands.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, Container, Divider, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { C, FONT, kickerSx } from './communityTheme';
import { bomOf, fetchDesign, fetchGallery, type GalleryDesign } from './designData';
import type { DesignDecl } from '../../model/dsn';
import { useLibraryIndex } from '../../model/libraryIndex';

const STORE_REPO = 'https://github.com/beniroquai/openUC2-OptiKit-Store';

export function DesignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const index = useLibraryIndex();
  const [meta, setMeta] = useState<GalleryDesign | null>(null);
  const [decl, setDecl] = useState<DesignDecl | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGallery()
      .then(designs => {
        const found = designs.find(d => d.id === id) ?? null;
        if (cancelled) return;
        setMeta(found);
        if (!found) throw new Error(`no design '${id}' in the gallery`);
        return fetchDesign(found.url);
      })
      .then(d => { if (!cancelled && d) setDecl(d); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [id]);

  const bom = useMemo(
    () => (decl ? bomOf(decl, index.modules) : null),
    [decl, index.modules],
  );

  const design = decl?.design;
  const forkUrl = meta ? `/configurator/schematic?design=${encodeURIComponent(meta.url)}` : '';

  return (
    <Box sx={{ minHeight: '100%', bgcolor: C.paper, overflow: 'auto' }}>
      <Container maxWidth="lg" sx={{ py: 5 }}>
        {/* breadcrumb */}
        <Typography sx={{ fontFamily: FONT.mono, fontSize: 12, color: C.faint }}>
          <Box component="span" sx={{ cursor: 'pointer', '&:hover': { color: C.tealDark } }}
            onClick={() => navigate('/configurator/explore')}>
            Explore
          </Box>
          {' / '}{meta?.category ?? '…'}{' / '}{meta?.name ?? id}
        </Typography>

        {error && (
          <Typography sx={{ mt: 4, color: '#B4232C', fontFamily: FONT.body }}>{error}</Typography>
        )}

        {meta && (
          <>
            {/* header: title + the three verbs */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}
              sx={{ mt: 2, alignItems: { md: 'flex-end' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontFamily: FONT.display, fontSize: 36, fontWeight: 700, color: C.text }}>
                  {meta.name}
                </Typography>
                <Typography sx={{ fontFamily: FONT.mono, fontSize: 12, color: C.faint, mt: 0.5 }}>
                  openUC2 community
                  {design?.version ? ` · v${design.version}` : ''} · CC-BY-SA 4.0
                </Typography>
              </Box>
              <Stack direction="row" spacing={1.5}>
                <Button href={STORE_REPO} target="_blank"
                  sx={{ border: `1px solid ${C.paperEdge}`, color: C.text, fontFamily: FONT.display, fontWeight: 600 }}>
                  ★ Star on GitHub
                </Button>
                <Button onClick={() => navigate(forkUrl)}
                  sx={{ bgcolor: C.teal, color: C.ink, fontFamily: FONT.display, fontWeight: 700, px: 3, '&:hover': { bgcolor: C.tealBright } }}>
                  ⑂ Fork & edit
                </Button>
                <Button href={meta.url} download={`${meta.id}.optikit-design.yml`}
                  sx={{ border: `1px solid ${C.paperEdge}`, color: C.text, fontFamily: FONT.display, fontWeight: 600 }}>
                  Download .dsn
                </Button>
              </Stack>
            </Stack>

            {/* what this build does */}
            <Box sx={{ mt: 4, p: 3, bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}`, borderRadius: 2 }}>
              <Typography sx={kickerSx}>What this build does</Typography>
              <Typography sx={{ fontFamily: FONT.body, color: C.muted, mt: 1 }}>
                {design?.description || meta.description}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
                {(design?.tags ?? []).map(t => (
                  <Chip key={t} label={t} size="small"
                    sx={{ fontFamily: FONT.mono, fontSize: 11, bgcolor: C.tealWash, color: C.tealDark }} />
                ))}
                <Chip label={`${bom?.totalParts ?? meta.parts} parts`} size="small"
                  sx={{ fontFamily: FONT.mono, fontSize: 11 }} />
              </Stack>
            </Box>

            {/* the BOM — the moment of truth */}
            <Box sx={{ mt: 3, p: 3, bgcolor: '#FFFFFF', border: `1px solid ${C.paperEdge}`, borderRadius: 2 }}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between">
                <Typography sx={kickerSx}>Bill of materials</Typography>
                {bom && bom.pricedTotal > 0 && (
                  <Typography sx={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 700, color: C.text }}>
                    €{bom.pricedTotal.toFixed(0)}
                    <Box component="span" sx={{ fontSize: 13, color: C.faint, fontFamily: FONT.mono, ml: 1 }}>
                      {bom.unpricedLines > 0 ? `+ ${bom.unpricedLines} unpriced line(s)` : 'registry prices'}
                    </Box>
                  </Typography>
                )}
              </Stack>
              {!bom && !error && (
                <Typography sx={{ fontFamily: FONT.body, color: C.faint, mt: 2 }}>loading…</Typography>
              )}
              {bom && (
                <Table size="small" sx={{ mt: 1 }}>
                  <TableHead>
                    <TableRow>
                      {['QTY', 'PART', 'CATEGORY', 'UNIT', 'TOTAL'].map(h => (
                        <TableCell key={h} sx={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bom.lines.map(line => (
                      <TableRow key={line.moduleId} hover>
                        <TableCell sx={{ fontFamily: FONT.mono }}>{line.qty}</TableCell>
                        <TableCell sx={{ fontFamily: FONT.body, fontWeight: 600, color: C.text }}>
                          {line.name}
                          <Typography component="span" sx={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint, ml: 1 }}>
                            {line.moduleId}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontFamily: FONT.mono, fontSize: 12 }}>{line.category}</TableCell>
                        <TableCell sx={{ fontFamily: FONT.mono, fontSize: 12 }}>
                          {line.unitPrice != null ? `€${line.unitPrice.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: FONT.mono, fontSize: 12 }}>
                          {line.unitPrice != null ? `€${(line.unitPrice * line.qty).toFixed(2)}` : 'unpriced'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontFamily: FONT.body, fontSize: 12, color: C.faint }}>
                Prices come straight from the record registry — one-click ordering
                through the openUC2 shop is on the roadmap (WP-59 Phase B). Print
                the housings yourself and the cube lines drop to €0.
              </Typography>
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
}

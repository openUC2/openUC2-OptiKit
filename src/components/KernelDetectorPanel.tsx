/**
 * KernelDetectorPanel — the first detector's readout in the SimulationPanel
 * (EMB-E): spot diagram from the f32 hit records, bin heatmap from the f64
 * result, and the hits/flux/centroid/OPL line.
 *
 * Rule 5 discipline: every NUMBER on screen comes from the parsed f64 result
 * (`kernel.detector.result`); the canvases are pictures. That is also why the
 * spot diagram has no per-hit hover tooltip — a hover value would surface f32
 * sample data as a number.
 *
 * Both plots draw on a fixed dark surface regardless of app theme: hit colors
 * are the kernel's linear-light wavelength colors (the ray renderer's map),
 * which are meaningful against dark; the heatmap is a single-hue sequential
 * ramp (magnitude), sqrt-compressed for display so dim cells stay visible.
 */

import React, { useEffect, useRef } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { useSimulationStore } from '../stores/simulationStore';
import type { KernelDetectorState } from '../stores/simulationStore';
import { decodeHits, detectorToCanvas, fluxRampCss, readoutLine } from '../kernel/detector';
import { linearToSrgb } from '../kernel/segments';

const PLOT_PX = 168;
const SURFACE = 'rgb(13,20,32)';
const GRID_LINE = 'rgba(148,163,184,0.25)';

function drawSpotDiagram(ctx: CanvasRenderingContext2D, detector: KernelDetectorState): void {
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, PLOT_PX, PLOT_PX);
  const hits = decodeHits(detector.hits);
  if (!hits) return;

  // Recessive center crosshair (u = 0 / v = 0).
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PLOT_PX / 2, 0);
  ctx.lineTo(PLOT_PX / 2, PLOT_PX);
  ctx.moveTo(0, PLOT_PX / 2);
  ctx.lineTo(PLOT_PX, PLOT_PX / 2);
  ctx.stroke();

  for (let i = 0; i < hits.count; i++) {
    const hit = hits.at(i);
    const [x, y] = detectorToCanvas(hit.u, hit.v, hits.halfW, hits.halfH, PLOT_PX);
    const r = Math.round(linearToSrgb(hit.r) * 255);
    const g = Math.round(linearToSrgb(hit.g) * 255);
    const b = Math.round(linearToSrgb(hit.b) * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeatmap(ctx: CanvasRenderingContext2D, detector: KernelDetectorState): void {
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, PLOT_PX, PLOT_PX);
  const { bins, incident } = detector.result;
  const [nu, nv] = bins;
  if (!nu || !nv || incident.length < nu * nv) return;
  let max = 0;
  for (const f of incident) if (f > max) max = f;
  if (max <= 0) return;

  const cw = PLOT_PX / nu;
  const ch = PLOT_PX / nv;
  for (let iv = 0; iv < nv; iv++) {
    for (let iu = 0; iu < nu; iu++) {
      const flux = incident[iv * nu + iu];
      if (flux <= 0) continue;
      // sqrt compression: display-only, keeps dim cells visible (the honest
      // magnitudes stay in the f64 result the readout line quotes).
      ctx.fillStyle = fluxRampCss(Math.sqrt(flux / max));
      // Row iv holds v from −halfH upward; canvas y is inverted (+v up).
      ctx.fillRect(iu * cw, PLOT_PX - (iv + 1) * ch, cw + 0.5, ch + 0.5);
    }
  }
}

export const KernelDetectorPanel: React.FC = () => {
  const engine = useSimulationStore(s => s.engine);
  const enabled = useSimulationStore(s => s.config.enabled);
  const detector = useSimulationStore(s => s.kernel.detector);
  const busy = useSimulationStore(s => s.kernel.busy);
  const spotRef = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!detector) return;
    const spot = spotRef.current?.getContext('2d');
    if (spot) drawSpotDiagram(spot, detector);
    const heat = heatRef.current?.getContext('2d');
    if (heat) drawHeatmap(heat, detector);
  }, [detector]);

  if (engine !== 'kernel' || !enabled || !detector) return null;

  const hits = decodeHits(detector.hits);
  const extent = hits ? `±${hits.halfW.toFixed(hits.halfW < 10 ? 1 : 0)} mm` : '';

  return (
    <Card data-testid="kernel-detector">
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="subtitle2">Detector</Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            mt: 0.5,
            flexWrap: 'wrap',
            opacity: busy ? 0.45 : 1,
          }}
        >
          <Box>
            <canvas
              ref={spotRef}
              width={PLOT_PX}
              height={PLOT_PX}
              style={{ borderRadius: 4, display: 'block' }}
              data-testid="kernel-detector-spot"
            />
            <Typography variant="caption" color="text.secondary">
              spot diagram · {extent}
            </Typography>
          </Box>
          <Box>
            <canvas
              ref={heatRef}
              width={PLOT_PX}
              height={PLOT_PX}
              style={{ borderRadius: 4, display: 'block' }}
              data-testid="kernel-detector-heatmap"
            />
            <Typography variant="caption" color="text.secondary">
              incident flux · {detector.result.bins[0]}×{detector.result.bins[1]} bins
            </Typography>
          </Box>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mt: 0.5 }}
          data-testid="kernel-detector-readout"
        >
          {readoutLine(detector.result)}
        </Typography>
      </CardContent>
    </Card>
  );
};

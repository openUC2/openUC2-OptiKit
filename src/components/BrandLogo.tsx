/**
 * The openUC2 logo slot (WP-24). Renders the brand logo PNG from
 * public/brand/ — `openuc2-logo-white.png` on dark surfaces (the guide's
 * white version: blue replaced by white) and `openuc2-logo.png` (full
 * colour) on light ones. To swap in the officially delivered assets, just
 * replace those two files; no code change needed.
 *
 * Brand-guide rules honoured here: never distort/rotate, keep the safety
 * zone (the height of a "C") — provided by the surrounding toolbar padding.
 */

import { Box } from '@mui/material';
import { brandAsset } from '../theme/tokens';

export function BrandLogo({
  variant = 'dark',
  height = 30,
}: {
  /** Surface the logo sits on: 'dark' → white version, 'light' → colour. */
  variant?: 'dark' | 'light';
  height?: number;
}) {
  return (
    <Box
      component="img"
      src={brandAsset(variant === 'dark' ? 'openuc2-logo-white.png' : 'openuc2-logo.png')}
      alt="openUC2"
      sx={{ height, width: 'auto', display: 'block', userSelect: 'none' }}
      draggable={false}
    />
  );
}

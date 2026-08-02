/**
 * WP-110 — the DOOR: "what do you have?", in the user's words.
 *
 * The old entry point was a bare "new" button into a form that assumed you
 * already knew what you were making. This dialog asks the one question the
 * user can actually answer, with one line of consequence under each choice.
 * The record-trio vocabulary ("component + template + module") appears only
 * as secondary text — taught by use, never assumed.
 *
 * Deliberately NOT asked here: "T1, T2 or T3?" (the user learns that from
 * the answer), "component, template or module?" (an output, not an input),
 * and "optics tab or mechanics tab?" (the split that made the editor feel
 * like it needed prior knowledge).
 */

import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import type { RoadId } from './wizardStore';

interface RoadRow {
  road: RoadId;
  headline: string;
  consequence: string;
  produces: string;
}

const ROAD_ROWS: RoadRow[] = [
  {
    road: 'numbers',
    headline: 'I know the optical numbers',
    consequence:
      'a lens, mirror or source from its prescription (Ø, radii, thickness…), placed in an openUC2 cube. Ends with a cube + insert.',
    produces: 'component + template + module',
  },
  {
    road: 'device',
    headline: 'I have a CAD file of a device',
    consequence:
      'a Thorlabs-style mount, a laser body, a camera: real mechanics, no cube yet. Ends with a part you can place freely.',
    produces: 'component + housing template',
  },
  {
    road: 'cube',
    headline: 'I have an Inventor cube',
    consequence:
      'the optic is already inside a printed/machined cube. Ends with a T1 module that renders its real mesh.',
    produces: 'component + template + module',
  },
];

export function NewPartDialog({
  open,
  onClose,
  onPickRoad,
  onVendorImport,
  onOptilandImport,
  onBlankForm,
}: {
  open: boolean;
  onClose: () => void;
  onPickRoad: (road: RoadId) => void;
  /** Routes to the EXISTING importer for .zmx / marker-stamped .glb. */
  onVendorImport: () => void;
  /** Routes to the EXISTING importer for a serialized Optiland system. */
  onOptilandImport: () => void;
  /** The expert escape: the bare tabs, exactly as before WP-110. */
  onBlankForm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New part — what do you have?</DialogTitle>
      <DialogContent sx={{ pb: 0.5 }}>
        <List disablePadding>
          {ROAD_ROWS.map(row => (
            <ListItemButton
              key={row.road}
              divider
              onClick={() => onPickRoad(row.road)}
              sx={{ alignItems: 'flex-start', py: 1.25 }}
            >
              <ListItemText
                primary={row.headline}
                secondary={
                  <>
                    {row.consequence}
                    <Chip
                      size="small"
                      variant="outlined"
                      label={row.produces}
                      component="span"
                      sx={{ display: 'inline-flex', ml: 0, mt: 0.5, height: 18, fontSize: 10 }}
                    />
                  </>
                }
                slotProps={{
                  primary: { sx: { fontWeight: 600 } },
                  secondary: { component: 'div', sx: { mt: 0.25 } },
                }}
              />
            </ListItemButton>
          ))}
          <ListItemButton
            divider
            onClick={() => {
              onClose();
              onVendorImport();
            }}
            sx={{ alignItems: 'flex-start', py: 1.25 }}
          >
            <ListItemText
              primary="I have a vendor file"
              secondary={
                <>
                  a Zemax <code>.zmx</code> prescription or a marker-stamped GLB — the existing
                  importers read them and propose the records for review.
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} component="span">
                    <Chip size="small" variant="outlined" label=".zmx / stamped .glb" component="span"
                      sx={{ height: 18, fontSize: 10 }} />
                    <Button
                      size="small"
                      component="span"
                      sx={{ py: 0, fontSize: 11 }}
                      onClick={e => {
                        e.stopPropagation();
                        onClose();
                        onOptilandImport();
                      }}
                    >
                      …or a serialized Optiland setup
                    </Button>
                  </Stack>
                </>
              }
              slotProps={{
                primary: { sx: { fontWeight: 600 } },
                secondary: { component: 'div', sx: { mt: 0.25 } },
              }}
            />
          </ListItemButton>
        </List>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Every road ends at the same three destinations: save to this browser · publish to
          ../optikit-core/library · download the YAML for a pull request. You can switch to the
          full editor from any step — the wizard is the way in, not the only way.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => { onClose(); onBlankForm(); }}>
          blank record (expert form)
        </Button>
        <Button size="small" onClick={onClose}>cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

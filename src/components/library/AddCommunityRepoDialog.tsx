/**
 * "Add library from GitHub" (WP-58): mount a fork of the community template
 * so its parts join the palette and its designs join the gallery.
 *
 * Read-only by construction — this fetches an index, it never writes to the
 * repo. Mounted parts can never override a curated `openuc2.*` id; the
 * dialog says so rather than leaving it as folklore.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon, GitHub as GitHubIcon } from '@mui/icons-material';
import {
  fetchRepoIndex,
  parseRepoUrl,
  useCommunityRepos,
  useMountedRepos,
} from '../../model/communityRepos';

const TEMPLATE_URL = 'https://github.com/openUC2/optikit-community-template';

export function AddCommunityRepoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const repos = useCommunityRepos(s => s.repos);
  const addRepo = useCommunityRepos(s => s.addRepo);
  const removeRepo = useCommunityRepos(s => s.removeRepo);
  const mounted = useMountedRepos();

  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const repo = parseRepoUrl(url, ref.trim() || 'main');
    if (!repo) {
      setError('that is not a GitHub repository URL (https://github.com/<owner>/<repo>)');
      return;
    }
    if (repos.some(r => r.url === repo.url)) {
      setError(`${repo.slug} is already mounted`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Fetch BEFORE mounting: a repo that cannot serve an index should fail
      // here with a reason, not sit broken in the list.
      const index = await fetchRepoIndex(repo);
      addRepo(repo);
      setUrl('');
      setError(null);
      void index;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GitHubIcon fontSize="small" />
        Add library from GitHub
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Mount a fork of the{' '}
          <a href={TEMPLATE_URL} target="_blank" rel="noreferrer">
            community template
          </a>
          . Its parts appear in the palette under the repo's badge and its
          designs in Browse Setups. Nothing is written back — this is read-only.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            fullWidth
            size="small"
            label="repository URL"
            placeholder="https://github.com/you/your-optikit-parts"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !busy) void add();
            }}
          />
          <TextField
            size="small"
            label="ref"
            sx={{ width: 110 }}
            value={ref}
            onChange={e => setRef(e.target.value)}
          />
          <Button variant="contained" onClick={() => void add()} disabled={busy || !url.trim()}>
            {busy ? 'checking…' : 'add'}
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          A mounted repo can add parts but never override a curated
          <code> openuc2.* </code> id — the curated record always wins, and a
          clash is reported in the palette.
        </Typography>

        {repos.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Mounted
            </Typography>
            <List dense>
              {repos.map(repo => {
                const state = mounted.find(m => m.url === repo.url);
                return (
                  <ListItem
                    key={repo.url}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => removeRepo(repo.url)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">{repo.slug}</Typography>
                          <Chip size="small" label={repo.ref} sx={{ height: 18, fontSize: 10 }} />
                        </Stack>
                      }
                      secondary={
                        state?.loading
                          ? 'loading…'
                          : state?.error
                            ? state.error
                            : `${state?.index?.modules?.length ?? 0} part(s)`
                      }
                      secondaryTypographyProps={{
                        color: state?.error ? 'error.main' : 'text.secondary',
                      }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>close</Button>
      </DialogActions>
    </Dialog>
  );
}

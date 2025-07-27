import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Fab
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

interface SetupMetadata {
  name: string;
  category: string;
  description: string;
  screenshot?: string;
  path: string;
  url: string;
}

export const SetupBrowser: React.FC = () => {
  const navigate = useNavigate();
  const { importFromUrl, exportData } = useAppStore();
  const [setups, setSetups] = useState<SetupMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    name: '',
    category: 'General',
    description: '',
    screenshot: ''
  });

  useEffect(() => {
    fetchSetups();
  }, []);

  const fetchSetups = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch from GitHub API first
      try {
        const apiUrl = 'https://api.github.com/repos/beniroquai/openUC2-OptiKit-Store/contents/setups';
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch setups: ${response.status}`);
        }

        const files = await response.json();
        const jsonFiles = files.filter((file: { name: string }) => file.name.endsWith('.json'));

        // Fetch metadata for each setup file
        const setupPromises = jsonFiles.map(async (file: { name: string; download_url: string; path: string }) => {
          try {
            const contentResponse = await fetch(file.download_url);
            if (!contentResponse.ok) {
              throw new Error(`Failed to fetch ${file.name}`);
            }
            
            const content = await contentResponse.json();
            
            return {
              name: content.name || file.name.replace('.json', ''),
              category: content.category || 'General',
              description: content.description || 'No description available',
              screenshot: content.screenshot,
              path: file.path,
              url: file.download_url
            } as SetupMetadata;
          } catch (error) {
            console.warn(`Failed to load metadata for ${file.name}:`, error);
            // Return basic metadata even if the file can't be parsed
            return {
              name: file.name.replace('.json', ''),
              category: 'General',
              description: 'Configuration file',
              path: file.path,
              url: file.download_url
            } as SetupMetadata;
          }
        });

        const setupsData = await Promise.all(setupPromises);
        setSetups(setupsData);
        return;
      } catch (githubError) {
        console.warn('GitHub API fetch failed, using sample data:', githubError);
      }

      // Fallback to sample data when GitHub API is not accessible (e.g., CORS issues)
      const sampleSetups: SetupMetadata[] = [
        {
          name: 'Simple Telescope',
          category: 'Astronomy',
          description: 'A basic refracting telescope setup using two positive lenses for astronomical observations. Perfect for viewing planets and lunar features.',
          path: 'setups/simple-telescope.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Simple Telescope',
            category: 'Astronomy',
            description: 'A basic refracting telescope setup',
            m: [
              { i: 'lens-1x1', p: [0, 0, 0], r: 0 },
              { i: 'lens-1x1', p: [200, 0, 0], r: 0 }
            ]
          }))
        },
        {
          name: 'Microscope Setup',
          category: 'Microscopy',
          description: 'A compound microscope configuration with LED illumination, objective lens, and camera for biological sample imaging.',
          path: 'setups/microscope.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Microscope Setup',
            category: 'Microscopy',
            description: 'A compound microscope configuration',
            m: [
              { i: 'led-470nm', p: [0, -100, 0], r: 0 },
              { i: 'lens-1x1', p: [0, 0, 0], r: 0 },
              { i: 'sampleholder-1x1', p: [50, 0, 0], r: 0 },
              { i: 'lens-1x1', p: [100, 0, 0], r: 0 },
              { i: 'camera-usb', p: [150, 0, 0], r: 0 }
            ]
          }))
        },
        {
          name: 'Laser Interferometer',
          category: 'Spectroscopy',
          description: 'A Michelson interferometer setup using a laser source, beamsplitter, two mirrors, and a photodiode detector for precision measurements.',
          path: 'setups/interferometer.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Laser Interferometer',
            category: 'Spectroscopy',
            description: 'A Michelson interferometer setup',
            m: [
              { i: 'laser-532nm', p: [0, 0, 0], r: 0 },
              { i: 'beamsplitter-1x1', p: [100, 0, 0], r: 0 },
              { i: 'mirror-1x1', p: [100, 100, 0], r: 0 },
              { i: 'mirror-1x1', p: [200, 0, 0], r: 0 },
              { i: 'photodiode', p: [50, 0, 0], r: 0 }
            ]
          }))
        },
        {
          name: 'Fluorescence Filter Cube',
          category: 'Imaging',
          description: 'A fluorescence imaging setup with excitation LED, dichroic mirror, emission filter, and camera for fluorescent sample imaging.',
          path: 'setups/fluorescence.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Fluorescence Filter Cube',
            category: 'Imaging',
            description: 'A fluorescence imaging setup',
            m: [
              { i: 'led-470nm', p: [0, -50, 0], r: 0 },
              { i: 'filter-dichroic', p: [50, 0, 0], r: 45 },
              { i: 'lens-1x1', p: [100, 0, 0], r: 0 },
              { i: 'sampleholder-1x1', p: [150, 0, 0], r: 0 },
              { i: 'filter-bandpass', p: [50, 50, 0], r: 0 },
              { i: 'camera-usb', p: [50, 100, 0], r: 0 }
            ]
          }))
        },
        {
          name: 'Beam Expander',
          category: 'Laser',
          description: 'A laser beam expansion system using two lenses to increase beam diameter while maintaining collimation for laser applications.',
          path: 'setups/beam-expander.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Beam Expander',
            category: 'Laser',
            description: 'A laser beam expansion system',
            m: [
              { i: 'laser-405nm', p: [0, 0, 0], r: 0 },
              { i: 'lens-1x1', p: [50, 0, 0], r: 0 },
              { i: 'lens-1x1', p: [150, 0, 0], r: 0 }
            ]
          }))
        },
        {
          name: 'Polarimetry Setup',
          category: 'General',
          description: 'A polarization analysis system with LED source, polarizers, sample holder, and photodiode for studying optical activity and birefringence.',
          path: 'setups/polarimetry.json',
          url: 'data:application/json;base64,' + btoa(JSON.stringify({
            name: 'Polarimetry Setup',
            category: 'General',
            description: 'A polarization analysis system',
            m: [
              { i: 'led-530nm', p: [0, 0, 0], r: 0 },
              { i: 'polfilter-1x1', p: [50, 0, 0], r: 0 },
              { i: 'sampleholder-1x1', p: [100, 0, 0], r: 0 },
              { i: 'polfilter-1x1', p: [150, 0, 0], r: 90 },
              { i: 'photodiode', p: [200, 0, 0], r: 0 }
            ]
          }))
        }
      ];

      // Simulate loading delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSetups(sampleSetups);
    } catch (error) {
      console.error('Error fetching setups:', error);
      setError('Failed to load setups. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupClick = async (setup: SetupMetadata) => {
    try {
      // Load the setup into the editor
      const success = await importFromUrl(setup.url);
      if (success) {
        // Navigate back to the editor
        navigate('/');
      } else {
        alert('Failed to load the setup. Please try again.');
      }
    } catch (error) {
      console.error('Error loading setup:', error);
      alert('Failed to load the setup. Please try again.');
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Microscopy': '#e74c3c',
      'Astronomy': '#3498db',
      'Spectroscopy': '#9b59b6',
      'Imaging': '#f39c12',
      'Laser': '#e67e22',
      'General': '#95a5a6'
    };
    return colors[category] || colors['General'];
  };

  const handleOpenMetadataDialog = () => {
    setMetadataForm({
      name: '',
      category: 'General',
      description: '',
      screenshot: ''
    });
    setMetadataDialogOpen(true);
  };

  const handleCloseMetadataDialog = () => {
    setMetadataDialogOpen(false);
  };

  const handleSaveMetadata = async () => {
    // Get current setup data
    const currentSetup = await exportData();
    
    // Create setup with metadata
    const setupWithMetadata = {
      ...JSON.parse(currentSetup),
      name: metadataForm.name,
      category: metadataForm.category,
      description: metadataForm.description,
      screenshot: metadataForm.screenshot
    };

    // Download as JSON file
    const blob = new Blob([JSON.stringify(setupWithMetadata, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadataForm.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    handleCloseMetadataDialog();
  };

  const categories = ['General', 'Microscopy', 'Astronomy', 'Spectroscopy', 'Imaging', 'Laser'];

  if (loading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading optical setups...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Box py={4}>
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
          <Button variant="contained" onClick={fetchSetups}>
            Retry
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container 
      maxWidth="lg" 
      sx={{ 
        height: '100vh', 
        overflow: 'auto', 
        pb: 4,
        // Mobile-specific styles
        '@media (max-width: 768px)': {
          px: 1,
          pb: 8, // Extra padding for mobile
        }
      }}
    >
      <Box py={4}>
        <Box 
          display="flex" 
          flexDirection={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between" 
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          gap={2}
          mb={4}
        >
          <Box>
            <Typography 
              variant="h4" 
              component="h1" 
              gutterBottom
              sx={{
                fontSize: { xs: '1.75rem', sm: '2.125rem' },
              }}
            >
              Optical Setup Browser
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Browse and load pre-built optical configurations from the openUC2 community
            </Typography>
          </Box>
          <Box 
            display="flex" 
            gap={1}
            flexDirection={{ xs: 'column', sm: 'row' }}
            width={{ xs: '100%', sm: 'auto' }}
          >
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />}
              onClick={fetchSetups}
              disabled={loading}
              fullWidth
              sx={{
                minHeight: { xs: 44, sm: 'auto' },
                display: { xs: 'block', sm: 'inline-flex' }
              }}
            >
              Refresh
            </Button>
            <Button 
              variant="outlined" 
              onClick={() => navigate('/')}
              fullWidth
              sx={{
                minHeight: { xs: 44, sm: 'auto' },
                display: { xs: 'block', sm: 'inline-flex' }
              }}
            >
              Back to Editor
            </Button>
          </Box>
        </Box>

        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(auto-fill, minmax(280px, 1fr))',
              md: 'repeat(auto-fill, minmax(300px, 1fr))'
            },
            gap: { xs: 2, sm: 3 }
          }}
        >
          {setups.map((setup, index) => (
            <Box key={index}>
              <Card 
                sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  minHeight: { xs: 280, sm: 320 },
                  touchAction: 'manipulation',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: 4,
                  },
                  '&:active': {
                    transform: { xs: 'scale(0.98)', sm: 'translateY(-4px) scale(0.98)' },
                  },
                  '@media (max-width: 768px)': {
                    '&:hover': {
                      transform: 'none',
                      boxShadow: 'inherit',
                    },
                  }
                }}
                onClick={() => handleSetupClick(setup)}
              >
                <CardMedia
                  component="div"
                  sx={{
                    height: 200,
                    backgroundColor: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  {setup.screenshot ? (
                    <img
                      src={setup.screenshot}
                      alt={setup.name}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain'
                      }}
                      onError={(e) => {
                        // Hide broken images and show placeholder
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.1)',
                      color: 'text.secondary'
                    }}
                  >
                    {!setup.screenshot && (
                      <Typography variant="h6">
                        🔬 {setup.name}
                      </Typography>
                    )}
                  </Box>
                </CardMedia>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Box mb={1}>
                    <Chip
                      label={setup.category}
                      size="small"
                      sx={{
                        backgroundColor: getCategoryColor(setup.category),
                        color: 'white',
                        mb: 1
                      }}
                    />
                  </Box>
                  <Typography variant="h6" component="h2" gutterBottom>
                    {setup.name}
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary" 
                    sx={{ 
                      flexGrow: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {setup.description}
                  </Typography>
                  <Button 
                    variant="contained" 
                    size="small" 
                    sx={{ mt: 2, alignSelf: 'flex-start' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetupClick(setup);
                    }}
                  >
                    Load Setup
                  </Button>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>

        {setups.length === 0 && (
          <Box textAlign="center" py={8}>
            <Typography variant="h6" color="text.secondary">
              No setups found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The setup repository might be empty or unavailable.
            </Typography>
          </Box>
        )}

        {/* Floating Action Button for creating new setup metadata */}
        <Fab
          color="primary"
          aria-label="add setup metadata"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={handleOpenMetadataDialog}
        >
          <AddIcon />
        </Fab>

        {/* Metadata Entry Dialog */}
        <Dialog open={metadataDialogOpen} onClose={handleCloseMetadataDialog} maxWidth="md" fullWidth>
          <DialogTitle>Add Setup Metadata</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create metadata for your current optical setup. This will export your setup with the specified information.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                autoFocus
                margin="dense"
                label="Setup Name"
                fullWidth
                variant="outlined"
                value={metadataForm.name}
                onChange={(e) => setMetadataForm({ ...metadataForm, name: e.target.value })}
                required
              />
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={metadataForm.category}
                  label="Category"
                  onChange={(e) => setMetadataForm({ ...metadataForm, category: e.target.value })}
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                margin="dense"
                label="Description"
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                value={metadataForm.description}
                onChange={(e) => setMetadataForm({ ...metadataForm, description: e.target.value })}
                placeholder="Describe your optical setup, its purpose, and key features..."
              />
              <TextField
                margin="dense"
                label="Screenshot URL (optional)"
                fullWidth
                variant="outlined"
                value={metadataForm.screenshot}
                onChange={(e) => setMetadataForm({ ...metadataForm, screenshot: e.target.value })}
                placeholder="https://example.com/screenshot.png"
                helperText="Provide a URL to an image showing your setup"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseMetadataDialog}>Cancel</Button>
            <Button 
              onClick={handleSaveMetadata} 
              variant="contained"
              disabled={!metadataForm.name.trim()}
            >
              Export Setup
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};
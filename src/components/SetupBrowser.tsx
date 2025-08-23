import React, { useState, useEffect, useCallback } from 'react';
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
  Fab,
  Tabs,
  Tab,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon, Edit as EditIcon, Delete as DeleteIcon, MoreVert as MoreVertIcon } from '@mui/icons-material';
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

interface CollectionMetadata {
  name: string;
  description: string;
  image?: string;
  setupCount: number;
  color: string;
}

interface SetupAnalysisData {
  filename: string;
  name: string;
  uc2_verified: boolean;
  collection: string | string[]; // Support both single and multiple collections
  author: string;
  github_link: string;
  description: string;
  category: string;
  version: string;
  createdAt: string;
  total_components: number;
  notification?: string; // For safety warnings, module requirements, etc.
  [key: string]: string | number | boolean | string[] | undefined; // For component columns
}

export const SetupBrowser: React.FC = () => {
  const navigate = useNavigate();
  const { importFromUrl, exportData } = useAppStore();
  const [setups, setSetups] = useState<SetupMetadata[]>([]);
  const [collections, setCollections] = useState<CollectionMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    name: '',
    category: 'General',
    description: '',
    screenshot: ''
  });
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedSetup, setSelectedSetup] = useState<SetupMetadata | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    category: 'General',
    description: '',
    screenshot: ''
  });

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  };

  const parseSetupAnalysisCsv = (csvText: string): SetupAnalysisData[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = parseCsvLine(lines[0]);
    const data: SetupAnalysisData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length >= headers.length) {
        const row: Record<string, string | number | boolean> = {};
        headers.forEach((header, index) => {
          const value = values[index] || '';
          // Convert specific fields to appropriate types
          if (header === 'uc2_verified') {
            row[header] = value.toLowerCase() === 'true';
          } else if (header === 'total_components') {
            row[header] = parseInt(value) || 0;
          } else if (header.startsWith('component_')) {
            row[header] = parseInt(value) || 0;
          } else {
            row[header] = value;
          }
        });
        data.push(row as SetupAnalysisData);
      }
    }
    
    return data;
  };

  const fetchCollections = useCallback(async () => {
    try {
      // Try to fetch the setups_analysis.csv from the repository
      const csvUrl = 'https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/setups_analysis.csv';
      const response = await fetch(csvUrl);
      
      if (response.ok) {
        const csvText = await response.text();
        const analysisData = parseSetupAnalysisCsv(csvText);
        
        // Group setups by collection (supporting multiple collections per setup)
        const collectionGroups = analysisData.reduce((acc, setup) => {
          // Handle both single string and array formats for collections
          let collections: string[];
          if (Array.isArray(setup.collection)) {
            collections = setup.collection;
          } else if (typeof setup.collection === 'string') {
            // Check if it's a JSON array string or comma-separated values
            try {
              const parsed = JSON.parse(setup.collection);
              collections = Array.isArray(parsed) ? parsed : [setup.collection];
            } catch {
              // Handle comma-separated values
              collections = setup.collection.split(',').map(c => c.trim());
            }
          } else {
            collections = ['General'];
          }
          
          // Add setup to each collection it belongs to
          collections.forEach(collection => {
            if (!acc[collection]) {
              acc[collection] = [];
            }
            acc[collection].push(setup);
          });
          
          return acc;
        }, {} as Record<string, SetupAnalysisData[]>);
        
        // Create collection metadata
        const collectionMetadata: CollectionMetadata[] = Object.entries(collectionGroups).map(([name, setups]) => ({
          name,
          description: getCollectionDescription(name),
          image: getCollectionImage(name),
          setupCount: setups.length,
          color: getCollectionColor(name)
        }));
        
        setCollections(collectionMetadata);
      } else {
        // Fallback to sample collections
        setCollections(getSampleCollections());
      }
    } catch (error) {
      console.warn('Failed to fetch collections, using sample data:', error);
      setCollections(getSampleCollections());
    }
  }, []);

  useEffect(() => {
    fetchSetups();
    fetchCollections();
  }, [fetchCollections]);

  const getCollectionDescription = (collectionName: string): string => {
    const descriptions: Record<string, string> = {
      'quantumBOX': 'Educational quantum optics experiments and demonstrations for schools and universities.',
      'coreBOX': 'Essential optical components and basic setups for fundamental optics education.',
      'FRAME': 'Advanced optical frames and mounting systems for precision experiments.',
      'General': 'Miscellaneous optical setups and experimental configurations.'
    };
    return descriptions[collectionName] || `Collection of ${collectionName} optical setups and experiments.`;
  };

  const getCollectionImage = (collectionName: string): string => {
    const images: Record<string, string> = {
      'quantumBOX': '/images/quantumbox.jpg',
      'coreBOX': '/images/corebox.jpg', 
      'FRAME': '/images/frame.jpg',
      'General': '/images/general.jpg'
    };
    return images[collectionName] || '/images/default-collection.jpg';
  };

  const getCollectionColor = (collectionName: string): string => {
    const colors: Record<string, string> = {
      'quantumBOX': '#6a1b9a',
      'coreBOX': '#1976d2',
      'FRAME': '#f57c00',
      'General': '#616161'
    };
    return colors[collectionName] || '#616161';
  };

  const getSampleCollections = (): CollectionMetadata[] => [
    {
      name: 'quantumBOX',
      description: 'Educational quantum optics experiments and demonstrations for schools and universities.',
      setupCount: 5,
      color: '#6a1b9a'
    },
    {
      name: 'coreBOX', 
      description: 'Essential optical components and basic setups for fundamental optics education.',
      setupCount: 8,
      color: '#1976d2'
    },
    {
      name: 'FRAME',
      description: 'Advanced optical frames and mounting systems for precision experiments.',
      setupCount: 3,
      color: '#f57c00'
    }
  ];

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

  const handleCollectionClick = (collectionName: string) => {
    // Navigate to collection-specific page
    navigate(`/${collectionName}`);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
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

  const handleSetupMenuOpen = (event: React.MouseEvent<HTMLElement>, setup: SetupMetadata) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setSelectedSetup(setup);
  };

  const handleSetupMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedSetup(null);
  };

  const handleEditSetup = () => {
    if (selectedSetup) {
      setEditForm({
        name: selectedSetup.name,
        category: selectedSetup.category,
        description: selectedSetup.description,
        screenshot: selectedSetup.screenshot || ''
      });
      setEditDialogOpen(true);
      handleSetupMenuClose();
    }
  };

  const handleDeleteSetup = () => {
    if (selectedSetup) {
      const confirmDelete = window.confirm(`Are you sure you want to delete the setup "${selectedSetup.name}"? This action cannot be undone.`);
      if (confirmDelete) {
        // Filter out the deleted setup
        setSetups(prevSetups => prevSetups.filter(setup => setup.path !== selectedSetup.path));
        alert(`Setup "${selectedSetup.name}" has been removed from the browser. Note: This only removes it locally - to permanently delete from the store, please contact the repository maintainers.`);
      }
      handleSetupMenuClose();
    }
  };

  const handleSaveEditedSetup = () => {
    if (selectedSetup) {
      // Update the setup in the local list
      setSetups(prevSetups => prevSetups.map(setup => 
        setup.path === selectedSetup.path 
          ? { ...setup, 
              name: editForm.name, 
              category: editForm.category, 
              description: editForm.description, 
              screenshot: editForm.screenshot 
            }
          : setup
      ));
      
      alert(`Setup "${editForm.name}" has been updated locally. Note: Changes are only visible in this session - to permanently update the setup in the store, please contact the repository maintainers.`);
      setEditDialogOpen(false);
    }
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
              onClick={() => {
                fetchSetups();
                fetchCollections();
              }}
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

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="setup browser tabs">
            <Tab label="Individual Setups" />
            <Tab label="Available Collections" />
          </Tabs>
        </Box>

        {/* Tab Content */}
        {tabValue === 0 && (
          // Individual Setups Tab Content
          <>
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
                      {/* Menu Button */}
                      <IconButton
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          backgroundColor: 'rgba(255, 255, 255, 0.8)',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          },
                          zIndex: 1
                        }}
                        size="small"
                        onClick={(e) => handleSetupMenuOpen(e, setup)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                      
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

            {setups.length === 0 && !loading && (
              <Box textAlign="center" py={8}>
                <Typography variant="h6" color="text.secondary">
                  No setups found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  The setup repository might be empty or unavailable.
                </Typography>
              </Box>
            )}
          </>
        )}

        {tabValue === 1 && (
          // Collections Tab Content
          <>
            <Box 
              sx={{ 
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(auto-fill, minmax(280px, 1fr))',
                  md: 'repeat(auto-fill, minmax(320px, 1fr))'
                },
                gap: { xs: 2, sm: 3 }
              }}
            >
              {collections.map((collection, index) => (
                <Box key={index}>
                  <Card 
                    sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      minHeight: { xs: 320, sm: 360 },
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
                    onClick={() => handleCollectionClick(collection.name)}
                  >
                    <CardMedia
                      component="div"
                      sx={{
                        height: 200,
                        backgroundColor: collection.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        backgroundImage: `linear-gradient(45deg, ${collection.color}cc, ${collection.color})`
                      }}
                    >
                      {collection.image ? (
                        <img
                          src={collection.image}
                          alt={collection.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                          onError={(e) => {
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
                          backgroundColor: 'rgba(0,0,0,0.2)',
                          color: 'white'
                        }}
                      >
                        <Typography variant="h4" component="h2" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                          {collection.name}
                        </Typography>
                      </Box>
                    </CardMedia>
                    <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <Box mb={2}>
                        <Chip
                          label={`${collection.setupCount} setups`}
                          size="small"
                          sx={{
                            backgroundColor: collection.color,
                            color: 'white'
                          }}
                        />
                      </Box>
                      <Typography variant="h6" component="h3" gutterBottom>
                        {collection.name} Collection
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        sx={{ 
                          flexGrow: 1,
                          mb: 2
                        }}
                      >
                        {collection.description}
                      </Typography>
                      <Button 
                        variant="contained" 
                        size="medium" 
                        sx={{ 
                          mt: 'auto',
                          backgroundColor: collection.color,
                          '&:hover': {
                            backgroundColor: collection.color,
                            filter: 'brightness(0.9)'
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCollectionClick(collection.name);
                        }}
                      >
                        Explore {collection.name}
                      </Button>
                    </CardContent>
                  </Card>
                </Box>
              ))}
            </Box>

            {collections.length === 0 && !loading && (
              <Box textAlign="center" py={8}>
                <Typography variant="h6" color="text.secondary">
                  No collections found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Collections data might be unavailable.
                </Typography>
              </Box>
            )}
          </>
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

        {/* Setup Management Menu */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleSetupMenuClose}
        >
          <MenuItem onClick={handleEditSetup}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit Setup</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleDeleteSetup} sx={{ color: 'error.main' }}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
            </ListItemIcon>
            <ListItemText>Delete Setup</ListItemText>
          </MenuItem>
        </Menu>

        {/* Edit Setup Dialog */}
        <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Setup</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                autoFocus
                required
                label="Setup Name"
                fullWidth
                variant="outlined"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter setup name"
              />
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={editForm.category}
                  label="Category"
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                >
                  {categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Description"
                multiline
                rows={4}
                fullWidth
                variant="outlined"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Describe your optical setup, its purpose, and key features..."
              />
              <TextField
                label="Screenshot URL (optional)"
                fullWidth
                variant="outlined"
                value={editForm.screenshot}
                onChange={(e) => setEditForm({ ...editForm, screenshot: e.target.value })}
                placeholder="https://example.com/screenshot.png"
                helperText="Provide a URL to an image showing your setup"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveEditedSetup} 
              variant="contained"
              disabled={!editForm.name.trim()}
            >
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};
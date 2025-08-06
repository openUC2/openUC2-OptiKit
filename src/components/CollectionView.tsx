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
  Breadcrumbs,
  Link
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';

interface SetupAnalysisData {
  filename: string;
  name: string;
  uc2_verified: boolean;
  collection: string;
  author: string;
  github_link: string;
  description: string;
  category: string;
  version: string;
  createdAt: string;
  total_components: number;
  [key: string]: string | number | boolean;
}

export const CollectionView: React.FC = () => {
  const navigate = useNavigate();
  const { collectionName } = useParams<{ collectionName: string }>();
  const { importFromUrl } = useAppStore();
  const [setups, setSetups] = useState<SetupAnalysisData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchCollectionSetups = useCallback(async (collection: string) => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch the setups_analysis.csv from the repository
      const csvUrl = 'https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/setups_analysis.csv';
      const response = await fetch(csvUrl);
      
      if (response.ok) {
        const csvText = await response.text();
        const analysisData = parseSetupAnalysisCsv(csvText);
        
        // Filter setups by collection
        const collectionSetups = analysisData.filter(setup => 
          setup.collection.toLowerCase() === collection.toLowerCase()
        );
        
        setSetups(collectionSetups);
      } else {
        // Fallback to sample data
        setSetups(getSampleSetups(collection));
      }
    } catch (error) {
      console.error('Error fetching collection setups:', error);
      setError('Failed to load collection setups.');
      setSetups(getSampleSetups(collection));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (collectionName) {
      fetchCollectionSetups(collectionName);
    }
  }, [collectionName, fetchCollectionSetups]);

  const getSampleSetups = (collection: string): SetupAnalysisData[] => {
    const sampleData: Record<string, SetupAnalysisData[]> = {
      'quantumBOX': [
        {
          filename: 'quantum-interference.json',
          name: 'Quantum Interference Demo',
          uc2_verified: true,
          collection: 'quantumBOX',
          author: 'UC2 Team',
          github_link: 'https://github.com/openUC2/UC2-GIT/tree/master/APPLICATIONS/APP_POL',
          description: 'Demonstrate wave-particle duality with a simple interferometer setup',
          category: 'Quantum',
          version: '1.0',
          createdAt: '2024-01-01',
          total_components: 8
        }
      ],
      'coreBOX': [
        {
          filename: 'basic-microscope.json',
          name: 'Basic Microscope',
          uc2_verified: true,
          collection: 'coreBOX',
          author: 'UC2 Team',
          github_link: 'https://github.com/openUC2/UC2-GIT/tree/master/APPLICATIONS/APP_SIMPLE-Telescope',
          description: 'A simple compound microscope for educational purposes',
          category: 'Microscopy',
          version: '1.0',
          createdAt: '2024-01-01',
          total_components: 5
        }
      ],
      'FRAME': [
        {
          filename: 'precision-interferometer.json',
          name: 'Precision Interferometer',
          uc2_verified: true,
          collection: 'FRAME',
          author: 'UC2 Team',
          github_link: 'https://github.com/openUC2/UC2-GIT/tree/master/APPLICATIONS/APP_INTERFEROMETER',
          description: 'High-precision Michelson interferometer for advanced measurements',
          category: 'Interferometry',
          version: '1.0',
          createdAt: '2024-01-01',
          total_components: 12
        }
      ]
    };
    
    return sampleData[collection] || [];
  };

  const handleSetupClick = async (setup: SetupAnalysisData) => {
    try {
      // Convert GitHub blob URL to raw URL for direct JSON loading
      let setupUrl = '';
      
      if (setup.filename.startsWith('http')) {
        // If filename is already a full URL, use it
        setupUrl = setup.filename;
      } else {
        // Construct the GitHub raw URL from the filename
        setupUrl = `https://raw.githubusercontent.com/beniroquai/openUC2-OptiKit-Store/main/setups/${setup.filename}`;
      }
      
      console.log('Loading setup from:', setupUrl);
      const success = await importFromUrl(setupUrl);
      
      if (success) {
        navigate('/');
      } else {
        alert('Failed to load the setup. Please try again.');
      }
    } catch (error) {
      console.error('Error loading setup:', error);
      alert('Failed to load the setup. Please try again.');
    }
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

  if (loading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>
            Loading {collectionName} setups...
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
          <Button variant="contained" onClick={() => fetchCollectionSetups(collectionName || '')}>
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
        '@media (max-width: 768px)': {
          px: 1,
          pb: 8,
        }
      }}
    >
      <Box py={4}>
        {/* Breadcrumbs */}
        <Box mb={3}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link
              color="inherit"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                navigate('/setups');
              }}
              sx={{ cursor: 'pointer' }}
            >
              Setup Browser
            </Link>
            <Typography color="text.primary">{collectionName}</Typography>
          </Breadcrumbs>
        </Box>

        {/* Header */}
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
                color: getCollectionColor(collectionName || '')
              }}
            >
              {collectionName} Collection
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {setups.length} setups available in this collection
            </Typography>
          </Box>
          <Button 
            variant="outlined" 
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/setups')}
            sx={{
              minHeight: { xs: 44, sm: 'auto' },
            }}
          >
            Back to Browser
          </Button>
        </Box>

        {/* Setups Grid */}
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
                onClick={() => handleSetupClick(setup)}
              >
                <CardMedia
                  component="div"
                  sx={{
                    height: 200,
                    backgroundColor: getCollectionColor(collectionName || ''),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    backgroundImage: `linear-gradient(45deg, ${getCollectionColor(collectionName || '')}cc, ${getCollectionColor(collectionName || '')})`
                  }}
                >
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
                    <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                      🔬 {setup.name}
                    </Typography>
                  </Box>
                </CardMedia>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <Box mb={1} display="flex" gap={1} flexWrap="wrap">
                    <Chip
                      label={setup.category}
                      size="small"
                      sx={{
                        backgroundColor: getCollectionColor(collectionName || ''),
                        color: 'white'
                      }}
                    />
                    {setup.uc2_verified && (
                      <Chip
                        label="UC2 Verified"
                        size="small"
                        color="success"
                      />
                    )}
                    <Chip
                      label={`${setup.total_components} components`}
                      size="small"
                      variant="outlined"
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
                      mb: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {setup.description}
                  </Typography>
                  {setup.author && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                      By: {setup.author}
                    </Typography>
                  )}
                  <Box display="flex" gap={1} mt="auto">
                    <Button 
                      variant="contained" 
                      size="small" 
                      sx={{ 
                        backgroundColor: getCollectionColor(collectionName || ''),
                        '&:hover': {
                          backgroundColor: getCollectionColor(collectionName || ''),
                          filter: 'brightness(0.9)'
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetupClick(setup);
                      }}
                    >
                      Load Setup
                    </Button>
                    {setup.github_link && (
                      <Button 
                        variant="outlined" 
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(setup.github_link, '_blank');
                        }}
                      >
                        Instructions
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>

        {setups.length === 0 && (
          <Box textAlign="center" py={8}>
            <Typography variant="h6" color="text.secondary">
              No setups found in {collectionName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This collection might be empty or unavailable.
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
};
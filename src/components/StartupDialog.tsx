import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Card,
  CardContent,
  CardActions,
  Divider,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Add as AddIcon,
  Dashboard as SetupIcon,
  FolderOpen as CollectionIcon,
  ViewInAr as LogoIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface StartupDialogProps {
  open: boolean;
  onClose: () => void;
}

export const StartupDialog: React.FC<StartupDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleStartFresh = () => {
    onClose();
    // Already on the main configurator page, just close dialog
  };

  const handleLoadSetup = () => {
    onClose();
    navigate('/setups');
  };

  const handleLoadCollection = () => {
    onClose();
    navigate('/setups'); // This will open the setup browser with collections tab
  };

  const options = [
    {
      title: 'Start Fresh',
      description: 'Begin with an empty workspace and build your optical system from scratch',
      icon: <AddIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: handleStartFresh,
      color: '#2196f3'
    },
    {
      title: 'Load from Available Setups',
      description: 'Choose from individual pre-built optical configurations and setups',
      icon: <SetupIcon sx={{ fontSize: 48, color: 'secondary.main' }} />,
      action: handleLoadSetup,
      color: '#9c27b0'
    },
    {
      title: 'Load from Collections',
      description: 'Browse collections like quantumBOX, coreBOX, and FRAME for organized setups',
      icon: <CollectionIcon sx={{ fontSize: 48, color: '#ff9800' }} />,
      action: handleLoadCollection,
      color: '#ff9800'
    }
  ];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
          minHeight: isMobile ? '100vh' : 'auto'
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          textAlign: 'center', 
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 1 }}>
          <LogoIcon sx={{ fontSize: 40, color: 'secondary.main' }} />
          <Typography variant="h4" component="h2" sx={{ fontWeight: 600 }}>
            Welcome to openUC2 OptiKit
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          How would you like to start building your optical system?
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ py: 3 }}>
        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 3,
            mt: 1
          }}
        >
          {options.map((option, index) => (
            <Card 
              key={index}
              sx={{ 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: '2px solid transparent',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                  borderColor: option.color
                }
              }}
              onClick={option.action}
            >
              <CardContent sx={{ flex: 1, textAlign: 'center', p: 3 }}>
                <Box sx={{ mb: 2 }}>
                  {option.icon}
                </Box>
                <Typography variant="h6" component="h3" gutterBottom sx={{ fontWeight: 600 }}>
                  {option.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {option.description}
                </Typography>
              </CardContent>
              <Divider />
              <CardActions sx={{ justifyContent: 'center', p: 2 }}>
                <Button 
                  variant="contained"
                  onClick={(e) => {
                    e.stopPropagation();
                    option.action();
                  }}
                  sx={{ 
                    backgroundColor: option.color,
                    '&:hover': {
                      backgroundColor: option.color,
                      filter: 'brightness(0.9)'
                    }
                  }}
                >
                  Choose This Option
                </Button>
              </CardActions>
            </Card>
          ))}
        </Box>

        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Don't worry, you can always switch between these options later using the navigation buttons in the toolbar.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
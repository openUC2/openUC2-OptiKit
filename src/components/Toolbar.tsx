import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar as MuiToolbar, 
  Typography, 
  IconButton, 
  Divider,
  Box,
  Tooltip,
  Button
} from '@mui/material';
import {
  Undo as UndoIcon,
  Redo as RedoIcon,
  GridOn as GridIcon,
  CropFree as SnapIcon,
  CenterFocusStrong as CenterIcon,
  Timeline as LineIcon,
  ArrowForward as ArrowIcon,
  MoreHoriz as OpticalAxisIcon,
  TextFields as TextIcon,
  Save as SaveIcon,
  Email as EmailIcon,
  FolderOpen as ImportIcon,
  Language as UrlIcon,
  PhotoCamera as ScreenshotIcon,
  Archive as STLIcon,
  GitHub as GitHubIcon,
  Help as HelpIcon,
  Lock as PrivacyIcon,
  ViewInAr as LogoIcon,
  Clear as ClearIcon,
  Link as LinkIcon,
  Dashboard as SetupIcon,
  Edit as EditorIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';

export const Toolbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEditorPage = location.pathname === '/';
  
  const { 
    grid, 
    setGridConfig, 
    exportData, 
    saveToGitHub,
    generateShareableLink,
    downloadSTLBundle,
    importData, 
    importFromUrl,
    undo, 
    redo,
    centerView,
    annotationMode,
    setAnnotationMode,
    downloadScreenshot,
    clearAll
  } = useAppStore();

  const handleExport = async () => {
    const data = await exportData();
    
    // Use File System Access API if available, otherwise fallback to prompt
    if ('showSaveFilePicker' in window) {
      // Modern browsers with File System Access API
      const saveFile = async () => {
        try {
          const fileHandle = await (window as unknown as { showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            types: [{
              description: 'JSON files',
              accept: {
                'application/json': ['.json'],
              },
            }],
            suggestedName: 'optikit-layout.json',
          });
          
          const writable = await fileHandle.createWritable();
          await writable.write(data);
          await writable.close();
        } catch (error) {
          // User cancelled or error occurred
          console.log('Save cancelled or failed:', error);
        }
      };
      saveFile();
    } else {
      // Fallback for older browsers - prompt for filename
      const defaultName = 'optikit-layout.json';
      const filename = prompt('Enter filename:', defaultName) || defaultName;
      
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.json') ? filename : filename + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleShare = async () => {
    const data = await exportData();
    const subject = 'OpenUC2 OptiKit Layout';
    const body = `I've created an optical system layout using OpenUC2 OptiKit!

Please find the layout configuration below. You can import this into OpenUC2 OptiKit by copying the JSON data and using the Import function.

Layout Configuration:
${data}

Best regards`;
    
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Try to open in default mail client
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveToGitHub = () => {
    saveToGitHub();
  };

  const handleExportSTL = () => {
    const password = prompt('Enter password to export STL files:');
    if (password === 'youseetoo') {
      downloadSTLBundle(password);
    } else if (password !== null) {
      alert('Incorrect password. Access denied.');
    }
  };

  const handleHelp = () => {
    const helpContent = `
OpenUC2 OptiKit - 2D Grid Builder Help

BASIC USAGE:
• Drag components from the Part Library to the grid
• Click components to select and view properties
• Use the rotate button to rotate selected components
• Use layer panel to work with different Z-levels

NAVIGATION:
• Mouse wheel: Zoom in/out
• Drag background: Pan the view
• Center button: Reset view to center

ANNOTATIONS:
• Line tool: Click to start, click again to finish
• Arrow tool: Click to start, click again to finish
• Optical Axis: Dashed line for optical paths
• Text tool: Click to place text

EXPORT/IMPORT:
• Save: Export layout to JSON file
• Share: Send layout via email
• Import: Load layout from JSON file
• Screenshot: Download PNG image of assembly

SHORTCUTS:
• Grid toggle: Show/hide grid lines
• Snap toggle: Enable/disable snap-to-grid
• Undo/Redo: Navigate through changes
`;
    
    alert(helpContent);
  };

  const handlePrivacy = () => {
    const privacyContent = `
OpenUC2 OptiKit - Privacy Policy

DATA STORAGE:
• Your layouts are stored locally in your browser
• No data is sent to external servers
• Email sharing uses your default mail client

COOKIES:
• We use localStorage to save your work
• No tracking cookies are used
• Data persists between sessions

EXTERNAL LINKS:
• STL files may link to external repositories
• Module data is loaded from local CSV files
• No personal information is collected

CONTACT:
For questions about data usage, contact:
openUC2 team via GitHub repository
`;
    
    alert(privacyContent);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result as string;
          importData(data);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleImportFromUrl = async () => {
    const url = prompt('Enter URL to JSON layout file:');
    if (url) {
      const success = await importFromUrl(url);
      if (success) {
        alert('Layout imported successfully!');
      } else {
        alert('Failed to import layout from URL. Please check the URL and try again.');
      }
    }
  };

  const handleClear = () => {
    if (confirm('Are you sure you want to clear all modules and annotations? This action can be undone.')) {
      clearAll();
    }
  };

  const handleGenerateShareableLink = () => {
    const shareableUrl = generateShareableLink();
    
    // Copy to clipboard and show confirmation
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareableUrl).then(() => {
        alert(`Shareable link copied to clipboard!\n\nURL: ${shareableUrl}\n\nAnyone with this link can open your layout in OptiKit.`);
      }).catch(() => {
        // Fallback if clipboard write fails
        prompt('Copy this shareable link:', shareableUrl);
      });
    } else {
      // Fallback for browsers without clipboard API
      prompt('Copy this shareable link:', shareableUrl);
    }
  };

  return (
    <AppBar 
      position="static" 
      color="primary" 
      elevation={2}
      sx={{ zIndex: 1300 }}
    >
      <MuiToolbar 
        sx={{ 
          minHeight: { xs: '56px', sm: '64px' }, 
          gap: { xs: 0.5, sm: 1 },
          px: { xs: 1, sm: 2 },
          overflow: 'hidden'
        }}
      >
        {/* Logo Section */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: { xs: 1, sm: 2 } }}>
          <LogoIcon sx={{ fontSize: { xs: 28, sm: 32 }, mr: 1, color: 'secondary.main' }} />
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ 
              fontWeight: 500,
              fontSize: { xs: '1rem', sm: '1.25rem' },
              display: { xs: 'none', sm: 'block' }
            }}
          >
            openUC2
          </Typography>
        </Box>

        {/* Navigation Section - Always visible */}
        <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
          <Tooltip title={isEditorPage ? "Switch to Setup Browser" : "Switch to Editor"}>
            <Button
              color="inherit"
              startIcon={isEditorPage ? <SetupIcon /> : <EditorIcon />}
              onClick={() => navigate(isEditorPage ? '/setups' : '/')}
              size="small"
              sx={{ 
                textTransform: 'none',
                minWidth: { xs: '40px', sm: 'auto' },
                px: { xs: 1, sm: 2 },
                '& .MuiButton-startIcon': {
                  mr: { xs: 0, sm: 1 }
                }
              }}
            >
              <Typography 
                sx={{ 
                  display: { xs: 'none', sm: 'inline' } 
                }}
              >
                {isEditorPage ? 'Browse Setups' : 'Editor'}
              </Typography>
            </Button>
          </Tooltip>
        </Box>

        <Divider 
          orientation="vertical" 
          flexItem 
          sx={{ 
            mx: { xs: 0.5, sm: 1 }, 
            bgcolor: 'rgba(255,255,255,0.2)',
            display: { xs: 'none', sm: 'block' }
          }} 
        />

        {/* Editor-only controls */}
        {isEditorPage && (
          <>

        {/* Primary Controls - Always visible on mobile */}
        <Box sx={{ display: 'flex', gap: 0.5, flex: 1, overflow: 'hidden' }}>
          <Tooltip title="Undo">
            <IconButton 
              color="inherit"
              onClick={undo}
              size="small"
              sx={{ minWidth: { xs: 40, sm: 'auto' } }}
            >
              <UndoIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Redo">
            <IconButton 
              color="inherit"
              onClick={redo}
              size="small"
              sx={{ minWidth: { xs: 40, sm: 'auto' } }}
            >
              <RedoIcon />
            </IconButton>
          </Tooltip>

          {/* Grid Controls - Hidden on small mobile */}
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5 }}>
            <Tooltip title="Toggle Grid">
              <IconButton 
                color={grid.gridVisible ? "secondary" : "inherit"}
                onClick={() => setGridConfig({ gridVisible: !grid.gridVisible })}
                size="small"
              >
                <GridIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Toggle Snap to Grid">
              <IconButton 
                color={grid.snapEnabled ? "secondary" : "inherit"}
                onClick={() => setGridConfig({ snapEnabled: !grid.snapEnabled })}
                size="small"
              >
                <SnapIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Center View">
              <IconButton 
                color="inherit"
                onClick={centerView}
                size="small"
              >
                <CenterIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Secondary Controls - Hidden on mobile, visible on tablet+ */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
          <Divider orientation="vertical" flexItem sx={{ mx: 1, bgcolor: 'rgba(255,255,255,0.2)' }} />
          
          {/* Annotation Tools */}
          <Tooltip title="Draw Line">
            <IconButton 
              color={annotationMode === 'line' ? "secondary" : "inherit"}
              onClick={() => setAnnotationMode(annotationMode === 'line' ? 'none' : 'line')}
              size="small"
            >
              <LineIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Draw Arrow">
            <IconButton 
              color={annotationMode === 'arrow' ? "secondary" : "inherit"}
              onClick={() => setAnnotationMode(annotationMode === 'arrow' ? 'none' : 'arrow')}
              size="small"
            >
              <ArrowIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Draw Optical Axis">
            <IconButton 
              color={annotationMode === 'optical-axis' ? "secondary" : "inherit"}
              onClick={() => setAnnotationMode(annotationMode === 'optical-axis' ? 'none' : 'optical-axis')}
              size="small"
            >
              <OpticalAxisIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Text">
            <IconButton 
              color={annotationMode === 'text' ? "secondary" : "inherit"}
              onClick={() => setAnnotationMode(annotationMode === 'text' ? 'none' : 'text')}
              size="small"
            >
              <TextIcon />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 1, bgcolor: 'rgba(255,255,255,0.2)' }} />

          {/* File Operations */}
          <Tooltip title="Save Layout As...">
            <IconButton 
              color="inherit"
              onClick={handleExport}
              size="small"
            >
              <SaveIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Generate Shareable Link">
            <IconButton 
              color="inherit"
              onClick={handleGenerateShareableLink}
              size="small"
            >
              <LinkIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Share via Email">
            <IconButton 
              color="inherit"
              onClick={handleShare}
              size="small"
            >
              <EmailIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import Layout">
            <IconButton 
              color="inherit"
              onClick={handleImport}
              size="small"
            >
              <ImportIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import from URL">
            <IconButton 
              color="inherit"
              onClick={handleImportFromUrl}
              size="small"
            >
              <UrlIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download Screenshot">
            <IconButton 
              color="inherit"
              onClick={downloadScreenshot}
              size="small"
            >
              <ScreenshotIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download STL Bundle">
            <IconButton 
              color="inherit"
              onClick={handleExportSTL}
              size="small"
            >
              <STLIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Save to GitHub">
            <IconButton 
              color="inherit"
              onClick={handleSaveToGitHub}
              size="small"
            >
              <GitHubIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear All">
            <IconButton 
              color="inherit"
              onClick={handleClear}
              size="small"
            >
              <ClearIcon />
            </IconButton>
          </Tooltip>
        </Box>
          </>
        )}

        {/* Help Section - Minimal on mobile */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, ml: 'auto' }}>
          <Tooltip title="Help">
            <IconButton 
              color="inherit"
              onClick={handleHelp}
              size="small"
            >
              <HelpIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Privacy">
            <IconButton 
              color="inherit"
              onClick={handlePrivacy}
              size="small"
            >
              <PrivacyIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Title - Hidden on mobile to save space */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', lg: 'flex' }, justifyContent: 'center' }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 400 }}>
            {isEditorPage ? 'OptiKit - 2D Grid Builder' : 'Setup Browser'}
          </Typography>
        </Box>
      </MuiToolbar>
    </AppBar>
  );
};
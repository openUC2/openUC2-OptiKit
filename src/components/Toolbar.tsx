import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar as MuiToolbar, 
  Typography, 
  Divider,
  Box,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Undo as UndoIcon,
  Redo as RedoIcon,
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
  Edit as EditorIcon,
  Forum as ForumIcon,
  SelectAll as SelectIcon,
  Delete as DeleteIcon,
  Memory as ImSwitchIcon,
  Science as SimulationIcon,
  ThreeDRotation as View3DIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import { useSimulationStore } from '../stores/simulationStore';
import { FeedbackDialog } from './FeedbackDialog';
import { ImSwitchConfigWizard } from './ImSwitchConfigWizard';

export const Toolbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isThreeD = location.pathname.startsWith('/configurator/3d');
  const is2DEditor = location.pathname === '/configurator' || location.pathname === '/configurator/' || location.pathname === '/';
  // Both the 2D and 3D editors share the same toolbar (edit/annotate/file/save);
  // they differ only in the rendering surface in the center.
  const isEditorPage = is2DEditor || isThreeD;

  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [feedbackTrigger, setFeedbackTrigger] = React.useState<'download' | 'github' | 'manual'>('manual');
  const [imSwitchWizardOpen, setImSwitchWizardOpen] = React.useState(false);
  const [editMenuAnchor, setEditMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [annotateMenuAnchor, setAnnotateMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [fileMenuAnchor, setFileMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [helpMenuAnchor, setHelpMenuAnchor] = React.useState<null | HTMLElement>(null);
  
  const { 
    exportData, 
    saveToGitHub,
    saveToGitHubOverwrite,
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
    clearAll,
    selectionMode,
    setSelectionMode,
    deleteSelectedItems,
    selectedItems,
    remoteSourcePath
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
          
          // Trigger feedback dialog after successful download
          setFeedbackTrigger('download');
          setFeedbackOpen(true);
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
      
      // Trigger feedback dialog after download
      setFeedbackTrigger('download');
      setFeedbackOpen(true);
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

  const handleSaveToGitHub = async () => {
    try {
      await saveToGitHub();
      // Trigger feedback dialog after successful GitHub save
      setFeedbackTrigger('github');
      setFeedbackOpen(true);
    } catch (error) {
      console.error('Failed to save to GitHub:', error);
    }
  };

  const handleOverwriteToGitHub = async () => {
    try {
      await saveToGitHubOverwrite();
      setFeedbackTrigger('github');
      setFeedbackOpen(true);
    } catch (error) {
      console.error('Failed to overwrite on GitHub:', error);
    }
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
    // Check if tutorial restart function is available
    if ((window as any).restartTutorial) {
      (window as any).restartTutorial();
    } else {
      // Fallback to showing help text
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
• Snap toggle: Enable/disable snap-to-grid
• Undo/Redo: Navigate through changes

Click this Help button again to restart the tutorial!
`;
      
      alert(helpContent);
    }
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

  const handleForum = () => {
    window.open('https://openuc2.discourse.group', '_blank');
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
              onClick={() => navigate(isEditorPage ? '/configurator/setups' : '/configurator')}
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
          <Tooltip title="FRAME Microscope Configurator">
            <Button
              color="inherit"
              startIcon={<SimulationIcon />}
              onClick={() => navigate('/configurator/frame')}
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
              <Typography sx={{ display: { xs: 'none', sm: 'inline' } }}>
                FRAME
              </Typography>
            </Button>
          </Tooltip>
          {isEditorPage && (
            <Tooltip title={isThreeD ? 'Switch to 2D grid view' : 'Switch to 3D view'}>
              <Button
                color="inherit"
                startIcon={isThreeD ? <EditorIcon /> : <View3DIcon />}
                onClick={() => navigate(isThreeD ? '/configurator' : '/configurator/3d')}
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
                <Typography sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {isThreeD ? 'View 2D' : 'View 3D'}
                </Typography>
              </Button>
            </Tooltip>
          )}
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
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, bgcolor: 'rgba(255,255,255,0.2)' }} />

            {/* Edit menu */}
            <Button
              color="inherit"
              size="small"
              onClick={e => setEditMenuAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.5 }}
            >
              Edit
            </Button>
            <Menu anchorEl={editMenuAnchor} open={Boolean(editMenuAnchor)} onClose={() => setEditMenuAnchor(null)}>
              <MenuItem onClick={() => { undo(); setEditMenuAnchor(null); }}>
                <ListItemIcon><UndoIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Undo</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { redo(); setEditMenuAnchor(null); }}>
                <ListItemIcon><RedoIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Redo</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { setSelectionMode(selectionMode === 'single' ? 'multiple' : 'single'); setEditMenuAnchor(null); }}>
                <ListItemIcon><SelectIcon color={selectionMode === 'multiple' ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>{selectionMode === 'single' ? 'Multi-Select Mode' : 'Single-Select Mode'}</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { centerView(); setEditMenuAnchor(null); }}>
                <ListItemIcon><CenterIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Center View</ListItemText>
              </MenuItem>
              {selectedItems.length > 1 && (
                <MenuItem onClick={() => { deleteSelectedItems(); setEditMenuAnchor(null); }}>
                  <ListItemIcon><DeleteIcon color="error" fontSize="small" /></ListItemIcon>
                  <ListItemText>Delete Selected ({selectedItems.length})</ListItemText>
                </MenuItem>
              )}
              <Divider />
              <MenuItem onClick={() => { handleClear(); setEditMenuAnchor(null); }}>
                <ListItemIcon><ClearIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Clear All</ListItemText>
              </MenuItem>
            </Menu>

            {/* Annotate menu */}
            <Button
              color="inherit"
              size="small"
              onClick={e => setAnnotateMenuAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.5 }}
            >
              Annotate
            </Button>
            <Menu anchorEl={annotateMenuAnchor} open={Boolean(annotateMenuAnchor)} onClose={() => setAnnotateMenuAnchor(null)}>
              <MenuItem onClick={() => { useSimulationStore.getState().toggleSimulation(); setAnnotateMenuAnchor(null); }}>
                <ListItemIcon><SimulationIcon color={useSimulationStore.getState().config.enabled ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>{useSimulationStore.getState().config.enabled ? 'Disable Ray Simulation' : 'Enable Ray Simulation'}</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { setAnnotationMode(annotationMode === 'line' ? 'none' : 'line'); setAnnotateMenuAnchor(null); }}>
                <ListItemIcon><LineIcon color={annotationMode === 'line' ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>Draw Line</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setAnnotationMode(annotationMode === 'arrow' ? 'none' : 'arrow'); setAnnotateMenuAnchor(null); }}>
                <ListItemIcon><ArrowIcon color={annotationMode === 'arrow' ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>Draw Arrow</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setAnnotationMode(annotationMode === 'optical-axis' ? 'none' : 'optical-axis'); setAnnotateMenuAnchor(null); }}>
                <ListItemIcon><OpticalAxisIcon color={annotationMode === 'optical-axis' ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>Optical Axis</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setAnnotationMode(annotationMode === 'text' ? 'none' : 'text'); setAnnotateMenuAnchor(null); }}>
                <ListItemIcon><TextIcon color={annotationMode === 'text' ? 'secondary' : 'inherit'} fontSize="small" /></ListItemIcon>
                <ListItemText>Add Text</ListItemText>
              </MenuItem>
            </Menu>

            {/* File menu */}
            <Button
              color="inherit"
              size="small"
              onClick={e => setFileMenuAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', minWidth: 0, px: 1.5 }}
            >
              File
            </Button>
            <Menu anchorEl={fileMenuAnchor} open={Boolean(fileMenuAnchor)} onClose={() => setFileMenuAnchor(null)}>
              <MenuItem onClick={() => { handleExport(); setFileMenuAnchor(null); }}>
                <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Save Layout As…</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { handleImport(); setFileMenuAnchor(null); }}>
                <ListItemIcon><ImportIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Import Layout</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { handleImportFromUrl(); setFileMenuAnchor(null); }}>
                <ListItemIcon><UrlIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Import from URL</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { handleGenerateShareableLink(); setFileMenuAnchor(null); }}>
                <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Generate Shareable Link</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { handleShare(); setFileMenuAnchor(null); }}>
                <ListItemIcon><EmailIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Share via Email</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { downloadScreenshot(); setFileMenuAnchor(null); }}>
                <ListItemIcon><ScreenshotIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Download Screenshot</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { handleExportSTL(); setFileMenuAnchor(null); }}>
                <ListItemIcon><STLIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Download STL Bundle</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setImSwitchWizardOpen(true); setFileMenuAnchor(null); }}>
                <ListItemIcon><ImSwitchIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Export ImSwitch Config</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { handleSaveToGitHub(); setFileMenuAnchor(null); }}>
                <ListItemIcon><GitHubIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Upload to Setup Browser</ListItemText>
              </MenuItem>
              {remoteSourcePath && (
                <MenuItem onClick={() => { handleOverwriteToGitHub(); setFileMenuAnchor(null); }}>
                  <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
                  <ListItemText>Save (Overwrite) → {remoteSourcePath}</ListItemText>
                </MenuItem>
              )}
            </Menu>
          </>
        )}

        {/* Help menu — always visible */}
        <Button
          color="inherit"
          size="small"
          onClick={e => setHelpMenuAnchor(e.currentTarget)}
          sx={{ textTransform: 'none', minWidth: 0, px: 1.5, ml: 'auto' }}
        >
          Help
        </Button>
        <Menu anchorEl={helpMenuAnchor} open={Boolean(helpMenuAnchor)} onClose={() => setHelpMenuAnchor(null)}>
          <MenuItem onClick={() => { handleHelp(); setHelpMenuAnchor(null); }}>
            <ListItemIcon><HelpIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Help / Tutorial</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { handleForum(); setHelpMenuAnchor(null); }}>
            <ListItemIcon><ForumIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Forum</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { handlePrivacy(); setHelpMenuAnchor(null); }}>
            <ListItemIcon><PrivacyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Privacy</ListItemText>
          </MenuItem>
        </Menu>

        {/* Title — right-aligned, hidden on small screens */}
        <Typography
          variant="h6"
          sx={{ display: { xs: 'none', lg: 'block' }, fontWeight: 400, fontSize: '1rem', ml: 2, whiteSpace: 'nowrap' }}
        >
          {isThreeD ? 'OptiKit — 3D Builder' : is2DEditor ? 'OptiKit - 2D Grid Builder' : 'Setup Browser'}
        </Typography>
      </MuiToolbar>
      
      {/* Feedback Dialog */}
      <FeedbackDialog 
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        trigger={feedbackTrigger}
      />
      
      {/* ImSwitch Configuration Wizard */}
      <ImSwitchConfigWizard 
        open={imSwitchWizardOpen}
        onClose={() => setImSwitchWizardOpen(false)}
      />
    </AppBar>
  );
};
import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Snackbar,
  Alert,
  TextField,
  Stack
} from '@mui/material';
import {
  Receipt as BOMIcon,
  Inventory as InventoryIcon,
  Delete as DeleteIcon,
  ShoppingCart as ShoppingCartIcon,
  Email as EmailIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';

export const BOMPanel: React.FC = () => {
  const { placedModules, modules, removeModule, exportData } = useAppStore();
  const [buyDialogOpen, setBuyDialogOpen] = React.useState(false);
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState('');
  const [snackbarSeverity, setSnackbarSeverity] = React.useState<'success' | 'error'>('success');
  
  // Customer information for purchase request
  const [customerName, setCustomerName] = React.useState('');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [nameError, setNameError] = React.useState(false);
  const [emailError, setEmailError] = React.useState(false);

  // Calculate BOM from placed modules
  const bomItems = React.useMemo(() => {
    const bomMap = new Map<string, { module: ModuleDefinition; count: number; totalPrice: number; moduleIds: string[] }>();
    let totalCubes = 0;
    
    placedModules.forEach(placedModule => {
      const moduleDefinition = modules.find(m => m.id === placedModule.moduleId);
      if (moduleDefinition) {
        const key = moduleDefinition.id;
        const existing = bomMap.get(key);
        const price = moduleDefinition.price || 0;
        
        // Count cubes for automatic puzzle piece calculation
        if (moduleDefinition.group === 'cubes' || moduleDefinition.name.toLowerCase().includes('cube')) {
          totalCubes += 1;
        }
        
        if (existing) {
          existing.count += 1;
          existing.totalPrice += price;
          existing.moduleIds.push(placedModule.id);
        } else {
          bomMap.set(key, {
            module: moduleDefinition,
            count: 1,
            totalPrice: price,
            moduleIds: [placedModule.id]
          });
        }
      }
    });
    
    // Add automatic puzzle pieces (cubes x2)
    if (totalCubes > 0) {
      const puzzlePieceCount = totalCubes * 2;
      
      // Find or create puzzle piece module definition
      let puzzleModule = modules.find(m => m.id === 'puzzle-piece' || m.name.toLowerCase().includes('puzzle'));
      if (!puzzleModule) {
        // Create a virtual puzzle piece module if it doesn't exist
        puzzleModule = {
          id: 'puzzle-piece',
          name: 'Puzzle Piece',
          group: 'connectors',
          color: '#95a5a6',
          footprint: { width: 1, height: 1 },
          thumbnail: '/icons/puzzle-piece.svg',
          price: 2 // Default price for puzzle pieces
        };
      }
      
      bomMap.set('auto-puzzle-pieces', {
        module: puzzleModule,
        count: puzzlePieceCount,
        totalPrice: (puzzleModule.price || 0) * puzzlePieceCount,
        moduleIds: [] // Auto-generated, no specific module IDs
      });
    }
    
    return Array.from(bomMap.values()).sort((a, b) => a.module.name.localeCompare(b.module.name));
  }, [placedModules, modules]);

  const totalCost = bomItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleDeleteModule = (moduleIds: string[], moduleName: string) => {
    // Don't allow deletion of auto-generated items
    if (moduleIds.length === 0) {
      alert(`${moduleName} items are automatically calculated based on cube count and cannot be deleted directly. Remove cubes to reduce the count.`);
      return;
    }
    
    if (confirm(`Delete all ${moduleName} modules from the layout?`)) {
      moduleIds.forEach(moduleId => removeModule(moduleId));
    }
  };

  // Email validation function
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate customer information
  const validateCustomerInfo = () => {
    let isValid = true;
    
    if (!customerName.trim()) {
      setNameError(true);
      isValid = false;
    } else {
      setNameError(false);
    }
    
    if (!customerEmail.trim() || !isValidEmail(customerEmail)) {
      setEmailError(true);
      isValid = false;
    } else {
      setEmailError(false);
    }
    
    return isValid;
  };

  const handleBuyConfiguration = async () => {
    // Validate customer information first
    if (!validateCustomerInfo()) {
      setSnackbarMessage('Please fill in all required fields with valid information.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    try {
      // Get current setup data
      const setupData = await exportData();
      
      // Create email with quotation details
      const subject = 'UC2 Configuration - Purchase Request';
      const body = `Dear UC2 Team,

I would like to request a quotation for the following UC2 configuration:

Customer Information:
- Name: ${customerName}
- Email: ${customerEmail}

Setup Details:
- Total components: ${bomItems.reduce((sum, item) => sum + item.count, 0)}
- Unique modules: ${bomItems.length}
- Estimated cost: $${totalCost.toFixed(2)}

Bill of Materials:
${bomItems.map(item => `${item.module.name} (${item.count}x) - $${item.totalPrice.toFixed(2)}`).join('\n')}

Configuration Data (JSON format):
${setupData}

Please provide me with:
- Final pricing and availability
- Shipping costs and delivery time
- Payment options

Best regards,
${customerName}`;

      // Create mailto link
      const mailtoLink = `mailto:sales@openuc2.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Open email client
      window.location.href = mailtoLink;
      
      // Clear form and close dialog
      setCustomerName('');
      setCustomerEmail('');
      setNameError(false);
      setEmailError(false);
      setBuyDialogOpen(false);
      
      setSnackbarMessage('Email client opened with quotation request!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      
    } catch (error) {
      console.error('Error creating purchase request:', error);
      setSnackbarMessage('Failed to create purchase request. Please try again.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleSendToMail = async () => {
    try {
      // Create email subject and body
      const subject = 'UC2 Configuration - Bill of Materials';
      const body = `Dear colleague,

I'm sharing my UC2 optical configuration with you:

Setup Summary:
- Total components: ${bomItems.reduce((sum, item) => sum + item.count, 0)}
- Unique modules: ${bomItems.length}
- Estimated cost: $${totalCost.toFixed(2)}

Bill of Materials:
${bomItems.map(item => `${item.module.name} (${item.count}x) - $${item.totalPrice.toFixed(2)}`).join('\n')}

You can create this configuration using the UC2 OptiKit configurator at:
https://openuc2.github.io/openUC2-OptiKit/configurator

Best regards`;

      // Create mailto link
      const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Open email client
      window.location.href = mailtoLink;
      
      setSnackbarMessage('Email client opened with BOM details');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error sending email:', error);
      setSnackbarMessage('Failed to open email client. Please try again.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleExportBOM = () => {
    try {
      // Create CSV header
      const headers = ['Module Name', 'Module ID', 'Quantity', 'Unit Price ($)', 'Total Price ($)', 'Type'];
      
      // Create CSV rows
      const rows = bomItems.map(item => [
        `"${item.module.name}"`,
        `"${item.module.id}"`,
        item.count.toString(),
        (item.module.price || 0).toFixed(2),
        item.totalPrice.toFixed(2),
        item.moduleIds.length === 0 ? 'Auto-calculated' : 'Placed'
      ]);
      
      // Add summary row
      rows.push([
        'TOTAL',
        '',
        bomItems.reduce((sum, item) => sum + item.count, 0).toString(),
        '',
        totalCost.toFixed(2),
        `${bomItems.length} unique modules`
      ]);
      
      // Combine headers and rows
      const csvContent = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `UC2_BOM_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setSnackbarMessage('BOM exported as CSV successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error exporting BOM:', error);
      setSnackbarMessage('Failed to export BOM. Please try again.');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BOMIcon />
        Bill of Materials
      </Typography>
      
      {bomItems.length === 0 ? (
        <Paper 
          sx={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: 'grey.50'
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <InventoryIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
            <Typography variant="body2" color="textSecondary">
              No modules placed yet
            </Typography>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
          {/* Summary */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', mb: 3 }}>
                <Box>
                  <Typography variant="h4" color="primary">
                    {bomItems.reduce((sum, item) => sum + item.count, 0)}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Total Items
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h4" color="secondary">
                    {bomItems.length}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Unique Modules
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="h4" color="success.main">
                    ${totalCost.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    Total Cost
                  </Typography>
                </Box>
              </Box>
              
              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ShoppingCartIcon />}
                  onClick={() => setBuyDialogOpen(true)}
                  disabled={bomItems.length === 0}
                  fullWidth
                >
                  Place Quotation
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<EmailIcon />}
                  onClick={handleSendToMail}
                  disabled={bomItems.length === 0}
                  fullWidth
                >
                  Send to Mail
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExportBOM}
                  disabled={bomItems.length === 0}
                  fullWidth
                  color="secondary"
                >
                  Export BOM
                </Button>
              </Box>
              
              {/* Purchase Information */}
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  <strong>Purchase Information:</strong>
                </Typography>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                  You can directly buy these components by sharing your setup via the shareable link 
                  or by saving your configuration and sharing it with <strong>sales@openuc2.com</strong>.
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                  Note: Final prices may vary. You can get a customized quotation based on your drawings and requirements.
                </Typography>
              </Box>
            </CardContent>
          </Card>
          
          {/* BOM Table */}
          <Paper sx={{ flex: 1, overflow: 'auto' }}>
            <TableContainer>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>Module</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Unit</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold' }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bomItems.map((item, index) => {
                    const unitPrice = item.module.price || 0;
                    const isAutoGenerated = item.moduleIds.length === 0;
                    return (
                      <TableRow key={index} hover sx={{ 
                        bgcolor: isAutoGenerated ? 'action.hover' : 'inherit' 
                      }}>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {item.module.name}
                              {isAutoGenerated && (
                                <Chip 
                                  label="Auto-calculated"
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ ml: 1, fontSize: '0.6rem', height: 16 }}
                                />
                              )}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {item.module.id}
                            </Typography>
                            {item.module.autodeskInventor && (
                              <Chip 
                                label={item.module.autodeskInventor}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 0.5, fontSize: '0.65rem', height: 18 }}
                              />
                            )}
                            {isAutoGenerated && (
                              <Typography variant="caption" color="primary" sx={{ display: 'block', fontStyle: 'italic' }}>
                                Based on {Math.floor(item.count / 2)} cube(s)
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={item.count} 
                            size="small" 
                            color="primary"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            ${unitPrice.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            ${item.totalPrice.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={`Delete all ${item.module.name} modules`}>
                            <IconButton 
                              size="small"
                              color="error"
                              onClick={() => handleDeleteModule(item.moduleIds, item.module.name)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}
      
      {/* Buy Configuration Dialog */}
      <Dialog open={buyDialogOpen} onClose={() => setBuyDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Place Quotation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Please provide your contact information and we'll process your quotation request.
          </DialogContentText>
          
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              autoFocus
              required
              label="Full Name"
              type="text"
              fullWidth
              variant="outlined"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              error={nameError}
              helperText={nameError ? "Please enter your full name" : ""}
              placeholder="Enter your full name"
            />
            
            <TextField
              required
              label="Email Address"
              type="email"
              fullWidth
              variant="outlined"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              error={emailError}
              helperText={emailError ? "Please enter a valid email address" : ""}
              placeholder="Enter your email address"
            />
          </Stack>
          
          <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Configuration Summary:</Typography>
            <Typography variant="body2">• Total items: {bomItems.reduce((sum, item) => sum + item.count, 0)}</Typography>
            <Typography variant="body2">• Unique modules: {bomItems.length}</Typography>
            <Typography variant="body2" color="primary">• Estimated cost: ${totalCost.toFixed(2)}</Typography>
          </Box>
          
          <DialogContentText>
            This will save your configuration as a quotation request to GitHub and open your email client 
            with a pre-filled message to sales@openuc2.com containing your contact details, quotation details, and a link to your configuration.
          </DialogContentText>
          
          <DialogContentText sx={{ mt: 1 }}>
            Note: Final pricing may vary based on current availability and shipping location.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBuyDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBuyConfiguration} variant="contained" color="primary">
            Send Quotation Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};
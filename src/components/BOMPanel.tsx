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
  Tooltip
} from '@mui/material';
import {
  Receipt as BOMIcon,
  Inventory as InventoryIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useAppStore } from '../stores/appStore';
import type { ModuleDefinition } from '../types';

export const BOMPanel: React.FC = () => {
  const { placedModules, modules, removeModule } = useAppStore();

  // Calculate BOM from placed modules
  const bomItems = React.useMemo(() => {
    const bomMap = new Map<string, { module: ModuleDefinition; count: number; totalPrice: number; moduleIds: string[] }>();
    
    placedModules.forEach(placedModule => {
      const moduleDefinition = modules.find(m => m.id === placedModule.moduleId);
      if (moduleDefinition) {
        const key = moduleDefinition.id;
        const existing = bomMap.get(key);
        const price = (moduleDefinition.defaultParams as Record<string, unknown>)?.price as number || 0;
        
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
    
    return Array.from(bomMap.values()).sort((a, b) => a.module.name.localeCompare(b.module.name));
  }, [placedModules, modules]);

  const totalCost = bomItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleDeleteModule = (moduleIds: string[], moduleName: string) => {
    if (confirm(`Delete all ${moduleName} modules from the layout?`)) {
      moduleIds.forEach(moduleId => removeModule(moduleId));
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
              <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
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
                    const unitPrice = (item.module.defaultParams as Record<string, unknown>)?.price as number || 0;
                    return (
                      <TableRow key={index} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {item.module.name}
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
    </Box>
  );
};
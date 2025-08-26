import React from 'react';
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
  Link,
} from '@mui/material';

export interface ModuleMetadata {
  name: string;
  group: string;
  color: string;
  description: string;
  price?: number;
  notification?: string;
  linkUrl?: string;
}

interface ModuleMetadataFormProps {
  metadata: ModuleMetadata;
  onMetadataChange: (metadata: ModuleMetadata) => void;
}

const moduleGroups = [
  'cubes',
  'lenses', 
  'fluorescence',
  'illumination',
  'detection',
  'positioning',
  'mechanics',
  'electronics',
  'custom',
];

const moduleColors = [
  { value: '#1e4670', label: 'Blue' },
  { value: '#7cc142', label: 'Green' },
  { value: '#dc3545', label: 'Red' },
  { value: '#4a9b8e', label: 'Teal' },
  { value: '#ff9800', label: 'Orange' },
  { value: '#9c27b0', label: 'Purple' },
  { value: '#607d8b', label: 'Blue Grey' },
  { value: '#795548', label: 'Brown' },
];

export const ModuleMetadataForm: React.FC<ModuleMetadataFormProps> = ({
  metadata,
  onMetadataChange
}) => {
  const handleChange = (field: keyof ModuleMetadata, value: string | number | undefined) => {
    onMetadataChange({
      ...metadata,
      [field]: value
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Module Details
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Provide information about your custom module.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>OpenUC2 Integration:</strong> You can specify links to existing parts that you'd like to integrate. 
          The openUC2 team will try their best to "cubify" the part so that it becomes compatible with the existing system.{' '}
          <Link href="https://github.com/openUC2/UC2-GIT" target="_blank" rel="noopener">
            Learn more about the UC2 system
          </Link>
        </Typography>
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <TextField
          fullWidth
          label="Module Name"
          value={metadata.name}
          onChange={(e) => handleChange('name', e.target.value)}
          required
          placeholder="e.g., Custom Lens Holder"
          helperText="A descriptive name for your module"
        />

        <FormControl fullWidth required>
          <InputLabel>Group</InputLabel>
          <Select
            value={metadata.group}
            onChange={(e) => handleChange('group', e.target.value)}
            label="Group"
          >
            {moduleGroups.map((group) => (
              <MenuItem key={group} value={group}>
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth required>
          <InputLabel>Color</InputLabel>
          <Select
            value={metadata.color}
            onChange={(e) => handleChange('color', e.target.value)}
            label="Color"
          >
            {moduleColors.map((color) => (
              <MenuItem key={color.value} value={color.value}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      backgroundColor: color.value,
                      border: '1px solid #ccc',
                      borderRadius: '3px',
                      mr: 2,
                    }}
                  />
                  {color.label}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Price"
          type="number"
          value={metadata.price || ''}
          onChange={(e) => handleChange('price', parseFloat(e.target.value) || undefined)}
          InputProps={{
            startAdornment: <InputAdornment position="start">€</InputAdornment>,
          }}
          placeholder="0.00"
          helperText="Optional price for the module"
        />
      </Box>

      <Box sx={{ mt: 3, display: 'grid', gap: 3 }}>
        <TextField
          fullWidth
          label="Part Link/URL"
          value={metadata.linkUrl || ''}
          onChange={(e) => handleChange('linkUrl', e.target.value)}
          placeholder="https://example.com/part-datasheet-or-store-link"
          helperText="Optional link to part specifications, store page, or documentation"
        />

        <TextField
          fullWidth
          label="Description"
          value={metadata.description}
          onChange={(e) => handleChange('description', e.target.value)}
          multiline
          rows={3}
          required
          placeholder="Describe what this module does and how it's used..."
          helperText="Detailed description of the module's function and purpose"
        />

        <TextField
          fullWidth
          label="Safety/Usage Note"
          value={metadata.notification || ''}
          onChange={(e) => handleChange('notification', e.target.value)}
          multiline
          rows={2}
          placeholder="Any important safety warnings or usage notes..."
          helperText="Optional warnings, requirements, or special instructions"
        />
      </Box>
    </Box>
  );
};
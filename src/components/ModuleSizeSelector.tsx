import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  alpha,
  TextField,
  Alert,
} from '@mui/material';

interface ModuleSizeSelectorProps {
  selectedSize: { width: number; height: number };
  onSizeSelect: (width: number, height: number) => void;
}

const commonSizes = [
  { width: 1, height: 1, label: '1×1' },
  { width: 2, height: 1, label: '2×1' },
  { width: 1, height: 2, label: '1×2' },
  { width: 2, height: 2, label: '2×2' },
  { width: 3, height: 1, label: '3×1' },
  { width: 1, height: 3, label: '1×3' },
  { width: 3, height: 2, label: '3×2' },
  { width: 2, height: 3, label: '2×3' },
  { width: 3, height: 3, label: '3×3' },
  { width: 4, height: 1, label: '4×1' },
  { width: 1, height: 4, label: '1×4' },
  { width: 5, height: 2, label: '5×2' },
];

export const ModuleSizeSelector: React.FC<ModuleSizeSelectorProps> = ({
  selectedSize,
  onSizeSelect
}) => {
  const [customWidth, setCustomWidth] = useState(selectedSize.width.toString());
  const [customHeight, setCustomHeight] = useState(selectedSize.height.toString());
  const [useCustomSize, setUseCustomSize] = useState(false);

  const handleCustomSizeChange = () => {
    const width = parseInt(customWidth, 10);
    const height = parseInt(customHeight, 10);
    
    if (width >= 1 && width <= 5 && height >= 1 && height <= 5) {
      onSizeSelect(width, height);
    }
  };

  const handlePresetSelect = (width: number, height: number) => {
    setUseCustomSize(false);
    setCustomWidth(width.toString());
    setCustomHeight(height.toString());
    onSizeSelect(width, height);
  };

  const isValidCustomSize = () => {
    const width = parseInt(customWidth, 10);
    const height = parseInt(customHeight, 10);
    return width >= 1 && width <= 5 && height >= 1 && height <= 5;
  };
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Module Size
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the footprint size for your custom module in grid units (1-5).
      </Typography>
      
      {/* Custom Size Input */}
      <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Custom Size
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          <TextField
            label="Width"
            type="number"
            size="small"
            value={customWidth}
            onChange={(e) => {
              setCustomWidth(e.target.value);
              setUseCustomSize(true);
            }}
            onBlur={handleCustomSizeChange}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSizeChange()}
            inputProps={{ min: 1, max: 5 }}
            sx={{ width: 100 }}
          />
          <Typography>×</Typography>
          <TextField
            label="Height"
            type="number"
            size="small"
            value={customHeight}
            onChange={(e) => {
              setCustomHeight(e.target.value);
              setUseCustomSize(true);
            }}
            onBlur={handleCustomSizeChange}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSizeChange()}
            inputProps={{ min: 1, max: 5 }}
            sx={{ width: 100 }}
          />
          <Typography variant="body2" color="text.secondary">
            grid units
          </Typography>
        </Box>
        {!isValidCustomSize() && (customWidth || customHeight) && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Please enter values between 1 and 5 for both width and height.
          </Alert>
        )}
      </Card>

      {/* Preset Sizes */}
      <Typography variant="subtitle1" gutterBottom>
        Common Sizes
      </Typography>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
        gap: 2,
      }}>
        {commonSizes.map((size) => {
          const isSelected = selectedSize.width === size.width && selectedSize.height === size.height && !useCustomSize;
          
          return (
            <Card
              key={`${size.width}x${size.height}`}
              variant="outlined"
              sx={{
                borderColor: isSelected ? 'primary.main' : 'divider',
                backgroundColor: isSelected ? alpha('#1976d2', 0.08) : 'background.paper',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: 1,
                }
              }}
            >
                <CardActionArea
                  onClick={() => handlePresetSelect(size.width, size.height)}
                  sx={{ p: 2 }}
                >
                  <CardContent sx={{ p: 0, textAlign: 'center' }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${size.width}, 1fr)`,
                        gap: '2px',
                        mb: 1,
                        justifyItems: 'center',
                      }}
                    >
                      {Array.from({ length: size.width * size.height }, (_, index) => (
                        <Box
                          key={index}
                          sx={{
                            width: 16,
                            height: 16,
                            backgroundColor: isSelected ? 'primary.main' : 'grey.300',
                            borderRadius: '2px',
                          }}
                        />
                      ))}
                    </Box>
                    <Typography
                      variant="body1"
                      fontWeight={isSelected ? 600 : 400}
                      color={isSelected ? 'primary.main' : 'text.primary'}
                    >
                      {size.label}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
          );
        })}
      </Box>
    </Box>
  );
};
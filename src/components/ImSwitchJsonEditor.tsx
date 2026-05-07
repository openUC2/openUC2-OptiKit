import React, { useEffect, useState } from 'react';
import { TextField, Box, Typography, Button, Alert, Stack } from '@mui/material';

interface ImSwitchJsonEditorProps {
  title: string;
  configKey: string; // e.g. "detectors", "autofocus"
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Editable JSON form for a single ImSwitch config section.
 * Users can modify the JSON text and apply changes back to the wizard state.
 */
export const ImSwitchJsonEditor: React.FC<ImSwitchJsonEditorProps> = ({
  title,
  configKey,
  value,
  onChange,
}) => {
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Re-sync local text when the upstream value changes (e.g. after merge)
  useEffect(() => {
    if (!dirty) {
      setJsonText(JSON.stringify(value ?? null, null, 2));
    }
  }, [value, dirty]);

  const handleApply = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setError(null);
      setDirty(false);
      onChange(configKey, parsed);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  const handleReset = () => {
    setJsonText(JSON.stringify(value ?? null, null, 2));
    setError(null);
    setDirty(false);
  };

  return (
    <Box sx={{ mb: 2 }}>
      {title && (
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}
      <TextField
        multiline
        fullWidth
        minRows={4}
        maxRows={20}
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value);
          setDirty(true);
        }}
        slotProps={{
          input: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } },
        }}
      />
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="small" variant="contained" disabled={!dirty} onClick={handleApply}>
          Apply
        </Button>
        <Button size="small" disabled={!dirty} onClick={handleReset}>
          Reset
        </Button>
      </Stack>
    </Box>
  );
};

export default ImSwitchJsonEditor;

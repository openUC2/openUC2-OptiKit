import React, { useEffect, useState } from 'react';
import {
  TextField, Box, Typography, Button, Alert, Stack,
  Checkbox, FormControlLabel,
} from '@mui/material';

interface ImSwitchJsonEditorProps {
  title: string;
  configKey: string; // e.g. "detectors", "autofocus"
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  /** When true, renders per-field inputs instead of a raw textarea.
   *  Only values can be edited — keys cannot be added or removed. */
  schemaOnly?: boolean;
}

/** A single primitive value field rendered inline. */
const PrimitiveField: React.FC<{
  fieldKey: string;
  value: unknown;
  onValueChange: (v: unknown) => void;
}> = ({ fieldKey, value, onValueChange }) => {
  if (typeof value === 'boolean') {
    return (
      <FormControlLabel
        control={
          <Checkbox
            checked={value}
            size="small"
            onChange={e => onValueChange(e.target.checked)}
          />
        }
        label={<Typography variant="caption">{fieldKey}</Typography>}
        sx={{ ml: 0 }}
      />
    );
  }
  const isNumber = typeof value === 'number';
  return (
    <TextField
      label={fieldKey}
      size="small"
      value={value === null || value === undefined ? '' : String(value)}
      onChange={e => {
        const raw = e.target.value;
        if (isNumber) {
          const n = parseFloat(raw);
          onValueChange(isNaN(n) ? raw : n);
        } else {
          onValueChange(raw);
        }
      }}
      sx={{ mb: 1 }}
      fullWidth
      slotProps={{ input: { sx: { fontSize: '0.8rem' } } }}
    />
  );
};

/** Render a flat-object (one-level deep) as individual labeled fields.
 *  Nested objects fall back to a compact monospace textarea. */
const StructuredObjectEditor: React.FC<{
  obj: Record<string, unknown>;
  path: string;
  onObjectChange: (updated: Record<string, unknown>) => void;
}> = ({ obj, onObjectChange }) => {
  const handleFieldChange = (key: string, newVal: unknown) => {
    onObjectChange({ ...obj, [key]: newVal });
  };

  return (
    <Box>
      {Object.entries(obj).map(([k, v]) => {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          // Nested object: show as a compact sub-editor
          return (
            <Box key={k} sx={{ mb: 1, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{k}</Typography>
              <StructuredObjectEditor
                obj={v as Record<string, unknown>}
                path={k}
                onObjectChange={nested => handleFieldChange(k, nested)}
              />
            </Box>
          );
        }
        if (Array.isArray(v)) {
          // Array: show as compact JSON textarea
          return (
            <ArrayField key={k} fieldKey={k} value={v} onValueChange={newVal => handleFieldChange(k, newVal)} />
          );
        }
        return (
          <PrimitiveField
            key={k}
            fieldKey={k}
            value={v}
            onValueChange={newVal => handleFieldChange(k, newVal)}
          />
        );
      })}
    </Box>
  );
};

/** Array field: compact single-line JSON editor, no structural changes. */
const ArrayField: React.FC<{
  fieldKey: string;
  value: unknown[];
  onValueChange: (v: unknown[]) => void;
}> = ({ fieldKey, value, onValueChange }) => {
  const [text, setText] = useState(() => JSON.stringify(value));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setText(JSON.stringify(value)); }, [value]);

  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption">{fieldKey}</Typography>
      <TextField
        size="small"
        fullWidth
        value={text}
        error={!!err}
        helperText={err ?? undefined}
        onChange={e => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            if (Array.isArray(parsed)) { setErr(null); onValueChange(parsed); }
            else setErr('Must be an array');
          } catch { setErr('Invalid JSON'); }
        }}
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.75rem' } } }}
      />
    </Box>
  );
};

/**
 * Editable JSON form for a single ImSwitch config section.
 *
 * In default mode: free-text monospace textarea.
 * In schemaOnly mode: per-field inputs — only values can be edited,
 *   keys cannot be added or removed.
 */
export const ImSwitchJsonEditor: React.FC<ImSwitchJsonEditorProps> = ({
  title,
  configKey,
  value,
  onChange,
  schemaOnly = false,
}) => {
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Structured editor state (separate from raw text)
  const [structuredValue, setStructuredValue] = useState<unknown>(value);

  // Re-sync local state when the upstream value changes (e.g. after merge)
  useEffect(() => {
    if (!dirty) {
      setJsonText(JSON.stringify(value ?? null, null, 2));
      setStructuredValue(value);
    }
  }, [value, dirty]);

  /* ---------- schemaOnly (structured) mode ---------- */
  if (schemaOnly && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const handleStructuredChange = (updated: Record<string, unknown>) => {
      setStructuredValue(updated);
      setDirty(true);
      onChange(configKey, updated);
    };

    return (
      <Box sx={{ mb: 2 }}>
        {title && <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>}
        <StructuredObjectEditor
          obj={structuredValue as Record<string, unknown>}
          path=""
          onObjectChange={handleStructuredChange}
        />
        {dirty && (
          <Button
            size="small"
            variant="text"
            color="secondary"
            onClick={() => { setStructuredValue(value); setDirty(false); onChange(configKey, value); }}
          >
            Reset
          </Button>
        )}
      </Box>
    );
  }

  /* ---------- free-text (raw JSON) mode ---------- */
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

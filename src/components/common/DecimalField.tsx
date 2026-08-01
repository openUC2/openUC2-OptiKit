/**
 * WP-92: the one number-entry field. Physical quantities (mm, degrees, µm)
 * are typed here through a plain text input with `inputMode="decimal"` — NOT
 * `type="number"`, which silently discards a German locale's decimal comma
 * before we ever see it. Parsing goes through `parseDecimal` ("0,15" ≡
 * "0.15"); values round-trip as floats.
 *
 * While focused the field holds a local draft string so intermediate states
 * ("0," / "-") don't snap back; every valid prefix commits live, and blur
 * re-syncs the display to the committed value.
 */

import { useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';
import { parseDecimal } from '../../utils/parseDecimal';

type DecimalFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  /** Called with the parsed value on every valid keystroke; null = cleared. */
  onValue: (value: number | null) => void;
};

export function DecimalField({ value, onValue, onFocus, onBlur, slotProps, ...rest }: DecimalFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const htmlInput = (slotProps?.htmlInput ?? {}) as Record<string, unknown>;
  return (
    <TextField
      {...rest}
      value={draft ?? (value ?? '')}
      onFocus={e => {
        setDraft(value === null ? '' : String(value));
        onFocus?.(e);
      }}
      onChange={e => {
        const text = e.target.value;
        setDraft(text);
        if (text.trim() === '') {
          onValue(null);
          return;
        }
        const parsed = parseDecimal(text);
        if (parsed !== null) onValue(parsed);
      }}
      onBlur={e => {
        setDraft(null);
        onBlur?.(e);
      }}
      slotProps={{ ...slotProps, htmlInput: { inputMode: 'decimal', ...htmlInput } }}
    />
  );
}

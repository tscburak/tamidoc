import { useState } from 'react';
import { TextInput } from './TextInput';
import { cn } from '../../lib/cn';

export interface ColorPickerProps {
  value?: string;
  onChange: (color: string) => void;
  label?: string;
  error?: string | false;
  description?: string;
}

/**
 * Color picker with native color input and hex text field.
 * Designed to work with react-hook-form Controller:
 *   <Controller
 *     name="brandColor"
 *     control={control}
 *     render={({ field }) => <ColorPicker {...field} />}
 *   />
 */
export function ColorPicker({
  value = '#C65D2E',
  onChange,
  label,
  error,
  description,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  const handleColorChange = (newColor: string) => {
    onChange(newColor);
    setHexInput(newColor);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setHexInput(hex);

    // Validate and update if valid hex
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex);
    }
  };

  const handleBlur = () => {
    // Reset to current valid value on blur
    setHexInput(value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
          {label}
        </label>
      )}
      <div className="flex items-center gap-3">
        {/* Native color picker */}
        <div className="relative h-10 w-16 flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => handleColorChange(e.target.value)}
            className={cn(
              'h-full w-full cursor-pointer rounded-md border-2 border-transparent',
              'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
              'overflow-hidden p-0.5',
            )}
          />
          {/* Preview swatch */}
          <div
            className="pointer-events-none absolute inset-1 rounded-sm"
            style={{ backgroundColor: value }}
          />
        </div>

        {/* Hex text input */}
        <div className="flex-1">
          <TextInput
            type="text"
            value={hexInput}
            onChange={handleHexChange}
            onBlur={handleBlur}
            placeholder="#C65D2E"
            error={error}
            maxLength={7}
          />
        </div>
      </div>
      {!error && description && (
        <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}
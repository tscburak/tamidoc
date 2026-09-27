import { type ComponentProps, useId } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { cn } from '../../lib/cn';

export interface SelectProps extends ComponentProps<'select'> {
  label?: string;
  error?: string | false;
  description?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

/**
 * Styled select. The native arrow is hidden and replaced with a custom chevron
 * pinned to the right inside a relative wrapper, so the control's box stays
 * symmetric and the chevron never collides with content. Forwards every native
 * prop (incl. `ref`), so `react-hook-form`'s `register()` can be spread directly:
 *   <Select label="Industry" options={industryOptions} {...register('industry')} />
 */
export function Select({
  label,
  error,
  description,
  options,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-stone-700 dark:text-stone-200"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'h-10 w-full appearance-none rounded-md border bg-white pl-3 pr-9 text-sm text-stone-800 transition-colors',
            'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'dark:bg-stone-900 dark:text-stone-100',
            hasError
              ? 'border-red-500 dark:border-red-500'
              : 'border-stone-300 dark:border-stone-600',
            className,
          )}
          aria-invalid={hasError || undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <IconChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
      </div>
      {hasError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        description && <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}
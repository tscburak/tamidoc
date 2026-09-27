import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';

export interface TextInputProps extends Omit<ComponentProps<'input'>, 'size'> {
  label?: string;
  error?: string | false;
  description?: string;
  leftSection?: ReactNode;
}

/**
 * Text input with optional label / error / icon. Forwards every native prop
 * (incl. `ref`), so `react-hook-form`'s `register()` can be spread directly:
 *   <TextInput label="Email" {...register('email')} />
 */
export function TextInput({
  label,
  error,
  description,
  leftSection,
  className,
  id,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasError = Boolean(error);
  const isDisabled = Boolean(props.disabled);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className={cn(
            'text-sm font-medium text-stone-700 dark:text-stone-200',
            isDisabled && 'text-stone-400 dark:text-stone-500',
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftSection && (
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400',
              isDisabled && 'text-stone-300 dark:text-stone-600',
            )}
          >
            {leftSection}
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'h-10 w-full rounded-md border bg-white px-3 text-sm text-stone-800 transition-colors',
            'placeholder:text-stone-400',
            'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
            'disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 disabled:placeholder:text-stone-400',
            'dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500',
            'dark:disabled:border-stone-700 dark:disabled:bg-stone-800 dark:disabled:text-stone-500 dark:disabled:placeholder:text-stone-600',
            leftSection && 'pl-10',
            hasError
              ? 'border-red-500 dark:border-red-500'
              : 'border-stone-300 dark:border-stone-600',
            className,
          )}
          aria-invalid={hasError || undefined}
          {...props}
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

import { type ComponentProps, useId } from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends ComponentProps<'textarea'> {
  label?: string;
  error?: string | false;
  description?: string;
}

/**
 * Textarea with optional label / error / description. Forwards every native prop
 * (incl. `ref`), so `react-hook-form`'s `register()` can be spread directly:
 *   <Textarea label="Description" {...register('description')} />
 */
export function Textarea({
  label,
  error,
  description,
  className,
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-stone-700 dark:text-stone-200"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={cn(
          'w-full rounded-md border bg-white px-3 py-2 text-sm text-stone-800 transition-colors',
          'placeholder:text-stone-400',
          'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500',
          'resize-y',
          hasError
            ? 'border-red-500 dark:border-red-500'
            : 'border-stone-300 dark:border-stone-600',
          className,
        )}
        aria-invalid={hasError || undefined}
        {...props}
      />
      {hasError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        description && <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}
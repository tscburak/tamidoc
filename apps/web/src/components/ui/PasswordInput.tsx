import { useState, type ComponentProps, type ReactNode, useId } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { cn } from '../../lib/cn';

export interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'size' | 'type'> {
  label?: string;
  error?: string | false;
  description?: string;
  leftSection?: ReactNode;
}

export function PasswordInput({
  label,
  error,
  description,
  leftSection,
  className,
  id,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-stone-700 dark:text-stone-200"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftSection && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
            {leftSection}
          </span>
        )}
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={cn(
            'h-10 w-full rounded-md border bg-white px-3 text-sm text-stone-800 transition-colors',
            'placeholder:text-stone-400',
            'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500',
            leftSection && 'pl-10',
            'pr-10',
            hasError
              ? 'border-red-500 dark:border-red-500'
              : 'border-stone-300 dark:border-stone-600',
            className,
          )}
          aria-invalid={hasError || undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors hover:text-stone-600 dark:hover:text-stone-300"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
      {hasError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        description && <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
      )}
    </div>
  );
}

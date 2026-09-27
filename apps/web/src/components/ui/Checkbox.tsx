import { type ComponentProps, type ReactNode, useId } from 'react';
import { IconCheck } from '@tabler/icons-react';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'size'> {
  label?: ReactNode;
  description?: string;
  error?: string | false;
}

export function Checkbox({ label, description, error, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex items-start gap-2">
        <input id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-stone-300 bg-white transition-colors peer-checked:border-orange-600 peer-checked:bg-orange-600 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/50 dark:border-stone-600 dark:bg-stone-900" />
        <IconCheck
          size={12}
          className="pointer-events-none absolute left-0 top-0.5 flex size-4 items-center justify-center p-px text-white opacity-0 transition-opacity peer-checked:opacity-100"
        />
        {label && (
          <label
            htmlFor={inputId}
            className="cursor-pointer text-sm leading-5 text-stone-700 dark:text-stone-200"
          >
            {label}
          </label>
        )}
      </div>
      {error ? (
        <p className="pl-6 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : (
        description && (
          <p className="pl-6 text-xs text-stone-500 dark:text-stone-400">{description}</p>
        )
      )}
    </div>
  );
}

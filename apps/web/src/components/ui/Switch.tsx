import { type ComponentProps, type ReactNode, useId } from 'react';

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'size'> {
  label?: ReactNode;
  description?: string;
}

/** Toggle switch. Works controlled (`checked`) or uncontrolled (`defaultChecked`). */
export function Switch({ label, description, id, ...props }: SwitchProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        {label && (
          <label htmlFor={inputId} className="cursor-pointer text-sm font-medium text-stone-700 dark:text-stone-200">{label}</label>
        )}
        {description && (
          <span className="text-xs text-stone-500 dark:text-stone-400">{description}</span>
        )}
      </div>
      <label htmlFor={inputId} className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input id={inputId} type="checkbox" className="peer sr-only" {...props} />
        <span className="h-6 w-11 rounded-full bg-stone-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-orange-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/50 dark:bg-stone-600" />
      </label>
    </div>
  );
}
